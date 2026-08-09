export type DesktopSurfaceKind = 'kernel' | 'workbench'

export interface DesktopSurfaceConfig {
  kind: DesktopSurfaceKind
  title: string
  rendererUrl: string | null
  openDevTools: boolean
  window: {
    width: number
    height: number
    minWidth: number
    minHeight: number
  }
}

export interface ResolveDesktopSurfaceOptions {
  environment?: Readonly<Record<string, string | undefined>>
  isDevelopment: boolean
}

/**
 * Resolves the trusted renderer and window profile for the shared Electron shell.
 *
 * Kernel Web remains the default renderer. Workbench may opt into the same shell
 * only through an explicit loopback URL, because the preload exposes privileged
 * local capabilities that must never be granted to a remote origin.
 */
export function resolveDesktopSurfaceConfig(
  options: ResolveDesktopSurfaceOptions
): DesktopSurfaceConfig {
  const environment = options.environment ?? process.env
  const requestedKind = environment['UNILAB_DESKTOP_SURFACE']?.trim()
    || 'kernel'

  if (requestedKind === 'kernel') {
    if (environment['UNILAB_DESKTOP_RENDERER_URL']) {
      throw new Error(
        'UNILAB_DESKTOP_RENDERER_URL 只能用于 workbench surface'
      )
    }
    return {
      kind: 'kernel',
      title: 'Lab PC Client',
      rendererUrl: null,
      openDevTools: options.isDevelopment,
      window: {
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600
      }
    }
  }

  if (requestedKind !== 'workbench') {
    throw new Error(`未知的 Electron surface: ${requestedKind}`)
  }

  const rendererUrl = trustedWorkbenchRendererUrl(
    environment['UNILAB_DESKTOP_RENDERER_URL']
  )
  return {
    kind: 'workbench',
    title: 'UniLab Authoring Workbench',
    rendererUrl,
    openDevTools: environment['UNILAB_DESKTOP_OPEN_DEVTOOLS'] === '1',
    window: {
      width: 1600,
      height: 1000,
      minWidth: 1024,
      minHeight: 720
    }
  }
}

/** Prevents a privileged loopback renderer from navigating to another origin. */
export function isDesktopSurfaceNavigationAllowed(
  config: DesktopSurfaceConfig,
  targetUrl: string
): boolean {
  if (!config.rendererUrl) return true
  try {
    return new URL(targetUrl).origin === new URL(config.rendererUrl).origin
  } catch {
    return false
  }
}

/**
 * Workbench owns a per-launch Theia backend. On macOS the last window must
 * therefore end that launch instead of reopening against a stale plugin host.
 */
export function shouldQuitWhenAllDesktopWindowsClose(
  platform: NodeJS.Platform,
  surfaceKind: DesktopSurfaceKind
): boolean {
  return platform !== 'darwin' || surfaceKind === 'workbench'
}

/** Restricts the privileged Workbench renderer to the managed loopback server. */
function trustedWorkbenchRendererUrl(value: string | undefined): string {
  if (!value?.trim()) {
    throw new Error(
      'Workbench desktop 需要 UNILAB_DESKTOP_RENDERER_URL'
    )
  }

  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('Workbench renderer URL 无效')
  }
  if (
    url.protocol !== 'http:'
    || url.hostname !== '127.0.0.1'
    || url.username
    || url.password
  ) {
    throw new Error(
      'Workbench renderer 必须是无凭据的 http://127.0.0.1 地址'
    )
  }
  return url.toString()
}
