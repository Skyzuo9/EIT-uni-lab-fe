/**
 * 管理当前应用会话的有界诊断日志写入、轮转、尾部快照和增量游标读取。
 */
import { statSync } from 'node:fs'
import { mkdir, open, rename, rm } from 'node:fs/promises'
import { Writable } from 'node:stream'

import type {
  LocalRuntimeLogBatch,
  LocalRuntimeLogEntry,
  LocalRuntimeLogQuery,
  LocalRuntimeLogsSnapshot,
  LocalRuntimeProcessKind
} from '../shared/localRuntime'
import {
  LOCAL_RUNTIME_LOG_KINDS,
  resolveLocalRuntimeLogPath
} from './diagnosticLogSession'

const LOCAL_RUNTIME_LOG_READ_LIMIT_BYTES = 128 * 1024
const LOCAL_RUNTIME_LOG_BATCH_LIMIT_BYTES = 64 * 1024
const LOCAL_RUNTIME_LOG_MAX_BYTES = 10 * 1024 * 1024
const LOCAL_RUNTIME_LOG_BACKUP_COUNT = 5

export class RotatingLogWriter extends Writable {
  private handle: Awaited<ReturnType<typeof open>> | null = null
  private byteLength: number

  /**
   * 创建运行时诊断日志写入器。
   *
   * @param logPath 主进程解析且冻结的当前会话日志路径。
   * @param maxBytes 单个分片允许的最大字节数。
   * @param backupCount 轮转后保留的历史分片数量。
   * @throws 打开、写入或轮转文件失败时通过 Writable 错误回调上报。
   * @safety 只写入给定路径及其数字后缀分片，不扫描其他日志会话。
   */
  constructor(
    private readonly logPath: string,
    private readonly maxBytes: number,
    private readonly backupCount: number
  ) {
    super()
    this.byteLength = statSync(logPath, { throwIfNoEntry: false })?.size ?? 0
  }

  /**
   * 把一个子进程输出块写入当前分片。
   *
   * @param chunk Node Writable 提供的字节块或字符串。
   * @param encoding 字符串块使用的编码。
   * @param callback 写入结束或失败时必须调用的流回调。
   * @returns 无返回值；结果通过 callback 报告。
   * @throws 不同步抛出；异步错误交给 callback。
   * @safety 写入前先执行容量轮转，保持每个分片有界。
   */
  override _write(
    chunk: Buffer | string,
    encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ): void {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding)
    void this.writeChunk(buffer).then(
      /** 成功写入后通知 Writable 继续消费。 */
      () => callback(),
      /** 把未知文件系统异常规范化后交给 Writable。 */
      (error: unknown) => callback(asError(error))
    )
  }

  /**
   * 在流结束时关闭底层文件句柄。
   *
   * @param callback 关闭结束或失败时必须调用的流回调。
   * @returns 无返回值；结果通过 callback 报告。
   * @throws 不同步抛出；异步错误交给 callback。
   * @safety 关闭后不再保留文件句柄，轮转文件可安全移动。
   */
  override _final(callback: (error?: Error | null) => void): void {
    void this.closeHandle().then(
      /** 成功关闭后结束 Writable。 */
      () => callback(),
      /** 把未知关闭异常规范化后交给 Writable。 */
      (error: unknown) => callback(asError(error))
    )
  }

  /**
   * 串行写入一个有序字节块。
   *
   * @param buffer 已按调用方编码转换的日志字节。
   * @returns 写入与字节计数更新完成后结束。
   * @throws 文件打开、写入或轮转失败时透传异常。
   * @safety 超过容量前先轮转，避免当前文件无界增长。
   */
  private async writeChunk(buffer: Buffer): Promise<void> {
    if (this.byteLength > 0 && this.byteLength + buffer.byteLength > this.maxBytes) {
      await this.rotate()
    }
    this.handle ??= await open(this.logPath, 'a')
    await this.handle.write(buffer)
    this.byteLength += buffer.byteLength
  }

  /**
   * 关闭当前文件并把历史分片按 .1 到 .N 后移。
   *
   * @returns 轮转完成后结束。
   * @throws 删除或重命名失败时透传异常。
   * @safety 只操作当前日志路径派生的固定数字后缀文件。
   */
  private async rotate(): Promise<void> {
    await this.closeHandle()
    const retainedBackups = Math.max(1, this.backupCount)
    await rm(`${this.logPath}.${retainedBackups}`, { force: true })
    for (let index = retainedBackups - 1; index >= 1; index -= 1) {
      await renameIfPresent(
        `${this.logPath}.${index}`,
        `${this.logPath}.${index + 1}`
      )
    }
    await renameIfPresent(this.logPath, `${this.logPath}.1`)
    this.byteLength = 0
  }

  /**
   * 关闭已打开的文件句柄。
   *
   * @returns 没有句柄或关闭完成后结束。
   * @throws 底层 close 失败时透传异常。
   * @safety 重复调用保持幂等，并在等待关闭前清空内部引用。
   */
  private async closeHandle(): Promise<void> {
    const activeHandle = this.handle
    this.handle = null
    await activeHandle?.close()
  }
}

