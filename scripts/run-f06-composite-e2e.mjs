import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createWriteStream, mkdirSync } from 'node:fs'
import { createServer } from 'node:net'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

/** 当前包装器拥有并必须在信号退出时回收的进程组。 */
const ACTIVE_PROCESS_GROUPS = new Set()
let signalCleanupStarted = false

/**
 * 启动命令并把输出同时写入终端和前端启动日志。
 *
 * @param command 可执行命令。
 * @param args 原样命令参数。
 * @param environment 子进程环境变量。
 * @param log 固定证据日志流。
 * @param detached 是否创建可整体终止的独立进程组。
 * @returns 已安装输出捕获器的子进程。
 * @throws `spawn` 同步拒绝参数时抛出异常；异步错误由等待函数传播。
 */
function startLoggedCommand(
  command,
  args,
  environment,
  log,
  detached = true
) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: environment,
    detached,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  child.gateOutput = ''
  if (detached) ACTIVE_PROCESS_GROUPS.add(child)
  /**
   * 转发标准输出。
   *
   * @param chunk 子进程输出块。
   * @returns 两个目标流接受写入后返回无。
   * @throws 流写入异常由 Node.js 流错误事件报告。
   */
  const forwardStdout = (chunk) => {
    child.gateOutput += chunk.toString()
    process.stdout.write(chunk)
    log.write(chunk)
  }
  /**
   * 转发标准错误。
   *
   * @param chunk 子进程错误输出块。
   * @returns 两个目标流接受写入后返回无。
   * @throws 流写入异常由 Node.js 流错误事件报告。
   */
  const forwardStderr = (chunk) => {
    child.gateOutput += chunk.toString()
    process.stderr.write(chunk)
    log.write(chunk)
  }
  child.stdout?.on('data', forwardStdout)
  child.stderr?.on('data', forwardStderr)
  /**
   * 从待回收集合移除已经退出的进程组。
   *
   * @returns 集合更新后返回无。
   * @throws 不抛异常。
   */
  const forgetProcessGroup = () => {
    ACTIVE_PROCESS_GROUPS.delete(child)
  }
  child.once('exit', forgetProcessGroup)
  child.once('error', forgetProcessGroup)
  return child
}

/**
 * 等待短命令退出并保留真实退出码。
 *
 * @param child 待观察子进程。
 * @returns 正常退出码；信号终止时返回 1。
 * @throws 子进程异步启动失败时由 `once` 拒绝。
 */
async function waitForCommand(child) {
  const [code] = await once(child, 'exit')
  return code ?? 1
}

/**
 * 运行一个构建或测试短命令。
 *
 * @param command 可执行命令。
 * @param args 原样命令参数。
 * @param environment 子进程环境变量。
 * @param log 固定证据日志流。
 * @returns 子进程真实退出码。
 * @throws 子进程无法启动时拒绝 Promise。
 */
async function runLoggedCommand(command, args, environment, log) {
  return waitForCommand(startLoggedCommand(command, args, environment, log))
}

/**
 * 分配一个短暂占用的随机回环 TCP 端口。
 *
 * @returns 占位服务器关闭后可供当前前端候选使用的端口。
 * @throws 监听、地址读取或关闭失败时拒绝 Promise。
 */
async function availablePort() {
  const server = createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') {
    server.close()
    throw new Error('无法读取 F06 前端验收端口')
  }
  const port = address.port
  server.close()
  await once(server, 'close')
  return port
}

/**
 * 等待当前候选预览服务就绪。
 *
 * @param url 随机端口上的前端根地址。
 * @param preview 预览子进程。
 * @returns 首个成功 HTTP 响应到达后返回无。
 * @throws 预览提前退出或 60 秒内未就绪时抛出异常。
 */
