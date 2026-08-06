import { spawn as spawnChild, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import type { LocalRuntimeLaunchConfig } from '../shared/localRuntime'

const temporaryDirectories: string[] = []
const temporaryProcesses: ChildProcess[] = []

export interface LocalRuntimeTestFixture {
  config: LocalRuntimeLaunchConfig
  graphPath: string
  osRoot: string
  python: string
  simulatorRoot: string
  szlabRoot: string
  unilab: string
}

/**
 * 清理测试创建的残留监听进程与临时目录。
 *
 * @returns 全部子进程退出且目录移除后完成。
 * @throws 文件系统清理错误会透传，进程已退出按成功处理。
 * @safety 只清理本模块登记的临时身份，避免端口状态污染后续用例。
 */
export async function cleanupLocalRuntimeTestArtifacts(): Promise<void> {
  await Promise.all(temporaryProcesses.splice(0).map(stopTemporaryProcess))
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, {
      recursive: true,
      force: true
    }))
  )
}

/**
 * 构造同时包含 OS、领域设备包、Conda 可执行文件和 PLC-Sim 的测试目录。
 *
 * @param layout 领域设备包使用 packages 或当前根级目录布局。
 * @param platform 需要模拟的 Conda 可执行文件平台布局。
 * @returns 可直接提交给启动计划解析器的路径配置和对应测试路径。
 * @throws 临时目录或测试文件创建失败时透传文件系统错误。
 * @safety 所有写入均限制在登记的系统临时目录内。
 */
export async function createLocalRuntimeTestFixture(
  layout: 'packages' | 'root',
  platform: NodeJS.Platform = 'linux'
): Promise<LocalRuntimeTestFixture> {
  const fixturePrefix = platform === 'win32'
    ? 'unilab windows runtime-'
    : 'unilab-runtime-manager-'
  const root = await mkdtemp(join(tmpdir(), fixturePrefix))
  temporaryDirectories.push(root)
  const osRoot = join(root, 'Uni-Lab-OS')
  const szlabRoot = join(root, 'Uni-Lab-SZLab')
  const environmentRoot = join(root, 'envs', 'unilab')
  const simulatorRoot = join(root, 'PLC-Sim')
  const graphPath = join(szlabRoot, 'deployment', 'graphs', 'device.json')
  const python = platform === 'win32'
    ? join(environmentRoot, 'python.exe')
    : join(environmentRoot, 'bin', 'python')
  const unilab = platform === 'win32'
    ? join(environmentRoot, 'Scripts', 'unilab.exe')
    : join(environmentRoot, 'bin', 'unilab')

  await Promise.all([
    mkdir(osRoot, { recursive: true }),
    mkdir(join(osRoot, 'unilabos', 'config'), { recursive: true }),
    mkdir(join(szlabRoot, 'deployment', 'graphs'), { recursive: true }),
    mkdir(dirname(python), { recursive: true }),
    mkdir(dirname(unilab), { recursive: true }),
    mkdir(join(simulatorRoot, 'OpcUaSim', 'gui'), { recursive: true })
  ])
  await Promise.all([
    writeFile(graphPath, '{}'),
    writeFile(join(osRoot, 'unilabos', 'config', 'example_config.py'), ''),
    writeFile(join(szlabRoot, 'deployment', 'local_config.py'), ''),
    writeFile(join(simulatorRoot, 'OpcUaSim', 'gui', 'backend.py'), ''),
    writeFile(python, ''),
    writeFile(unilab, '')
  ])
  await Promise.all([chmod(python, 0o755), chmod(unilab, 0o755)])

  if (layout === 'packages') {
    await mkdir(
      join(szlabRoot, 'packages', 'szlab_poly_studio', 'szlab_poly_studio'),
      { recursive: true }
    )
    await writeFile(
      join(szlabRoot, 'packages', 'szlab_poly_studio', 'package.yaml'),
      ''
    )
  } else {
    await mkdir(
      join(szlabRoot, 'szlab_poly_studio', 'profiles', 'default'),
      { recursive: true }
    )
    await writeFile(
      join(
        szlabRoot,
        'szlab_poly_studio',
        'profiles',
        'default',
        'package.yaml'
      ),
      ''
    )
  }

  return {
    config: {
      graphPath,
      osProjectPath: osRoot,
      szlabProjectPath: szlabRoot,
      environmentPath: environmentRoot,
      simulatorProjectPath: simulatorRoot,
      edgeCommandMode: 'generated',
      customEdgeCommand: {
        executable: '',
        workingDirectory: '',
        args: [],
        environment: []
      }
    },
    graphPath,
    osRoot,
    python,
    simulatorRoot,
    szlabRoot,
    unilab
  }
}