/**
 * 为当前应用会话创建使用稳定容量策略的诊断日志写入器。
 *
 * @param logsDirectory Electron 管理的日志目录。
 * @param logSessionId 应用启动时冻结的日志会话标识。
 * @param kind 固定的 PLC-Sim 或边缘执行（Edge）来源。
 * @returns 已绑定安全路径与环境容量覆盖的轮转写入器。
 * @throws 会话标识或来源非法时抛出错误。
 * @safety 渲染器不能传入任意路径，环境变量只接受正整数容量。
 */
export function createLocalRuntimeLogWriter(
  logsDirectory: string,
  logSessionId: string,
  kind: LocalRuntimeProcessKind
): RotatingLogWriter {
  return new RotatingLogWriter(
    resolveLocalRuntimeLogPath(logsDirectory, logSessionId, kind),
    positiveEnvironmentInteger(
      'UNILAB_DESKTOP_LOG_MAX_BYTES',
      LOCAL_RUNTIME_LOG_MAX_BYTES
    ),
    positiveEnvironmentInteger(
      'UNILAB_DESKTOP_LOG_BACKUP_COUNT',
      LOCAL_RUNTIME_LOG_BACKUP_COUNT
    )
  )
}

/**
 * 读取当前应用会话内全部固定来源的有界日志尾部。
 *
 * @param logsDirectory Electron 管理的本地运行日志目录。
 * @param logSessionId 应用启动时冻结的诊断日志会话标识。
 * @param maxBytes 每个来源允许读取的最大字节数。
 * @returns 当前会话各固定来源的日志快照。
 * @throws 目录创建、路径校验或文件读取异常时透传错误。
 * @safety 不扫描目录，也不会读取其他启动会话或任意文件。
 */
export async function readLocalRuntimeLogs(
  logsDirectory: string,
  logSessionId: string,
  maxBytes = LOCAL_RUNTIME_LOG_READ_LIMIT_BYTES
): Promise<LocalRuntimeLogsSnapshot> {
  await mkdir(logsDirectory, { recursive: true })
  const entries = await Promise.all(LOCAL_RUNTIME_LOG_KINDS.map(
    /** 将每个受支持来源投影为当前应用会话的有界日志条目。 */
    (kind) => readLocalRuntimeLogEntry(
      logsDirectory,
      logSessionId,
      kind,
      Math.max(1, maxBytes)
    )
  ))
  return { readAt: Date.now(), entries }
}

/**
 * 按文件身份与字节偏移读取当前会话的一个来源。
 *
 * @param logsDirectory Electron 管理的本地运行日志目录。
 * @param logSessionId 应用启动时冻结的诊断日志会话标识。
 * @param query 固定来源与可选字节游标。
 * @param maxBytes 单次增量读取允许返回的最大字节数。
 * @returns 增量内容、文件身份游标及是否需要重置前端缓冲区。
 * @throws 目录创建、路径校验或非文件不存在类读取错误时透传异常。
 * @safety 轮转、截断或首次读取返回重置批次，不跨会话追随旧游标。
 */
