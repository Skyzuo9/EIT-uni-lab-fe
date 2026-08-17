import { useEffect } from 'react'

export interface DeviceCardSurfaceOcclusionApi {
  setOccluded(source: string, occluded: boolean): Promise<void>
}

/** Hide the native device-card surface until the returned cleanup runs. */
export function beginDeviceCardSurfaceOcclusion(
  api: DeviceCardSurfaceOcclusionApi,
  source: string
): () => void {
  let released = false
  void api.setOccluded(source, true).catch(() => undefined)
  return () => {
    if (released) return
    released = true
    void api.setOccluded(source, false).catch(() => undefined)
  }
}

/** Keep Electron's native card view behind a renderer-owned blocking overlay. */
export function useDeviceCardSurfaceOcclusion(source: string): void {
  useEffect(() => {
    const api = desktopDeviceCardSurfaceOcclusionApi()
    if (!api) return undefined
    return beginDeviceCardSurfaceOcclusion(api, source)
  }, [source])
}

function desktopDeviceCardSurfaceOcclusionApi(): DeviceCardSurfaceOcclusionApi | null {
  if (typeof globalThis.window === 'undefined') return null
  return (globalThis.window as Window & {
    api?: { deviceCards?: DeviceCardSurfaceOcclusionApi }
  }).api?.deviceCards ?? null
}
