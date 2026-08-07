import {
  DEFAULT_OBSERVABILITY_BASE_URL,
  type ObservabilityStatus,
  type TraceDetailResult,
  type TraceListResult
} from '../shared/observability'

export type TraceAttributeValue = string | number | boolean
type TraceAttributes = Record<string, TraceAttributeValue | undefined>

export interface TraceSpanSink {
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

const TRACE_ID = /^[0-9a-fA-F]{32}$/
const MAX_QUERY_RESPONSE_BYTES = 4 * 1024 * 1024

import {
  createNoopTraceAdapter,
  createPhoenixTraceAdapter
} from './electronTraceAdapters'
import {
  isDisabled,
  normalizeLoopbackBaseUrl,
  normalizeProjectName,
  positiveInteger,
  safeErrorMessage,
  sanitizeAttributeValue,
  sanitizeText,
  traceDetailParameters,
  traceListParameters,
  withTimeout
} from './observabilitySupport'

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
      adapter = createNoopTraceAdapter()
    } else {
      try {
        adapter = createPhoenixTraceAdapter(options)
      } catch (error) {
        options.log(
          `Trace 初始化失败，已降级为本地日志：${safeErrorMessage(error)}`
        )
        adapter = createNoopTraceAdapter()
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
