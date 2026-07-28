import type { BackendConfig } from './backends'
import { ServiceError } from './errors'

export interface HttpClient {
  request: <ResponseValue>(
    path: string,
    init?: RequestInit
  ) => Promise<ResponseValue>
}

export interface ApiEnvelope<Value> {
  code?: number
  data: Value
  message?: string
  error?: {
    code?: string
    message?: string
  }
}

export interface CreateHttpClientOptions {
  backend: BackendConfig
  fetcher?: typeof fetch
  getAccessToken?: () => string | null | Promise<string | null>
  timeoutMs?: number
}

export function createHttpClient(options: CreateHttpClientOptions): HttpClient {
  const fetcher = options.fetcher ?? fetch
  const timeoutMs = options.timeoutMs ?? 8000

  return {
    request: async <ResponseValue>(
      path: string,
      init: RequestInit = {}
    ): Promise<ResponseValue> => {
      const controller = new AbortController()
      const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs)
      const token = await options.getAccessToken?.()
      const headers = new Headers(init.headers)
      if (token) headers.set('Authorization', token)

      try {
        const response = await fetcher(endpoint(options.backend.apiUrl, path), {
          ...init,
          headers,
          signal: init.signal ?? controller.signal
        })
        if (!response.ok) {
          let problem: unknown
          try {
            problem = await response.json()
          } catch {
            problem = null
          }
          const problemRecord = asRecord(problem)
          const detail = asRecord(problemRecord.detail)
          const errorEnvelope = asRecord(problemRecord.error)
          const message = String(
            errorEnvelope.message ||
            detail.detail ||
            problemRecord.message ||
            problemRecord.detail ||
            `请求失败: ${response.status} ${response.statusText}`
          )
          throw new ServiceError({
            code: String(
              errorEnvelope.code ||
              detail.code ||
              problemRecord.code ||
              'HTTP_REQUEST_FAILED'
            ),
            message,
            status: response.status,
            retryable:
              typeof errorEnvelope.retryable === 'boolean'
                ? errorEnvelope.retryable
                : response.status >= 500
          })
        }
        return (await response.json()) as ResponseValue
      } catch (error) {
        if (error instanceof ServiceError) throw error
        const isAbort = error instanceof DOMException && error.name === 'AbortError'
        throw new ServiceError({
          code: isAbort ? 'HTTP_REQUEST_TIMEOUT' : 'HTTP_REQUEST_FAILED',
          message: isAbort ? '请求超时' : error instanceof Error ? error.message : '请求失败',
          retryable: true
        })
      } finally {
        globalThis.clearTimeout(timeout)
      }
    }
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? value as Record<string, unknown>
    : {}
}

export async function requestData<Value>(
  http: HttpClient,
  path: string,
  init?: RequestInit
): Promise<Value> {
  const envelope = await http.request<ApiEnvelope<Value>>(path, init)
  if (envelope.error) {
    throw new ServiceError({
      code: envelope.error.code || 'API_REQUEST_REJECTED',
      message: envelope.error.message || '服务端拒绝请求',
      retryable: false
    })
  }
  if (envelope.code != null && envelope.code !== 0) {
    throw new ServiceError({
      code: 'API_REQUEST_REJECTED',
      message: envelope.message || `后端返回错误码 ${envelope.code}`,
      retryable: false
    })
  }
  if (!Object.prototype.hasOwnProperty.call(envelope, 'data')) {
    throw new ServiceError({
      code: 'INVALID_API_RESPONSE',
      message: '服务端响应缺少 data 字段',
      retryable: false
    })
  }
  return envelope.data
}

function endpoint(baseUrl: string, path: string): string {
  if (!baseUrl) {
    throw new ServiceError({
      code: 'BACKEND_NOT_CONFIGURED',
      message: '后端地址尚未配置'
    })
  }
  return `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
}
