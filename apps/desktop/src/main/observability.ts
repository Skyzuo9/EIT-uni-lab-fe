import {
  register,
  SpanStatusCode,
  type NodeTracerProvider,
  type Tracer
} from '@arizeai/phoenix-otel'
import type { HttpRequestTraceEvent } from '@unilab/services'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
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
  otlpHttpEndpoint: string
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
  logAdapter?: ElectronLogAdapter
  requestSpanAdapter?: ElectronRequestSpanAdapter
  otlpJsonTransport?: OtlpJsonTransport
  fetch?: typeof fetch
}

type OtlpJsonTransport = (
  endpoint: string,
  body: string,
  timeoutMs: number
) => Promise<void>

type ElectronLogSeverity = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'

interface ElectronLogAdapter {
  record(
    message: string,
    severity: ElectronLogSeverity,
    attributes: Record<string, TraceAttributeValue>,
    context?: ElectronLogContext
  ): void
  flush(): Promise<void>
  shutdown(): Promise<void>
}

interface ElectronLogContext {
  traceId: string
  spanId: string
  flags: number
}

interface ElectronRequestSpanAdapter {
  record(
    event: HttpRequestTraceEvent,
    attributes: Record<string, TraceAttributeValue>
  ): void
  flush(): Promise<void>
  shutdown(): Promise<void>
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
const DEFAULT_LOCAL_SIGNOZ_OTLP_HTTP_ENDPOINT = 'http://127.0.0.1:4318'

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
  const baseUrl = normalizeLoopbackBaseUrl(configuredBaseUrl)
  const configuredOtlpHttpEndpoint =
    environment['UNILABOS_OTLP_HTTP_ENDPOINT']
      ?? DEFAULT_LOCAL_SIGNOZ_OTLP_HTTP_ENDPOINT

  return {
    enabled: !isDisabled(environment['UNILABOS_TRACE_ENABLED']),
    baseUrl,
    otlpHttpEndpoint: normalizeOtlpHttpEndpoint(configuredOtlpHttpEndpoint),
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
  const fetchImplementation = dependencies.fetch ?? globalThis.fetch
  const otlpJsonTransport = dependencies.otlpJsonTransport ?? postOtlpJson
  let adapter = dependencies.traceAdapter
  let logAdapter = dependencies.logAdapter
  let requestSpanAdapter = dependencies.requestSpanAdapter
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
  if (!logAdapter) {
    logAdapter = options.enabled
      ? new OtlpHttpLogAdapter(options, otlpJsonTransport)
      : new NoopLogAdapter()
  }
  if (!requestSpanAdapter) {
    requestSpanAdapter = options.enabled
      ? new OtlpHttpRequestSpanAdapter(options, otlpJsonTransport)
      : new NoopRequestSpanAdapter()
  }
  return new ElectronObservability(
    options,
    new FailOpenTraceAdapter(adapter),
    logAdapter,
    requestSpanAdapter,
    fetchImplementation
  )
}

export class ElectronObservability {
  private readonly commonAttributes: Record<string, TraceAttributeValue>
  private closed = false

  constructor(
    private readonly options: ElectronObservabilityOptions,
    private readonly adapter: ElectronTraceAdapter,
    private readonly logAdapter: ElectronLogAdapter,
    private readonly requestSpanAdapter: ElectronRequestSpanAdapter,
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
    const startedAt = Date.now()
    try {
      const result = await this.adapter.run(name, sanitizedAttributes, async (span) => {
        try {
          return await operation()
        } catch (error) {
          span.markError(this.sanitizeError(error))
          throw error
        }
      })
      this.safelyRecordLog(name, 'INFO', {
        ...sanitizedAttributes,
        'event.name': name,
        'event.kind': 'span',
        'event.duration_ms': Date.now() - startedAt
      })
      return result
    } catch (error) {
      const sanitizedError = this.sanitizeError(error)
      this.safelyRecordLog(name, 'ERROR', {
        ...sanitizedAttributes,
        'event.name': name,
        'event.kind': 'span',
        'event.duration_ms': Date.now() - startedAt,
        'exception.type': sanitizedError.name,
        'exception.message': sanitizedError.message
      })
      throw error
    }
  }

