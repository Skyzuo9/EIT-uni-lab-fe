import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createWriteStream, mkdirSync } from 'node:fs'
import { createServer } from 'node:net'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

let preview

/** 启动命令并把标准输出同时保存到固定证据日志。 */
function startLogged(command, args, environment, log, detached = false) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: environment,
    detached,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  child.previewOutput = ''
  child.stdout?.on('data', (chunk) => {
    child.previewOutput += chunk.toString()
    process.stdout.write(chunk)
    log.write(chunk)
  })
  child.stderr?.on('data', (chunk) => {
    child.previewOutput += chunk.toString()
    process.stderr.write(chunk)
    log.write(chunk)
  })
  return child
}

/** 等待短命令退出并返回 shell 退出码。 */
async function waitForCommand(child) {
  const [code] = await once(child, 'exit')
  return code ?? 1
}

/** 分配当前 F07 前端候选独占的随机回环端口。 */
async function availablePort() {
  const server = createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') {
    server.close()
    throw new Error('无法读取 F07 前端验收端口')
  }
  const port = address.port
  server.close()
  await once(server, 'close')
  return port
}

/** 等待严格端口上的当前候选预览服务就绪。 */
async function waitForPreview(url, child) {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error('F07 前端预览在就绪前退出')
    }
    try {
      const response = await fetch(url)
      if (response.ok && child.previewOutput.includes(`${url}/`)) return
    } catch {
      // Vite 尚未完成监听，继续等待同一明确子进程。
    }
    await delay(100)
  }
  throw new Error('F07 前端预览 60 秒内未就绪')
}

/** 终止本包装器拥有的预览进程组。 */
async function stopPreview() {
  if (!preview?.pid || preview.exitCode !== null || preview.signalCode !== null) {
    return
  }
  try {
    process.kill(-preview.pid, 'SIGTERM')
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ESRCH')) {
      throw error
    }
  }
  await Promise.race([once(preview, 'exit'), delay(10_000)])
  if (preview.exitCode === null && preview.signalCode === null) {
    process.kill(-preview.pid, 'SIGKILL')
    await once(preview, 'exit')
  }
}

/** 强制构建、随机端口预览并运行唯一 F07 真实 OS 门禁。 */
async function main() {
  const artifactDirectory = resolve(
    process.env.UNILAB_F07_E2E_ARTIFACT_DIR ||
      '../e2e-artifacts/f07-task-input'
  )
  mkdirSync(artifactDirectory, { recursive: true })
  const log = createWriteStream(resolve(artifactDirectory, 'frontend-startup.log'))
  await once(log, 'open')
  try {
    const build = startLogged('pnpm', ['build:web'], process.env, log)
    const buildCode = await waitForCommand(build)
    if (buildCode !== 0) throw new Error(`F07 前端构建失败: ${buildCode}`)
    const port = await availablePort()
    const url = `http://127.0.0.1:${port}`
    preview = startLogged(
      'pnpm',
      [
        '--filter', '@unilab/kernel-web', 'preview',
        '--host', '127.0.0.1', '--port', String(port), '--strictPort'
      ],
      process.env,
      log,
      true
    )
    await waitForPreview(url, preview)
    const test = startLogged(
      'pnpm',
      [
        'exec', 'playwright', 'test',
        'e2e/workflow-task-input-f07-real-os.spec.ts',
        '--workers=1', ...process.argv.slice(2)
      ],
      { ...process.env, UNILAB_FE_E2E_URL: url },
      log
    )
    process.exitCode = await waitForCommand(test)
  } finally {
    try {
      await stopPreview()
    } finally {
      log.end()
      await once(log, 'finish')
    }
  }
}

/** 报告包装器异常并设置失败退出码。 */
function reportFailure(error) {
  console.error(error)
  process.exitCode = 1
}

/** 收到终止信号时仅回收本包装器拥有的预览进程组。 */
function handleSignal() {
  void stopPreview().finally(() => { process.exitCode = 143 })
}

main().catch(reportFailure)
process.once('SIGINT', handleSignal)
process.once('SIGTERM', handleSignal)
process.once('SIGHUP', handleSignal)