/**
 * 写入一个可执行的 Node.js PLC-Sim 替身。
 *
 * @param executablePath Conda Python 占位路径，测试中作为启动命令执行。
 * @returns 文件写入并授权完成后结束。
 * @throws 文件写入或授权失败时透传错误。
 * @safety 只写入测试夹具登记的占位路径。
 */
export async function writeFakeSimulatorExecutable(
  executablePath: string
): Promise<void> {
  await writeFile(executablePath, [
    '#!/usr/bin/env node',
    "const { createServer } = require('node:net')",
    "const portIndex = process.argv.indexOf('--port')",
    'const port = Number(process.argv[portIndex + 1])',
    'const server = createServer()',
    "server.listen(port, '127.0.0.1')",
    "process.on('SIGTERM', () => server.close(() => process.exit(0)))"
  ].join('\n'))
  await chmod(executablePath, 0o755)
}

/**
 * 写入一个同时提供健康检查、设备目录和 HostLink 监听的 Edge 替身。
 *
 * @param executablePath Conda unilab 占位路径，测试中作为启动命令执行。
 * @returns 文件写入并授权完成后结束。
 * @throws 文件写入或授权失败时透传错误。
 * @safety 只写入测试夹具登记的占位路径。
 */
export async function writeFakeEdgeExecutable(
  executablePath: string
): Promise<void> {
  await writeFile(executablePath, [
    '#!/usr/bin/env node',
    "const { createServer: createHttpServer } = require('node:http')",
    "const { createServer: createTcpServer } = require('node:net')",
    "const portIndex = process.argv.indexOf('--port')",
    'const httpPort = Number(process.argv[portIndex + 1])',
    'const hostLinkPort = Number(process.env.UNILABOS_HOSTLINKCONFIG_PORT)',
    'const httpServer = createHttpServer((request, response) => {',
    "  response.setHeader('content-type', 'application/json')",
    "  const payload = request.url === '/api/v1/health'",
    "    ? { status: 'ok' }",
    "    : { code: 0, data: { schemaVersion: 'device-catalog/v1', items: [] } }",
    '  response.end(JSON.stringify(payload))',
    '})',
    'const hostLinkServer = createTcpServer()',
    "httpServer.listen(httpPort, '127.0.0.1')",
    "hostLinkServer.listen(hostLinkPort, '127.0.0.1')",
    "process.on('SIGTERM', () => process.exit(0))"
  ].join('\n'))
  await chmod(executablePath, 0o755)
}

/**
 * 启动独立 TCP 残留监听进程并等待其真正占用端口。
 *
 * @param port 要模拟被上一轮进程占用的本地 TCP 端口；0 由系统分配。
 * @returns 已进入监听状态的子进程及其真实端口。
 * @throws 子进程无法启动或未报告端口时抛出错误。
 * @safety 只绑定回环地址，进程身份会登记供测试后清理。
 */
export async function startTemporaryListener(port = 0): Promise<{
  child: ChildProcess
  port: number
}> {
  const child = spawnChild(process.execPath, [
    '-e',
    [
      "const { createServer } = require('node:net')",
      'const server = createServer()',
      `server.listen(${port}, '127.0.0.1', () => process.stdout.write(String(server.address().port) + '\\n'))`
    ].join(';')
  ], {
    stdio: ['ignore', 'pipe', 'pipe']
  })
  temporaryProcesses.push(child)
  const [portOutput] = await once(child.stdout!, 'data')
  return {
    child,
    port: Number(String(portOutput).trim())
  }
}

/**
 * 强制结束仍存活的测试子进程，并等待其退出事件。
 *
 * @param child 测试创建的临时监听或模拟器进程。
 * @returns 子进程已退出或原本已经结束时完成。
 * @throws 不传播 kill 的布尔结果；退出事件错误由 Node.js 处理。
 * @safety 只接收本模块登记的临时进程引用。
 */
async function stopTemporaryProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return
  const closed = once(child, 'close')
  child.kill('SIGKILL')
  await closed
}
