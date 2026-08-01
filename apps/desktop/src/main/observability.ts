import {
  register,
  SpanStatusCode,
  type NodeTracerProvider,
  type Tracer
} from '@arizeai/phoenix-otel'
import { isIP } from 'node:net'

import {
  DEFAULT_OBSERVABILITY_BASE_URL,
  type ObservabilityStatus,
  type TraceDetailResult,
  type TraceListResult
} from '../shared/observability'

type TraceAttributeValue = string | number | boolean
type TraceAttributes = Record<string, TraceAttributeValue | undefined>

interface TraceSpanSink {
  markError(error: Error): void
}

export interface ElectronTraceAdapter {
  run<T>(
    name: string,
    attributes: Record<string, TraceAttributeValue>,
    operation: (span: TraceSpanSink) => Promise<T>
  ): Promise<T>
  record(
    name: string,
    attributes: Record<string, TraceAttributeValue>,
    error?: Error
  ): void
  flush(): Promise<void>
  shutdown(): Promise<void>
}

export interface ElectronObservabilityOptions {
  enabled: boolean
  baseUrl: string
  projectName: string
  appVersion: string
  environment: 'development' | 'production'
  platform: NodeJS.Platform
  electronVersion: string
  nodeVersion: string
  homeDirectory: string
  requestTimeoutMs: number
  shutdownTimeoutMs: number
  log: (message: string) => void
}

interface ElectronObservabilityDependencies {
  traceAdapter?: ElectronTraceAdapter
  fetch?: typeof fetch
}

interface ApiEnvelope<T> {
  code: number
  data?: T
  error?: {
    code?: string
    message?: string
  }
}

