import {
  getDefaultBackend,
  type BackendConfig
} from '@unilab/services'

export const BACKEND_PREFERENCE_STORAGE_KEY = 'unilab.backend.preference.v1'
export const LOCAL_BACKEND_PROXY_PATH = '/__unilab_backend'

export interface BackendSelectionEnvironment {
  search: string
  origin?: string
  managedRuntime: boolean
  storedPreference?: string | null
}

interface StoredBackendPreference {
  id: string
  apiUrl: string
}

/**
 * 解析工作台首次使用的后端权威配置。
 *
 * @param environment 当前 URL、浏览器 Origin、Electron 托管状态和持久偏好。
 * @returns 已校验的后端配置；显式 URL 优先，其次为持久偏好，最后使用平台默认值。
 */
export function resolveInitialBackend(
  environment: BackendSelectionEnvironment
): BackendConfig {
  const search = new URLSearchParams(environment.search)
  const explicitId = explicitBackendId(search)
  const explicitUrl = explicitBackendUrl(search)
  if (explicitId || explicitUrl) {
    const backendId = explicitId ?? (search.has('localOsUrl')
      ? 'local-python'
      : 'local-go')
    return withExplicitUrl(
      resolveDefaultBackend(backendId, environment.origin),
      explicitUrl
    )
  }

  const stored = parseStoredPreference(environment.storedPreference)
  if (stored) {
    return withExplicitUrl(
      resolveDefaultBackend(stored.id, environment.origin),
      stored.apiUrl
    )
  }

  return resolveDefaultBackend(
    environment.managedRuntime ? 'local-python' : 'local-go',
    environment.origin
  )
}

/**
 * 为用户主动切换后端权威生成平台适配后的默认配置。
 *
 * @param backendId DEFAULT_BACKENDS 中的稳定配置身份。
 * @param origin 浏览器当前 Origin；本地 Go Backend 在浏览器开发模式下走同源代理。
 * @returns 可直接交给服务组合根的后端配置。
 */
export function resolveDefaultBackend(
  backendId: string,
  origin?: string
): BackendConfig {
  const backend = getDefaultBackend(backendId)
  if (backend.id !== 'local-go') return backend
  const proxyUrl = localBackendProxyUrl(origin)
  return proxyUrl ? { ...backend, apiUrl: proxyUrl } : backend
}

/**
 * 序列化用户确认过的后端权威选择。
 *
 * @param backend 当前后端配置。
 * @returns 只包含稳定 profile 身份和 API 地址的 JSON，不持久化令牌。
 */
export function serializeBackendPreference(backend: BackendConfig): string {
  return JSON.stringify({ id: backend.id, apiUrl: backend.apiUrl })
}

/**
 * 判断 URL 是否显式指定后端权威或地址。
 *
 * @param search 浏览器 location.search。
 * @returns 存在新版参数或遗留 localOsUrl 参数时为 true。
 */
export function hasExplicitBackendSelection(search: string): boolean {
  const params = new URLSearchParams(search)
  return Boolean(
    explicitBackendId(params) ||
    explicitBackendUrl(params)
  )
}

/** 将本地浏览器 Origin 映射到 Vite 同源 Backend 代理地址。 */
function localBackendProxyUrl(origin: string | undefined): string | null {
  if (!origin) return null
  try {
    const url = new URL(origin)
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      !isLoopbackHost(url.hostname)
    ) return null
    return `${url.origin}${LOCAL_BACKEND_PROXY_PATH}`
  } catch {
    return null
  }
}

/** 读取并校验 URL 中的后端 profile 身份。 */
function explicitBackendId(search: URLSearchParams): string | null {
  const backendId = search.get('backend')
  if (!backendId) return null
  try {
    getDefaultBackend(backendId)
    return backendId
  } catch {
    return null
  }
}

/** 读取新版 backendUrl 或遗留 localOsUrl，并限制本地 profile 只能访问回环地址。 */
function explicitBackendUrl(search: URLSearchParams): string | null {
  const value = search.get('backendUrl') ?? search.get('localOsUrl')
  return normalizeBackendUrl(value)
}

/** 把显式地址应用到 profile，同时维护 Edge 实时连接地址。 */
function withExplicitUrl(
  backend: BackendConfig,
  apiUrl: string | null
): BackendConfig {
  if (!apiUrl) return backend
  return {
    ...backend,
    apiUrl,
    ...(backend.serverKind === 'edge'
      ? { realtimeUrl: realtimeUrlFor(apiUrl) }
      : {})
  }
}

/** 解析持久偏好；损坏、未知 profile 或非回环地址全部失败关闭。 */
function parseStoredPreference(
  value: string | null | undefined
): StoredBackendPreference | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    if (typeof parsed.id !== 'string' || typeof parsed.apiUrl !== 'string') {
      return null
    }
    getDefaultBackend(parsed.id)
    const apiUrl = normalizeBackendUrl(parsed.apiUrl)
    return apiUrl ? { id: parsed.id, apiUrl } : null
  } catch {
    return null
  }
}

/** 规范化可持久化的本地 HTTP 地址，并拒绝凭证、查询串和片段。 */
function normalizeBackendUrl(value: string | null): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      !isLoopbackHost(url.hostname) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) return null
    return url.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

/** 判断主机名是否属于本机回环地址。 */
function isLoopbackHost(hostname: string): boolean {
  return ['localhost', '127.0.0.1', '[::1]'].includes(hostname)
}

/** 从 Edge HTTP 地址派生同主机的 WebSocket 根地址。 */
function realtimeUrlFor(apiUrl: string): string {
  const url = new URL(apiUrl)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString().replace(/\/$/, '')
}
