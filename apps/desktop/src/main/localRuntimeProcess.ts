import {
  spawn,
  type ChildProcessWithoutNullStreams
} from 'node:child_process'

import type { LocalRuntimeProcessKind } from '../shared/localRuntime'
import { createLocalRuntimeLogWriter } from './localRuntimeDiagnostics'
import type { LocalRuntimeSpawnSpec } from './localRuntimeLaunchContract'

export interface ManagedLocalRuntimeProcessOptions {
  kind: LocalRuntimeProcessKind
  spec: LocalRuntimeSpawnSpec
  logsDirectory: string
  logSessionId: string
  onClose: (
    child: ChildProcessWithoutNullStreams,
    code: number | null,
    signal: NodeJS.Signals | null
  ) => void
}

/**
 * 启动一个受管理的本地子进程，并把标准输出与错误写入当前应用会话。
 *
 * @param options 进程来源、启动规范、日志会话和关闭通知。
 * @returns 已接入诊断日志与关闭通知的子进程。
 * @throws spawn 同步拒绝启动时透传错误；异步错误写入对应会话日志。
 * @safety 不使用 shell，日志路径只由主进程固定值解析。
 */
export function spawnManagedLocalRuntimeProcess(
  options: ManagedLocalRuntimeProcessOptions
): ChildProcessWithoutNullStreams {
  const child = spawn(options.spec.command, options.spec.args, {
    cwd: options.spec.cwd,
    env: options.spec.env,
    detached: process.platform !== 'win32',
    shell: false,
    windowsHide: true
  })
  const logStream = createLocalRuntimeLogWriter(
    options.logsDirectory,
    options.logSessionId,
    options.kind
  )
  logStream.write(`\n[launcher] ${new Date().toISOString()} starting\n`)
  child.stdout.pipe(logStream, { end: false })
  child.stderr.pipe(logStream, { end: false })
  child.once(
    'error',
    /**
     * 把异步 spawn 错误写入同一会话日志。
     *
     * @param error Node.js 子进程异步启动错误。
     * @returns 不返回值；诊断被追加到当前进程日志。
     */
    (error) => {
      logStream.write(`\n[launcher] ${error.message}\n`)
    }
  )
  child.once(
    'close',
    /**
     * 先结算日志，再把退出身份交还生命周期管理器。
     *
     * @param code 子进程退出码，信号退出时可能为空。
     * @param signal 终止信号，普通退出时可能为空。
     * @returns 不返回值；关闭通知由调用方同步处理。
     */
    (code, signal) => {
      logStream.end(
        `\n[launcher] process exited code=${String(code)} signal=${String(signal)}\n`
      )
      options.onClose(child, code, signal)
    }
  )
  return child
}

/**
 * 跨平台终止一个受管理子进程及其进程树。
 *
 * @param child 由本地启动器创建的子进程引用。
 * @returns 进程已退出、终止请求完成或强制终止已发出时完成。
 * @throws 不抛出终止错误；进程已消失按成功处理。
 * @safety Windows 使用 taskkill 树终止，POSIX 优先按独立进程组终止。
 */
export async function stopLocalRuntimeProcessTree(
  child: ChildProcessWithoutNullStreams
): Promise<void> {
  if (child.exitCode !== null || !child.pid) return
  if (process.platform === 'win32') {
    await new Promise<void>((resolveResult) => {
      const killer = spawn(
        'taskkill.exe',
        ['/pid', String(child.pid), '/t', '/f'],
        { windowsHide: true }
      )
      killer.once('close', () => resolveResult())
      killer.once('error', () => resolveResult())
    })
    return
  }
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    child.kill('SIGTERM')
  }
  await Promise.race([
    new Promise<void>((resolveResult) => {
      child.once('close', () => resolveResult())
    }),
    delay(5_000)
  ])
  if (child.exitCode === null) {
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {
      child.kill('SIGKILL')
    }
  }
}

/**
 * 返回本地子进程在诊断信息中的稳定中文名称。
 *
 * @param kind 固定的 PLC-Sim 或边缘执行（Edge）进程来源。
 * @returns 对应的用户可见进程名称。
 * @throws 不抛出异常。
 */
export function localRuntimeProcessLabel(
  kind: LocalRuntimeProcessKind
): string {
  if (kind === 'simulator') return 'OPC UA'
  return '领域侧 Edge'
}

/**
 * 把未知启动错误转换为可展示的稳定文本。
 *
 * @param error 捕获到的未知错误值。
 * @returns Error 使用 message，其他值使用字符串表示。
 * @throws 不抛出异常。
 */
export function localRuntimeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * 等待指定毫秒数，供温和终止阶段让出事件循环。
 *
 * @param milliseconds 非负等待时长。
 * @returns 定时器到期后完成。
 * @throws 不抛出异常。
 */
function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveResult) => setTimeout(resolveResult, milliseconds))
}