const SENSITIVE_KEY = /(authorization|cookie|password|secret|token|api[_-]?key)/i
const BEARER_TOKEN = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi
const INLINE_SECRET =
  /((?:authorization|cookie|password|secret|token|api[_-]?key)["']?\s*[:=]\s*["']?)[^\s,;"']+/gi
const SECRET_QUERY_PARAMETER =
  /([?&](?:authorization|cookie|password|secret|token|api[_-]?key)=)[^&\s]+/gi
const TRACE_ID = /^[0-9a-fA-F]{32}$/
const MAX_ATTRIBUTE_LENGTH = 1_024
const MAX_QUERY_RESPONSE_BYTES = 4 * 1024 * 1024

export function resolveElectronObservabilityOptions({
  environment = process.env,
  appVersion,
  isPackaged,
  platform = process.platform,
  electronVersion = process.versions.electron ?? 'unknown',
  nodeVersion = process.versions.node,
  homeDirectory,
  log
}: {
  environment?: NodeJS.ProcessEnv
  appVersion: string
  isPackaged: boolean
  platform?: NodeJS.Platform
  electronVersion?: string
  nodeVersion?: string
  homeDirectory: string
  log: (message: string) => void
}): ElectronObservabilityOptions {
  const configuredBaseUrl =
    environment['UNILABOS_OBSERVABILITY_URL'] ??
    DEFAULT_OBSERVABILITY_BASE_URL
  const configuredProject =
    environment['UNILABOS_TRACE_PROJECT'] ?? 'uni-lab-electron'

  return {
    enabled: !isDisabled(environment['UNILABOS_TRACE_ENABLED']),
    baseUrl: normalizeLoopbackBaseUrl(configuredBaseUrl),
    projectName: normalizeProjectName(configuredProject),
    appVersion,
    environment: isPackaged ? 'production' : 'development',
    platform,
    electronVersion,
    nodeVersion,
    homeDirectory,
    requestTimeoutMs: positiveInteger(
      environment['UNILABOS_TRACE_REQUEST_TIMEOUT_MS'],
      5_000
    ),
    shutdownTimeoutMs: positiveInteger(
      environment['UNILABOS_TRACE_SHUTDOWN_TIMEOUT_MS'],
      3_000
    ),
    log
  }
}

export function createElectronObservability(
  options: ElectronObservabilityOptions,
  dependencies: ElectronObservabilityDependencies = {}
): ElectronObservability {
  let adapter = dependencies.traceAdapter
  if (!adapter) {
    if (!options.enabled) {
      adapter = new NoopTraceAdapter()
    } else {
      try {
        adapter = new PhoenixTraceAdapter(options)
      } catch (error) {
        options.log(
          `Trace 初始化失败，已降级为本地日志：${safeErrorMessage(error)}`
        )
        adapter = new NoopTraceAdapter()
      }
    }
  }
  return new ElectronObservability(
    options,
    adapter,
    dependencies.fetch ?? globalThis.fetch
  )
}

export class ElectronObservability {
  private readonly commonAttributes: Record<string, TraceAttributeValue>
  private closed = false

  constructor(
    private readonly options: ElectronObservabilityOptions,
    private readonly adapter: ElectronTraceAdapter,
    private readonly fetchImplementation: typeof fetch
  ) {
    this.commonAttributes = {
      'service.name': 'uni-lab-electron',
      'service.version': options.appVersion,
      'deployment.environment': options.environment,
      'os.type': options.platform,
      'process.runtime.name': 'electron',
      'process.runtime.version': options.electronVersion,
      'node.version': options.nodeVersion
    }
  }

  async run<T>(
    name: string,
    attributes: TraceAttributes,
    operation: () => Promise<T>
  ): Promise<T> {
    if (this.closed) return operation()
    const sanitizedAttributes = this.sanitizeAttributes(attributes)
    return this.adapter.run(name, sanitizedAttributes, async (span) => {
      try {
        return await operation()
      } catch (error) {
        span.markError(this.sanitizeError(error))
        throw error
      }
    })
  }

  record(name: string, attributes: TraceAttributes = {}, error?: unknown): void {
    if (this.closed) return
    this.adapter.record(
      name,
      this.sanitizeAttributes(attributes),
      error === undefined ? undefined : this.sanitizeError(error)
    )
  }

  async getStatus(): Promise<ObservabilityStatus> {
    return this.request<ObservabilityStatus>('status')
  }

  async listTraces(query: unknown = {}): Promise<TraceListResult> {
    const parameters = traceListParameters(query)
    return this.request<TraceListResult>('traces', parameters)
  }

  async getTrace(
    traceId: unknown,
    query: unknown = {}
  ): Promise<TraceDetailResult> {
    if (typeof traceId !== 'string' || !TRACE_ID.test(traceId)) {
      throw new Error('trace_id 格式不正确')
    }
    const parameters = traceDetailParameters(query)
    return this.request<TraceDetailResult>(
      `traces/${traceId.toLowerCase()}`,
      parameters
    )
  }

  async flush(): Promise<void> {
    if (this.closed) return
    try {
      await withTimeout(
        this.adapter.flush(),
        this.options.shutdownTimeoutMs,
        'Trace flush 超时'
      )
    } catch (error) {
      this.options.log(`Trace flush 失败：${safeErrorMessage(error)}`)
    }
  }

  async shutdown(): Promise<void> {
    if (this.closed) return
    this.closed = true
    try {
      await withTimeout(
        this.adapter.shutdown(),
        this.options.shutdownTimeoutMs,
        'Trace 关闭超时'
      )
    } catch (error) {
      this.options.log(`Trace 关闭失败：${safeErrorMessage(error)}`)
    }
  }

  private sanitizeAttributes(
    attributes: TraceAttributes
  ): Record<string, TraceAttributeValue> {
    const sanitized = { ...this.commonAttributes }
    for (const [key, value] of Object.entries(attributes)) {
      if (value === undefined) continue
      sanitized[key] = sanitizeAttributeValue(
        key,
        value,
        this.options.homeDirectory
      )
    }
    return sanitized
  }

  private sanitizeError(error: unknown): Error {
    const original = error instanceof Error ? error : new Error(String(error))
    const sanitized = new Error(
      sanitizeText(original.message, this.options.homeDirectory)
    )
    sanitized.name = sanitizeText(
      original.name || 'Error',
      this.options.homeDirectory
    )
    sanitized.stack = undefined
    return sanitized
  }

  private async request<T>(
    path: string,
    parameters?: URLSearchParams
  ): Promise<T> {
    const url = new URL(`${this.options.baseUrl}/${path}`)
    if (parameters) url.search = parameters.toString()

    let response: Response
    try {
      response = await this.fetchImplementation(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(this.options.requestTimeoutMs)
      })
    } catch (error) {
      throw new Error(`Trace 日志服务暂不可用：${safeErrorMessage(error)}`)
    }

    const declaredLength = Number(response.headers.get('content-length') ?? 0)
    if (declaredLength > MAX_QUERY_RESPONSE_BYTES) {
      throw new Error('Trace 日志响应内容过大')
    }
    const text = await response.text()
    if (Buffer.byteLength(text, 'utf8') > MAX_QUERY_RESPONSE_BYTES) {
      throw new Error('Trace 日志响应内容过大')
    }

    let envelope: ApiEnvelope<T>
    try {
      envelope = JSON.parse(text) as ApiEnvelope<T>
    } catch {
      throw new Error('Trace 日志服务返回了无效响应')
    }
    if (!response.ok || envelope.code !== 0 || envelope.data === undefined) {
      const message = envelope.error?.message || 'Trace 日志服务返回异常'
      throw new Error(sanitizeText(message, this.options.homeDirectory))
    }
    return envelope.data
  }
}