export async function readLocalRuntimeLog(
  logsDirectory: string,
  logSessionId: string,
  query: LocalRuntimeLogQuery,
  maxBytes = LOCAL_RUNTIME_LOG_BATCH_LIMIT_BYTES
): Promise<LocalRuntimeLogBatch> {
  await mkdir(logsDirectory, { recursive: true })
  const logPath = resolveLocalRuntimeLogPath(
    logsDirectory,
    logSessionId,
    query.kind
  )
  let handle: Awaited<ReturnType<typeof open>> | null = null
  try {
    handle = await open(logPath, 'r')
    const file = await handle.stat()
    const fileId = `${file.dev}:${file.ino}:${file.birthtimeMs}`
    const safeLimit = Math.max(1, maxBytes)
    const cursorMatches = query.cursor?.fileId === fileId
      && Number.isSafeInteger(query.cursor.offset)
      && query.cursor.offset >= 0
      && query.cursor.offset <= file.size
    let reset = !cursorMatches
    let start = cursorMatches ? query.cursor?.offset ?? 0 : 0
    if (file.size - start > safeLimit) {
      start = file.size - safeLimit
      reset = true
    }
    const byteLength = Math.max(0, file.size - start)
    const buffer = Buffer.alloc(byteLength)
    const { bytesRead } = byteLength > 0
      ? await handle.read(buffer, 0, byteLength, start)
      : { bytesRead: 0 }
    let contentStart = 0
    if (start > 0) {
      while (contentStart < bytesRead && (buffer[contentStart] & 0xc0) === 0x80) {
        contentStart += 1
      }
      if (reset) {
        const firstNewline = buffer.indexOf(0x0a, contentStart)
        contentStart = firstNewline >= 0 ? firstNewline + 1 : bytesRead
      }
    }
    return {
      kind: query.kind,
      content: buffer.subarray(contentStart, bytesRead).toString('utf8'),
      available: true,
      truncated: start > 0,
      readAt: Date.now(),
      cursor: { fileId, offset: file.size },
      reset
    }
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return {
        kind: query.kind,
        content: '',
        available: false,
        truncated: false,
        readAt: Date.now(),
        cursor: null,
        reset: true
      }
    }
    throw error
  } finally {
    await handle?.close()
  }
}

/**
 * 读取当前应用会话中单个固定来源的有界文件尾部。
 *
 * @param logsDirectory Electron 管理的本地运行日志目录。
 * @param logSessionId 应用启动时冻结的诊断日志会话标识。
 * @param kind 固定的 PLC-Sim 或边缘执行（Edge）来源。
 * @param maxBytes 允许读取的最大尾部字节数。
 * @returns 单个来源的兼容快照条目。
 * @throws 路径校验或非文件不存在类读取错误时透传异常。
 * @safety 只读取明确来源的当前会话文件，不执行目录枚举。
 */
async function readLocalRuntimeLogEntry(
  logsDirectory: string,
  logSessionId: string,
  kind: LocalRuntimeProcessKind,
  maxBytes: number
): Promise<LocalRuntimeLogEntry> {
  const logPath = resolveLocalRuntimeLogPath(logsDirectory, logSessionId, kind)
  let handle: Awaited<ReturnType<typeof open>> | null = null
  try {
    handle = await open(logPath, 'r')
    const file = await handle.stat()
    const byteLength = Math.min(file.size, maxBytes)
    const start = Math.max(0, file.size - byteLength)
    const buffer = Buffer.alloc(byteLength)
    const { bytesRead } = byteLength > 0
      ? await handle.read(buffer, 0, byteLength, start)
      : { bytesRead: 0 }
    let contentStart = 0
    if (start > 0) {
      while (
        contentStart < bytesRead
        && (buffer[contentStart] & 0xc0) === 0x80
      ) {
        contentStart += 1
      }
    }
    return {
      kind,
      content: buffer.subarray(contentStart, bytesRead).toString('utf8'),
      available: true,
      truncated: file.size > byteLength
    }
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return { kind, content: '', available: false, truncated: false }
    }
    throw error
  } finally {
    await handle?.close()
  }
}

/**
 * 将未知异常规范化成 Error。
 *
 * @param error 任意 Promise 拒绝值。
 * @returns 原 Error 或带字符串消息的新 Error。
 * @throws 不抛出异常。
 * @safety 不序列化对象属性，避免扩大诊断中的敏感信息范围。
 */
function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

/**
 * 读取正整数环境参数。
 *
 * @param name 固定的主进程环境变量名称。
 * @param fallback 缺失或非法时使用的稳定默认值。
 * @returns 正安全整数或 fallback。
 * @throws 不抛出异常。
 * @safety 不接受零、负数或非整数，防止关闭容量保护。
 */
function positiveEnvironmentInteger(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? '', 10)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

/**
 * 仅在源文件存在时执行重命名。
 *
 * @param source 当前日志或历史分片路径。
 * @param target 同一日志路径派生的下一个分片路径。
 * @returns 源不存在或重命名完成后结束。
 * @throws 除 ENOENT 外的文件系统错误继续上抛。
 * @safety 调用方只传递当前日志路径的固定数字后缀。
 */
async function renameIfPresent(source: string, target: string): Promise<void> {
  try {
    await rename(source, target)
  } catch (error) {
    if (!isNodeError(error) || error.code !== 'ENOENT') throw error
  }
}

/**
 * 判断未知异常是否携带 Node.js 文件系统错误码。
 *
 * @param error 捕获到的未知异常。
 * @returns 是否可安全读取 code 字段。
 * @throws 不抛出异常。
 * @safety 仅做结构检查，不信任其他自定义属性。
 */
function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}
