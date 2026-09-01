export interface ReadOnlyMaterialProjection {
  mode: 'read-only'
  backendUrl: string
  workspacePath: string
}

export interface InitialSpatialShadowState {
  enabled: boolean
  timeS: number
}

/**
 * 解析显式的只读物料投影入口。
 *
 * 该模式只用于没有完整 ROS Workspace Backend 的开发机可视化验收；缺少任一
 * 显式参数都会失败关闭，不能把普通 Workbench 会话静默降级成投影查看器。
 */
export function resolveReadOnlyMaterialProjection(
  search: string,
  hash = ''
): ReadOnlyMaterialProjection | null {
  const query = new URLSearchParams(search)
  if (query.get('materialProjection') !== 'read-only') return null
  if (query.get('workbenchConnection') !== 'backend') return null

  const backendUrl = normalizedHttpUrl(query.get('localOsUrl'))
  const workspacePath = normalizedWorkspacePath(
    query.get('materialWorkspace') ?? workspacePathFromHash(hash)
  )
  if (!backendUrl || !workspacePath) return null
  return { mode: 'read-only', backendUrl, workspacePath }
}

/** 返回当前浏览器显式请求的只读投影；SSR 与非法 URL 一律关闭。 */
export function currentReadOnlyMaterialProjection():
ReadOnlyMaterialProjection | null {
  try {
    if (typeof globalThis.location === 'undefined') return null
    return resolveReadOnlyMaterialProjection(
      globalThis.location.search,
      globalThis.location.hash
    )
  } catch {
    return null
  }
}

/** 只接受显式可视化参数；非法时间回退到首帧且不影响计算快照。 */
export function resolveInitialSpatialShadowState(
  search: string
): InitialSpatialShadowState {
  const query = new URLSearchParams(search)
  const enabled = query.get('showSpatialShadow') === 'true'
  const requestedTime = Number(query.get('spatialShadowTimeS') ?? '0')
  return {
    enabled,
    timeS: Number.isFinite(requestedTime) && requestedTime >= 0
      ? requestedTime
      : 0
  }
}

export function currentInitialSpatialShadowState(): InitialSpatialShadowState {
  try {
    return resolveInitialSpatialShadowState(
      typeof globalThis.location === 'undefined'
        ? ''
        : globalThis.location.search
    )
  } catch {
    return { enabled: false, timeS: 0 }
  }
}

function normalizedHttpUrl(value: string | null): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (url.username || url.password) return null
    return url.toString().replace(/\/$/u, '')
  } catch {
    return null
  }
}

function workspacePathFromHash(hash: string): string {
  try {
    return decodeURI(hash.replace(/^#/u, ''))
  } catch {
    return ''
  }
}

function normalizedWorkspacePath(value: string): string | null {
  const path = value.trim()
  if (path.startsWith('/')) return path
  return /^[A-Za-z]:[\\/]/u.test(path) ? path : null
}