class PhoenixTraceAdapter implements ElectronTraceAdapter {
  private readonly provider: NodeTracerProvider
  private readonly tracer: Tracer

  constructor(options: ElectronObservabilityOptions) {
    this.provider = register({
      projectName: options.projectName,
      url: `${options.baseUrl}/otlp`,
      batch: true
    })
    this.tracer = this.provider.getTracer(
      'uni-lab-electron',
      options.appVersion
    )
  }

  run<T>(
    name: string,
    attributes: Record<string, TraceAttributeValue>,
    operation: (span: TraceSpanSink) => Promise<T>
  ): Promise<T> {
    return this.tracer.startActiveSpan(name, { attributes }, async (span) => {
      try {
        return await operation({
          markError: (error) => {
            span.recordException({ name: error.name, message: error.message })
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: error.message
            })
          }
        })
      } finally {
        span.end()
      }
    })
  }

  record(
    name: string,
    attributes: Record<string, TraceAttributeValue>,
    error?: Error
  ): void {
    this.tracer.startActiveSpan(name, { attributes }, (span) => {
      if (error) {
        span.recordException({ name: error.name, message: error.message })
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message })
      }
      span.end()
    })
  }

  flush(): Promise<void> {
    return this.provider.forceFlush()
  }

  shutdown(): Promise<void> {
    return this.provider.shutdown()
  }
}

class NoopTraceAdapter implements ElectronTraceAdapter {
  run<T>(
    _name: string,
    _attributes: Record<string, TraceAttributeValue>,
    operation: (span: TraceSpanSink) => Promise<T>
  ): Promise<T> {
    return operation({ markError: () => undefined })
  }

  record(): void {}

  flush(): Promise<void> {
    return Promise.resolve()
  }

  shutdown(): Promise<void> {
    return Promise.resolve()
  }
}

function traceListParameters(value: unknown): URLSearchParams {
  const query = objectValue(value, 'Trace 列表查询参数格式不正确')
  rejectUnknownKeys(query, [
    'limit',
    'cursor',
    'startTime',
    'endTime',
    'sort',
    'order',
    'includeSpans',
    'sessionIdentifiers'
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

function traceDetailParameters(value: unknown): URLSearchParams {
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

function sanitizeAttributeValue(
  key: string,
  value: TraceAttributeValue,
  homeDirectory: string
): TraceAttributeValue {
  if (SENSITIVE_KEY.test(key)) return '[REDACTED]'
  return typeof value === 'string'
    ? sanitizeText(value, homeDirectory)
    : value
}

function sanitizeText(value: string, homeDirectory: string): string {
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

function normalizeLoopbackBaseUrl(value: string): string {
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

function normalizeProjectName(value: string): string {
  const normalized = value.trim()
  if (!normalized || normalized.length > 128 || /[/?#]/.test(normalized)) {
    throw new Error('UNILABOS_TRACE_PROJECT 格式不正确')
  }
  return normalized
}

function positiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

function isDisabled(value: string | undefined): boolean {
  return (
    value !== undefined &&
    ['0', 'false', 'off'].includes(value.toLowerCase())
  )
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.slice(0, 500) || '未知错误'
}

async function withTimeout<T>(
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