  record(name: string, attributes: TraceAttributes = {}, error?: unknown): void {
    if (this.closed) return
    const sanitizedAttributes = this.sanitizeAttributes(attributes)
    const sanitizedError = error === undefined
      ? undefined
      : this.sanitizeError(error)
    try {
      this.adapter.record(name, sanitizedAttributes, sanitizedError)
    } catch {
      // 遥测必须保持 fail-open，不能影响 Electron 业务事件。
    }
    this.safelyRecordLog(name, sanitizedError ? 'ERROR' : 'INFO', {
      ...sanitizedAttributes,
      'event.name': name,
      'event.kind': 'span',
      ...(sanitizedError ? {
        'exception.type': sanitizedError.name,
        'exception.message': sanitizedError.message
      } : {})
    })
  }

  log(
    message: string,
    severity: ElectronLogSeverity = 'INFO',
    attributes: TraceAttributes = {}
  ): void {
    if (this.closed) return
    this.safelyRecordLog(
      sanitizeText(message, this.options.homeDirectory),
      severity,
      this.sanitizeAttributes(attributes)
    )
  }

  recordHttpRequestTrace(value: unknown): void {
    if (this.closed) return
    const event = parseHttpRequestTraceEvent(value)
    const attributes: Record<string, TraceAttributeValue> = {
      'http.request.method': event.method,
      'url.path': event.path,
      'network.protocol.name': event.transport,
      'event.duration_ms': event.durationMs,
      'request.outcome': event.outcome,
      ...(event.statusCode === undefined
        ? {}
        : { 'http.response.status_code': event.statusCode })
    }
    try {
      this.requestSpanAdapter.record(event, attributes)
    } catch {
      // 请求追踪必须 fail-open，不能影响 renderer 的网络请求。
    }
    this.safelyRecordLog(
      `electron.${event.transport}.client`,
      event.outcome === 'error' ? 'ERROR' : 'INFO',
      {
        'event.kind': 'span',
        'span.kind': 'client',
        ...attributes
      },
      { traceId: event.traceId, spanId: event.spanId, flags: 1 }
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
        this.flushAdapters(),
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
        this.shutdownAdapters(),
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

  private async flushAdapters(): Promise<void> {
    await settleAdapterOperations([
      Promise.resolve().then(() => this.adapter.flush()),
      Promise.resolve().then(() => this.logAdapter.flush()),
      Promise.resolve().then(() => this.requestSpanAdapter.flush())
    ])
  }

  private async shutdownAdapters(): Promise<void> {
    await settleAdapterOperations([
      Promise.resolve().then(() => this.adapter.shutdown()),
      Promise.resolve().then(() => this.logAdapter.shutdown()),
      Promise.resolve().then(() => this.requestSpanAdapter.shutdown())
    ])
  }

  private safelyRecordLog(
    message: string,
    severity: ElectronLogSeverity,
    attributes: Record<string, TraceAttributeValue>,
    context?: ElectronLogContext
  ): void {
    try {
      this.logAdapter.record(message, severity, attributes, context)
    } catch {
      // 遥测必须保持 fail-open，不能影响 Electron 业务事件。
    }
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
      url: options.otlpHttpEndpoint,
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

class FailOpenTraceAdapter implements ElectronTraceAdapter {
  constructor(private readonly delegate: ElectronTraceAdapter) {}

  async run<T>(
    name: string,
    attributes: Record<string, TraceAttributeValue>,
    operation: (span: TraceSpanSink) => Promise<T>
  ): Promise<T> {
    const outcome: {
      state: 'not-started' | 'resolved' | 'rejected'
    } = { state: 'not-started' }
    let operationResult: T | undefined
    let operationError: unknown
    try {
      return await this.delegate.run(name, attributes, async (span) => {
        try {
          operationResult = await operation(span)
          outcome.state = 'resolved'
          return operationResult
        } catch (error) {
          outcome.state = 'rejected'
          operationError = error
          throw error
        }
      })
    } catch {
      if (outcome.state === 'resolved') return operationResult as T
      if (outcome.state === 'rejected') throw operationError
      return operation({ markError: () => undefined })
    }
  }

  record(
    name: string,
    attributes: Record<string, TraceAttributeValue>,
    error?: Error
  ): void {
    try {
      this.delegate.record(name, attributes, error)
    } catch {
      // 遥测必须保持 fail-open，不能影响 Electron 业务事件。
    }
  }

  flush(): Promise<void> {
    return this.delegate.flush()
  }

  shutdown(): Promise<void> {
    return this.delegate.shutdown()
  }
}

interface QueuedLogRecord {
  timeUnixNano: string
  severityNumber: number
  severityText: ElectronLogSeverity
  body: { stringValue: string }
  attributes: Array<{
    key: string
    value: Record<string, string | number | boolean>
  }>
  traceId?: string
  spanId?: string
  flags?: number
}

class OtlpHttpLogAdapter implements ElectronLogAdapter {
  private readonly endpoint: string
  private readonly queue: QueuedLogRecord[] = []
  private scheduledFlush: ReturnType<typeof setTimeout> | undefined
  private activeFlush: Promise<void> | undefined
  private closed = false

  constructor(
    private readonly options: ElectronObservabilityOptions,
    private readonly transport: OtlpJsonTransport
  ) {
    this.endpoint = appendOtlpSignalPath(options.otlpHttpEndpoint, 'logs')
  }

  record(
    message: string,
    severity: ElectronLogSeverity,
    attributes: Record<string, TraceAttributeValue>,
    context?: ElectronLogContext
  ): void {
    if (this.closed) return
    if (this.queue.length >= 2_048) this.queue.shift()
    this.queue.push({
      timeUnixNano: (BigInt(Date.now()) * 1_000_000n).toString(),
      severityNumber: severityNumber(severity),
      severityText: severity,
      body: { stringValue: message },
      attributes: otlpAttributes(attributes),
      ...(context ? {
        traceId: context.traceId,
        spanId: context.spanId,
        flags: context.flags
      } : {})
    })
    if (this.queue.length >= 256) {
      void this.flush().catch(() => undefined)
      return
    }
    this.scheduleFlush()
  }

  flush(): Promise<void> {
    if (this.scheduledFlush) {
      clearTimeout(this.scheduledFlush)
      this.scheduledFlush = undefined
    }
    if (!this.activeFlush) {
      this.activeFlush = this.exportQueuedLogs().finally(() => {
        this.activeFlush = undefined
        if (this.queue.length > 0 && !this.closed) this.scheduleFlush()
      })
    }
    return this.activeFlush.then(() => {
      if (this.queue.length === 0) return undefined
      return this.flush()
    })
  }

  async shutdown(): Promise<void> {
    if (this.closed) return
    this.closed = true
    await this.flush()
  }

  private async exportQueuedLogs(): Promise<void> {
    const records = this.queue.splice(0, this.queue.length)
    if (records.length === 0) return
    try {
      await this.transport(
        this.endpoint,
        JSON.stringify({
          resourceLogs: [{
            resource: { attributes: otlpResourceAttributes(this.options) },
            scopeLogs: [{
              scope: {
                name: 'uni-lab-electron',
                version: this.options.appVersion
              },
              logRecords: records
            }]
          }]
        }),
        this.options.requestTimeoutMs
      )
    } catch (error) {
      this.queue.unshift(...records)
      if (this.queue.length > 2_048) {
        this.queue.splice(0, this.queue.length - 2_048)
      }
      throw error
    }
  }

  private scheduleFlush(): void {
    if (this.scheduledFlush) return
    this.scheduledFlush = setTimeout(() => {
      this.scheduledFlush = undefined
      void this.flush().catch(() => undefined)
    }, 1_000)
    this.scheduledFlush.unref?.()
  }
}

class NoopLogAdapter implements ElectronLogAdapter {
  record(): void {}
  flush(): Promise<void> { return Promise.resolve() }
  shutdown(): Promise<void> { return Promise.resolve() }
}

interface QueuedRequestSpan {
  traceId: string
  spanId: string
  name: string
  kind: number
  startTimeUnixNano: string
  endTimeUnixNano: string
  attributes: ReturnType<typeof otlpAttributes>
  status: { code: number }
}

class OtlpHttpRequestSpanAdapter implements ElectronRequestSpanAdapter {
  private readonly endpoint: string
  private readonly queue: QueuedRequestSpan[] = []
  private scheduledFlush: ReturnType<typeof setTimeout> | undefined
  private activeFlush: Promise<void> | undefined
  private closed = false

  constructor(
    private readonly options: ElectronObservabilityOptions,
    private readonly transport: OtlpJsonTransport
  ) {
    this.endpoint = appendOtlpSignalPath(options.otlpHttpEndpoint, 'traces')
  }

  record(
    event: HttpRequestTraceEvent,
    attributes: Record<string, TraceAttributeValue>
  ): void {
    if (this.closed) return
    if (this.queue.length >= 2_048) this.queue.shift()
    const startTimeUnixNano = unixMillisecondsToNanoseconds(
      event.startedAtUnixMs
    )
    const endTimeUnixNano = (
      BigInt(startTimeUnixNano)
      + durationMillisecondsToNanoseconds(event.durationMs)
    ).toString()
    this.queue.push({
      traceId: event.traceId,
      spanId: event.spanId,
      name: `electron.${event.transport}.client`,
      kind: 3,
      startTimeUnixNano,
      endTimeUnixNano,
      attributes: otlpAttributes(attributes),
      status: {
        code: event.outcome === 'error'
          ? 2
          : event.outcome === 'cancelled' ? 0 : 1
      }
    })
    if (this.queue.length >= 256) {
      void this.flush().catch(() => undefined)
      return
    }
    this.scheduleFlush()
  }

  flush(): Promise<void> {
    if (this.scheduledFlush) {
      clearTimeout(this.scheduledFlush)
      this.scheduledFlush = undefined
    }
    if (!this.activeFlush) {
      this.activeFlush = this.exportQueuedSpans().finally(() => {
        this.activeFlush = undefined
        if (this.queue.length > 0 && !this.closed) this.scheduleFlush()
      })
    }
    return this.activeFlush.then(() => {
      if (this.queue.length === 0) return undefined
      return this.flush()
    })
  }

  async shutdown(): Promise<void> {
    if (this.closed) return
    this.closed = true
    await this.flush()
  }

  private async exportQueuedSpans(): Promise<void> {
    const spans = this.queue.splice(0, this.queue.length)
    if (spans.length === 0) return
    try {
      await this.transport(
        this.endpoint,
        JSON.stringify({
          resourceSpans: [{
            resource: { attributes: otlpResourceAttributes(this.options) },
            scopeSpans: [{
              scope: {
                name: 'uni-lab-electron.renderer-transport',
                version: this.options.appVersion
              },
              spans
            }]
          }]
        }),
        this.options.requestTimeoutMs
      )
    } catch (error) {
      this.queue.unshift(...spans)
      if (this.queue.length > 2_048) {
        this.queue.splice(0, this.queue.length - 2_048)
      }
      throw error
    }
  }

  private scheduleFlush(): void {
    if (this.scheduledFlush) return
    this.scheduledFlush = setTimeout(() => {
      this.scheduledFlush = undefined
      void this.flush().catch(() => undefined)
    }, 1_000)
    this.scheduledFlush.unref?.()
  }
}

class NoopRequestSpanAdapter implements ElectronRequestSpanAdapter {
  record(): void {}
  flush(): Promise<void> { return Promise.resolve() }
  shutdown(): Promise<void> { return Promise.resolve() }
}

function unixMillisecondsToNanoseconds(value: number): string {
  const milliseconds = Math.trunc(value)
  const fractionalNanoseconds = Math.trunc((value - milliseconds) * 1_000_000)
  return (
    BigInt(milliseconds) * 1_000_000n + BigInt(fractionalNanoseconds)
  ).toString()
}

function durationMillisecondsToNanoseconds(value: number): bigint {
  return BigInt(Math.max(0, Math.trunc(value * 1_000_000)))
}

function severityNumber(severity: ElectronLogSeverity): number {
  return { DEBUG: 5, INFO: 9, WARN: 13, ERROR: 17 }[severity]
}

function otlpAttributeValue(
  value: TraceAttributeValue
): Record<string, string | number | boolean> {
  if (typeof value === 'boolean') return { boolValue: value }
  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? { intValue: String(value) }
      : { doubleValue: value }
  }
  return { stringValue: value }
}

function otlpAttributes(
  attributes: Record<string, TraceAttributeValue>
): Array<{
  key: string
  value: Record<string, string | number | boolean>
}> {
  return Object.entries(attributes).map(([key, value]) => ({
    key,
    value: otlpAttributeValue(value)
  }))
}

function otlpResourceAttributes(
  options: ElectronObservabilityOptions
): ReturnType<typeof otlpAttributes> {
  return otlpAttributes({
    'service.name': 'uni-lab-electron',
    'service.version': options.appVersion,
    'deployment.environment': options.environment,
    'os.type': options.platform,
    'process.runtime.name': 'electron',
    'process.runtime.version': options.electronVersion,
    'node.version': options.nodeVersion
  })
}

function appendOtlpSignalPath(
  endpoint: string,
  signal: 'logs' | 'traces'
): string {
  const url = new URL(endpoint)
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/v1/${signal}`
  return url.toString()
}

function postOtlpJson(
  endpoint: string,
  body: string,
  timeoutMs: number
): Promise<void> {
  return postOtlpBody(endpoint, body, 'application/json', timeoutMs)
}

function postOtlpBody(
  endpoint: string,
  body: string | Uint8Array,
  contentType: string,
  timeoutMs: number
): Promise<void> {
  const url = new URL(endpoint)
  const payload = typeof body === 'string' ? Buffer.from(body) : Buffer.from(body)
  const requestImplementation = url.protocol === 'https:'
    ? httpsRequest
    : httpRequest
  return new Promise((resolve, reject) => {
    const request = requestImplementation(url, {
      method: 'POST',
      headers: {
        'content-type': contentType,
        'content-length': payload.byteLength,
        connection: 'close'
      }
    }, (response) => {
      response.resume()
      response.once('end', () => {
        const statusCode = response.statusCode ?? 0
        if (statusCode >= 200 && statusCode < 300) resolve()
        else reject(new Error(`OTLP HTTP ${statusCode}`))
      })
    })
    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error('OTLP HTTP 请求超时'))
    })
    request.once('error', reject)
    request.end(payload)
  })
}

async function settleAdapterOperations(operations: Promise<void>[]): Promise<void> {
  const results = await Promise.allSettled(operations)
  const failure = results.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected'
  )
  if (failure) throw failure.reason
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

function normalizeOtlpHttpEndpoint(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('UNILABOS_OTLP_HTTP_ENDPOINT 格式不正确')
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new Error('OTLP HTTP 地址必须使用无凭据的 HTTP 或 HTTPS 地址')
  }
  url.search = ''
  url.hash = ''
  url.pathname = url.pathname.replace(/\/+$/, '')
  return url.toString().replace(/\/$/, '')
}

export function parseHttpRequestTraceEvent(value: unknown): HttpRequestTraceEvent {
  const event = objectValue(value, 'HTTP Trace 事件格式不正确')
  rejectUnknownKeys(event, [
    'transport',
    'method',
    'path',
    'traceId',
    'spanId',
    'traceparent',
    'startedAtUnixMs',
    'durationMs',
    'statusCode',
    'outcome'
  ])
  const transport = event.transport
  const method = event.method
  const path = event.path
  const traceId = event.traceId
  const spanId = event.spanId
  const traceparent = event.traceparent
  const outcome = event.outcome
  if (!['http', 'sse', 'websocket'].includes(String(transport))) {
    throw new Error('HTTP Trace transport 不正确')
  }
  if (typeof method !== 'string' || !/^[A-Z]{1,16}$/.test(method)) {
    throw new Error('HTTP Trace method 不正确')
  }
  if (
    typeof path !== 'string' ||
    !path.startsWith('/') ||
    path.length > 2048 ||
    path.includes('?') ||
    path.includes('#')
  ) {
    throw new Error('HTTP Trace path 不正确')
  }
  if (
    typeof traceId !== 'string' ||
    !/^[0-9a-f]{32}$/.test(traceId) ||
    /^0+$/.test(traceId)
  ) {
    throw new Error('HTTP Trace traceId 不正确')
  }
  if (
    typeof spanId !== 'string' ||
    !/^[0-9a-f]{16}$/.test(spanId) ||
    /^0+$/.test(spanId)
  ) {
    throw new Error('HTTP Trace spanId 不正确')
  }
  if (traceparent !== `00-${traceId}-${spanId}-01`) {
    throw new Error('HTTP Trace traceparent 不正确')
  }
  if (!['ok', 'error', 'cancelled', 'open'].includes(String(outcome))) {
    throw new Error('HTTP Trace outcome 不正确')
  }
  const startedAtUnixMs = finiteNumber(event.startedAtUnixMs, 'startedAtUnixMs')
  const durationMs = finiteNumber(event.durationMs, 'durationMs')
  if (startedAtUnixMs < 0 || durationMs < 0 || durationMs > 86_400_000) {
    throw new Error('HTTP Trace 时间不正确')
  }
  let statusCode: number | undefined
  if (event.statusCode !== undefined) {
    statusCode = finiteNumber(event.statusCode, 'statusCode')
    if (!Number.isInteger(statusCode) || statusCode < 100 || statusCode > 599) {
      throw new Error('HTTP Trace statusCode 不正确')
    }
  }
  return {
    transport: transport as HttpRequestTraceEvent['transport'],
    method,
    path,
    traceId,
    spanId,
    traceparent,
    startedAtUnixMs,
    durationMs,
    ...(statusCode === undefined ? {} : { statusCode }),
    outcome: outcome as HttpRequestTraceEvent['outcome']
  }
}

function finiteNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`HTTP Trace ${field} 不正确`)
  }
  return value
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
