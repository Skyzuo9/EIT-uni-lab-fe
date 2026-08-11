import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { resolveAgentTarget } from './agent-payload.mjs'

const STARTUP_TIMEOUT_MS = 30_000

export async function verifyAgentRuntime(options) {
  const target = resolveAgentTarget(options.platform, options.architecture)
  const root = await mkdtemp(path.join(os.tmpdir(), 'unilab-agent-smoke-'))
  const workspace = path.join(root, 'workspace')
  const dataDir = path.join(root, 'data')
  const logDir = path.join(root, 'logs')
  await Promise.all([
    mkdir(workspace, { recursive: true }),
    mkdir(logDir, { recursive: true })
  ])
  const core = options.executable ?? path.join(
    options.resources,
    'bundled-aioncore',
    target.directory,
    target.executable
  )
  const port = await reserveLoopbackPort()
  let output = ''
  let launchError = null
  const child = spawn(core, [
    '--host', '127.0.0.1',
    '--port', String(port),
    '--data-dir', dataDir,
    '--log-dir', logDir,
    '--work-dir', workspace,
    '--app-version', '2.1.52',
    '--managed-resources-mode', 'bundled',
    '--local',
    '--identity-mode', 'local'
  ], {
    cwd: workspace,
    env: {
      ...process.env,
      AIONUI_CACHE_DIR: path.join(dataDir, 'cache'),
      AIONUI_BUNDLED_MANAGED_RESOURCES: path.join(
        options.resources,
        'bundled-aioncore',
        target.directory,
        'managed-resources'
      ),
      AIONUI_WORK_DIR: workspace,
      AIONUI_LOG_DIR: logDir
    },
    detached: options.platform !== 'win32',
    shell: false,
    windowsHide: true
  })
  child.stdout.on('data', chunk => {
    output = appendBounded(output, chunk)
  })
  child.stderr.on('data', chunk => {
    output = appendBounded(output, chunk)
  })
  child.once('error', error => {
    launchError = error
  })

  try {
    await waitForHealth(port, child, () => launchError)
    const settings = await fetch(
      `http://127.0.0.1:${port}/api/settings/client?keys=${encodeURIComponent('guid.lastAssistantId')}`,
      { signal: AbortSignal.timeout(2_000) }
    )
    if (!settings.ok) {
      throw new Error(`Agent managed-local API 返回 HTTP ${settings.status}`)
    }
    console.log(
      `打包前 Agent runtime smoke 通过：${target.directory}，端口 ${port}`
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const runtimeLogs = await readRuntimeLogs(logDir)
    throw new Error(`${message}\n${output}\n${runtimeLogs}`)
  } finally {
    await stopProcessTree(child, options.platform)
    await rm(root, { recursive: true, force: true })
  }
}

async function readRuntimeLogs(logDir) {
  try {
    const files = (await readdir(logDir, { withFileTypes: true }))
      .filter(entry => entry.isFile())
      .map(entry => entry.name)
      .sort()
    const chunks = []
    for (const file of files) {
      const contents = await readFile(path.join(logDir, file), 'utf8')
      chunks.push(`[${file}]\n${contents.slice(-16_384)}`)
    }
    return chunks.join('\n')
  } catch (error) {
    return `[agent-log-read-failed] ${error instanceof Error ? error.message : String(error)}`
  }
}

async function reserveLoopbackPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen({ host: '127.0.0.1', port: 0 }, () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close(error => error ? reject(error) : resolve(port))
    })
  })
}

async function waitForHealth(port, child, readLaunchError) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS
  while (Date.now() < deadline) {
    const launchError = readLaunchError()
    if (launchError) throw launchError
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(
        `Agent runtime 提前退出：code=${String(child.exitCode)} signal=${String(child.signalCode)}`
      )
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, {
        signal: AbortSignal.timeout(1_000)
      })
      if (response.ok) return
    } catch {
      // Aioncore briefly refuses connections while migrations run.
    }
    await delay(100)
  }
  throw new Error(`Agent runtime 在 ${STARTUP_TIMEOUT_MS / 1000} 秒内未就绪`)
}

async function stopProcessTree(child, platform) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return
  try {
    if (platform !== 'win32') process.kill(-child.pid, 'SIGTERM')
    else child.kill('SIGTERM')
  } catch {
    child.kill('SIGTERM')
  }
  await Promise.race([
    new Promise(resolve => child.once('close', resolve)),
    delay(5_000)
  ])
  if (child.exitCode !== null || child.signalCode !== null) return
  try {
    if (platform !== 'win32') process.kill(-child.pid, 'SIGKILL')
    else child.kill('SIGKILL')
  } catch {
    child.kill('SIGKILL')
  }
}

function appendBounded(existing, chunk) {
  return `${existing}${String(chunk)}`.slice(-16_384)
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const readArgument = name => {
    const index = process.argv.indexOf(name)
    return index >= 0 ? process.argv[index + 1] : null
  }
  const resources = readArgument('--resources')
  const executable = readArgument('--executable')
  const platform = readArgument('--platform') ?? process.platform
  const architecture = readArgument('--architecture') ?? process.arch
  if (!resources) {
    console.error('用法：verify-agent-runtime.mjs --resources /path/to/agent-runtime')
    process.exitCode = 1
  } else {
    try {
      await verifyAgentRuntime({
        resources,
        executable,
        platform,
        architecture
      })
    } catch (error) {
      console.error(error instanceof Error ? error.message : error)
      process.exitCode = 1
    }
  }
}
