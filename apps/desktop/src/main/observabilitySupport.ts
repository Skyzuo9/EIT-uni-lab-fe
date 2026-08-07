import { isIP } from 'node:net'

import type { TraceAttributeValue } from './observability'

const SENSITIVE_KEY = /(authorization|cookie|password|secret|token|api[_-]?key)/i
const BEARER_TOKEN = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi
const INLINE_SECRET =
  /((?:authorization|cookie|password|secret|token|api[_-]?key)["']?\s*[:=]\s*["']?)[^\s,;"']+/gi
const SECRET_QUERY_PARAMETER =
  /([?&](?:authorization|cookie|password|secret|token|api[_-]?key)=)[^&\s]+/gi
const MAX_ATTRIBUTE_LENGTH = 1_024

/** 校验并编码 Trace 列表查询参数。 */
export function traceListParameters(value: unknown): URLSearchParams {
  const query = objectValue(value, 'Trace 列表查询参数格式不正确')
  rejectUnknownKeys(query, [
    'limit', 'cursor', 'startTime', 'endTime', 'sort', 'order',
    'includeSpans', 'sessionIdentifiers'
  ])
  const parameters = new URLSearchParams()
  appendInteger(parameters, 'limit', query.limit, 1, 1_000)
  appendString(parameters, 'cursor', query.cursor, 4_096)
  appendDate(parameters, 'start_time', query.startTime)
  appendDate(parameters, 'end_time', query.endTime)
  appendEnum(parameters, 'sort', query.sort, ['start_time', 'latency_ms'])
  appendEnum(parameters, 'order', query.order, ['asc', 'desc'])
  appendBoolean(parameters, 'include_spans', query.includeSpans)
  if (query.sessionIdentifiers !== undefined) {
    if (
      !Array.isArray(query.sessionIdentifiers) ||
      query.sessionIdentifiers.length > 20
    ) {
      throw new Error('sessionIdentifiers 格式不正确')
    }
    for (const identifier of query.sessionIdentifiers) {
      if (
        typeof identifier !== 'string' ||
        !identifier ||
        identifier.length > 256
      ) {
        throw new Error('sessionIdentifiers 格式不正确')
      }
      parameters.append('session_identifier', identifier)
    }
  }
  return parameters
}

/** 校验并编码单个 Trace 的分页查询参数。 */
export function traceDetailParameters(value: unknown): URLSearchParams {
  const query = objectValue(value, 'Trace 详情查询参数格式不正确')
  rejectUnknownKeys(query, ['limit', 'cursor'])
  const parameters = new URLSearchParams()
  appendInteger(parameters, 'limit', query.limit, 1, 1_000)
  appendString(parameters, 'cursor', query.cursor, 4_096)
  return parameters
}

function objectValue(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(message)
  }
  return value as Record<string, unknown>
}

function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: string[]
): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new Error('Trace 查询包含不支持的字段')
  }
}

function appendInteger(
  parameters: URLSearchParams,
  name: string,
  value: unknown,
  minimum: number,
  maximum: number
): void {
  if (value === undefined) return
  if (
    !Number.isInteger(value) ||
    (value as number) < minimum ||
    (value as number) > maximum
  ) {
    throw new Error(`${name} 格式不正确`)
  }
  parameters.set(name, String(value))
}

function appendString(
  parameters: URLSearchParams,
  name: string,
  value: unknown,
  maxLength: number
): void {
  if (value === undefined) return
  if (typeof value !== 'string' || !value || value.length > maxLength) {
    throw new Error(`${name} 格式不正确`)
  }
  parameters.set(name, value)
}

function appendDate(
  parameters: URLSearchParams,
  name: string,
  value: unknown
): void {
  if (value === undefined) return
  if (typeof value !== 'string' || !value || Number.isNaN(Date.parse(value))) {
    throw new Error(`${name} 格式不正确`)
  }
  parameters.set(name, value)
}

function appendEnum(
  parameters: URLSearchParams,
  name: string,
  value: unknown,
  allowed: string[]
): void {
  if (value === undefined) return
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new Error(`${name} 格式不正确`)
  }
  parameters.set(name, value)
}

function appendBoolean(
  parameters: URLSearchParams,
  name: string,
  value: unknown
): void {
  if (value === undefined) return
  if (typeof value !== 'boolean') throw new Error(`${name} 格式不正确`)
  parameters.set(name, String(value))
}

/** 删除属性中的凭据、本机目录与超长文本。 */
export function sanitizeAttributeValue(
  key: string,
  value: TraceAttributeValue,
  homeDirectory: string
): TraceAttributeValue {
  if (SENSITIVE_KEY.test(key)) return '[REDACTED]'
  return typeof value === 'string'
    ? sanitizeText(value, homeDirectory)
    : value
}

/** 对任意 Trace 文本执行统一脱敏和长度限制。 */
export function sanitizeText(value: string, homeDirectory: string): string {
  let sanitized = value
    .replace(BEARER_TOKEN, 'Bearer [REDACTED]')
    .replace(INLINE_SECRET, '$1[REDACTED]')
    .replace(SECRET_QUERY_PARAMETER, '$1[REDACTED]')
  if (homeDirectory) sanitized = sanitized.split(homeDirectory).join('$HOME')
  if (/^(https?|file):\/\//i.test(sanitized)) {
    try {
      const url = new URL(sanitized)
      url.username = ''
      url.password = ''
      url.search = ''
      url.hash = ''
      sanitized = url.toString()
    } catch {
      // 普通错误文本可能以 URL 开头，无法完整解析时继续使用已脱敏文本。
    }
  }
  return sanitized.slice(0, MAX_ATTRIBUTE_LENGTH)
}

/** 只接受无凭据的本机 HTTP 可观测性服务地址。 */
export function normalizeLoopbackBaseUrl(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('UNILABOS_OBSERVABILITY_URL 格式不正确')
  }
  if (url.protocol !== 'http:' || url.username || url.password) {
    throw new Error('Trace 日志地址必须是无凭据的本机 HTTP 地址')
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  const ipVersion = isIP(hostname)
  const isLoopback =
    hostname === 'localhost' ||
    (ipVersion === 4 && hostname.startsWith('127.')) ||
    (ipVersion === 6 && hostname === '::1')
  if (!isLoopback) throw new Error('Trace 日志地址仅允许本机访问')
  url.search = ''
  url.hash = ''
  url.pathname = url.pathname.replace(/\/+$/, '')
  return url.toString().replace(/\/$/, '')
}

/** 校验 Phoenix 项目名，避免形成路径或查询注入。 */
export function normalizeProjectName(value: string): string {
  const normalized = value.trim()
  if (!normalized || normalized.length > 128 || /[/?#]/.test(normalized)) {
    throw new Error('UNILABOS_TRACE_PROJECT 格式不正确')
  }
  return normalized
}

/** 读取正整数环境变量，无效值回退到安全默认值。 */
export function positiveInteger(
  value: string | undefined,
  fallback: number
): number {
  if (value === undefined) return fallback
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

/** 判断环境开关是否显式关闭。 */
export function isDisabled(value: string | undefined): boolean {
  return value !== undefined && ['0', 'false', 'off'].includes(value.toLowerCase())
}

/** 把未知异常收敛为有界错误文本。 */
export function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.slice(0, 500) || '未知错误'
}

/** 为关闭与刷新操作增加确定的超时边界。 */
export async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  message: string
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs)
      })
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}