async function waitForPreview(url, preview) {
  const deadline = Date.now() + 60_000
  let lastError = '没有 HTTP 响应'
  while (Date.now() < deadline) {
    if (preview.exitCode !== null || preview.signalCode !== null) {
      throw new Error('F06 前端预览在就绪前退出')
    }
    try {
      const response = await fetch(url)
      if (response.ok && preview.gateOutput.includes(`${url}/`)) return
      lastError = `HTTP ${response.status}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await delay(100)
  }
  throw new Error(`F06 前端预览未就绪: ${lastError}`)
}

/**
 * 终止预览进程组并等待真实退出。
 *
 * @param preview 待关闭的预览子进程。
 * @returns 进程已退出或信号清理完成后返回无。
 * @throws 非“进程不存在”的信号错误会传播。
 */
async function stopPreview(preview) {
  if (!preview?.pid || preview.exitCode !== null || preview.signalCode !== null) return
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

/**
 * 外部信号到达时回收所有当前候选子进程组后退出。
 *
 * @param signal 收到的 POSIX 信号名称。
 * @param exitCode shell 约定的信号退出码。
 * @returns 全部进程组已退出后返回；随后立即终止包装器。
 * @throws 单个清理异常会被报告，但不会阻止后续进程组清理。
 */
async function stopForSignal(signal, exitCode) {
  if (signalCleanupStarted) return
  signalCleanupStarted = true
  const failures = []
  for (const child of [...ACTIVE_PROCESS_GROUPS]) {
    try {
      await stopPreview(child)
    } catch (error) {
      failures.push(error)
    }
  }
  if (failures.length > 0) {
    console.error(new AggregateError(failures, `${signal} 清理失败`))
  }
  process.exit(exitCode)
}

/** SIGINT 入口；参数无，返回无，清理异常在共享处理器中报告。 */
function handleSigint() {
  void stopForSignal('SIGINT', 130)
}

/** SIGTERM 入口；参数无，返回无，清理异常在共享处理器中报告。 */
function handleSigterm() {
  void stopForSignal('SIGTERM', 143)
}

/** SIGHUP 入口；参数无，返回无，清理异常在共享处理器中报告。 */
function handleSighup() {
  void stopForSignal('SIGHUP', 129)
}

/**
 * 关闭并刷新固定证据日志。
 *
 * @param log 待关闭写入流。
 * @returns `finish` 事件到达后返回无。
 * @throws 日志刷新失败时由事件 Promise 拒绝。
 */
async function closeLog(log) {
  log.end()
  await once(log, 'finish')
}

/**
 * 强制构建并预览当前工作树，然后执行唯一 F06 专项门禁。
 *
 * @returns Playwright 的真实退出码。
 * @throws 构建、预览、测试启动或清理失败时抛出异常。
 */
async function main() {
  const artifactDirectory = resolve(
    process.env.UNILAB_C1_E2E_ARTIFACT_DIR ||
      '../e2e-artifacts/c1-composite-authoring'
  )
  mkdirSync(artifactDirectory, { recursive: true })
  const log = createWriteStream(
    resolve(artifactDirectory, 'frontend-startup.log'),
    { flags: 'w' }
  )
  await once(log, 'open')
  let preview
  try {
    const buildResult = await runLoggedCommand(
      'pnpm',
      ['build:web'],
      process.env,
      log
    )
    if (buildResult !== 0) throw new Error(`F06 前端构建失败: ${buildResult}`)
    const port = await availablePort()
    const url = `http://127.0.0.1:${port}`
    preview = startLoggedCommand(
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
    return await runLoggedCommand(
      'pnpm',
      [
        'exec', 'playwright', 'test',
        'e2e/workflow-composite-authoring-real-os.spec.ts',
        '--workers=1', ...process.argv.slice(2)
      ],
      {
        ...process.env,
        UNILAB_FE_E2E_URL: url,
        UNILAB_C1_E2E_ARTIFACT_DIR: artifactDirectory
      },
      log
    )
  } finally {
    try {
      await stopPreview(preview)
    } finally {
      await closeLog(log)
    }
  }
}

/**
 * 保存成功退出码。
 *
 * @param code Playwright 退出码。
 * @returns 设置进程状态后返回无。
 * @throws 不抛异常。
 */
function applyExitCode(code) {
  process.exitCode = code
}

/**
 * 报告门禁自身异常并标记失败。
 *
 * @param error 未处理异常。
 * @returns 写入标准错误并设置退出码后返回无。
 * @throws 不抛异常。
 */
function reportFailure(error) {
  console.error(error)
  process.exitCode = 1
}

main().then(applyExitCode, reportFailure)

process.once('SIGINT', handleSigint)
process.once('SIGTERM', handleSigterm)
process.once('SIGHUP', handleSighup)
