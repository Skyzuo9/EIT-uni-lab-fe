import { randomUUID } from 'node:crypto'
import { join } from 'node:path'

import type {
  LocalRuntimeOpenLogResult,
  LocalRuntimeProcessKind
} from '../shared/localRuntime'

interface LocalRuntimeLogDirectoryOperations {
  createDirectory: (logsDirectory: string) => Promise<void>
  openPath: (logsDirectory: string) => Promise<string>
}

export const LOCAL_RUNTIME_LOG_KINDS: readonly LocalRuntimeProcessKind[] = [
  'simulator',
  'edge'
]

const DIAGNOSTIC_LOG_SESSION_ID_PATTERN =
  /^\d{8}T\d{6}\.\d{3}Z-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u

/**
 * 创建本次应用生命周期唯一的诊断日志会话标识。
 *
 * @param startedAt 应用主进程开始加载的 UTC 时间来源。
 * @returns 以可排序 UTC 时间开头、以随机 UUID 防碰撞的安全文件名片段。
 * @throws startedAt 不是有效时间时抛出错误，避免生成不可排序文件。
 * @safety 返回值不含 Windows 禁止字符或路径分隔符，可直接用于日志文件名。
 */
export function createDiagnosticLogSessionId(
  startedAt: Date = new Date()
): string {
  if (!Number.isFinite(startedAt.getTime())) {
    throw new Error('应用启动时间无效')
  }
  const sortableStartedAt = startedAt.toISOString().replace(/[-:]/gu, '')
  return `${sortableStartedAt}-${randomUUID()}`
}

/**
 * 解析 Electron 主进程在本次会话中的诊断日志路径。
 *
 * @param homeDirectory 兼容既有安装包的用户家目录。
 * @param sessionId 由主进程在应用启动时创建并冻结的会话标识。
 * @returns 本次会话专属且不会覆盖旧启动会话的主日志路径。
 * @throws sessionId 不是受支持的安全格式时抛出错误。
 * @safety 只拼接已验证的会话标识，不接受任意相对路径。
 */
export function resolveDesktopMainLogPath(
  homeDirectory: string,
  sessionId: string
): string {
  assertDiagnosticLogSessionId(sessionId)
  return join(homeDirectory, `lab-pc-client-${sessionId}.log`)
}

/**
 * 解析本次会话内指定本地运行进程的诊断日志路径。
 *
 * @param logsDirectory Electron 管理的本地运行日志目录。
 * @param sessionId 应用启动时冻结并由所有本地子进程共享的会话标识。
 * @param kind 受支持的 PLC-Sim 或 Edge 日志来源。
 * @returns 带相同会话前缀和独立进程后缀的日志路径。
 * @throws 会话标识或进程来源不受支持时抛出错误。
 * @safety 渲染器不能传入路径；这里只接受枚举来源和已验证会话标识。
 */
export function resolveLocalRuntimeLogPath(
  logsDirectory: string,
  sessionId: string,
  kind: LocalRuntimeProcessKind
): string {
  assertDiagnosticLogSessionId(sessionId)
  if (!LOCAL_RUNTIME_LOG_KINDS.includes(kind)) {
    throw new Error('不支持的本地运行日志来源')
  }
  return join(logsDirectory, `${sessionId}-${kind}.log`)
}

/**
 * 安全创建并使用系统文件管理器打开当前本地运行日志目录。
 *
 * @param logsDirectory Electron 主进程从当前运行管理器解析出的日志目录。
 * @param operations 由主进程注入的目录创建与系统路径打开边界。
 * @returns 是否成功打开目录，以及失败时可直接展示的中文提示。
 * @throws 不向渲染器抛出文件系统或系统外壳异常。
 * @safety 只打开主进程提供的目录，不读取、不占用且不锁定任何日志文件。
 */
export async function openLocalRuntimeLogDirectory(
  logsDirectory: string,
  operations: LocalRuntimeLogDirectoryOperations
): Promise<LocalRuntimeOpenLogResult> {
  try {
    await operations.createDirectory(logsDirectory)
  } catch (error) {
    return {
      opened: false,
      error: `无法创建日志目录：${diagnosticLogErrorMessage(error)}`
    }
  }

  try {
    const openError = await operations.openPath(logsDirectory)
    return openError
      ? { opened: false, error: `无法打开日志目录：${openError}` }
      : { opened: true }
  } catch (error) {
    return {
      opened: false,
      error: `无法打开日志目录：${diagnosticLogErrorMessage(error)}`
    }
  }
}

/**
 * 校验内部会话标识，防止后续路径解析接收目录跳转片段。
 *
 * @param sessionId 待用于文件名的应用启动会话标识。
 * @returns 校验通过时无返回值。
 * @throws 标识格式不符合 UTC 时间加 UUID 合同时抛出错误。
 * @safety 严格白名单校验保证日志路径始终留在调用方指定目录。
 */
function assertDiagnosticLogSessionId(sessionId: string): void {
  if (!DIAGNOSTIC_LOG_SESSION_ID_PATTERN.test(sessionId)) {
    throw new Error('诊断日志会话标识无效')
  }
}

/**
 * 将未知系统错误收敛为可展示的诊断文本。
 *
 * @param error 文件系统或系统外壳抛出的未知错误。
 * @returns 优先保留 Error.message 的非空文本。
 * @throws 不抛出异常。
 * @safety 不拼接调用栈，避免把内部实现细节暴露给界面。
 */
function diagnosticLogErrorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : String(error)
}
