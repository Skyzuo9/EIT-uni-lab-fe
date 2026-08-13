/**
 * Keep Pascal's optional post-processing disabled on local Chromium hosts.
 * Its WebGPU-to-WebGL fallback can enter a render-error loop in both Electron
 * and Theia; the native scene, materials, and camera do not depend on it.
 */
export function ensurePascalRendererDefaults(
  location: Location = window.location,
  history: History = window.history
): void {
  const rendererUrl = new URL(location.href)
  const enabledFeatures = new Set(
    (rendererUrl.searchParams.get('enable') ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  )
  const disabledFeatures = new Set(
    (rendererUrl.searchParams.get('disable') ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  )
  if (enabledFeatures.has('postFx') || disabledFeatures.has('postFx')) return

  disabledFeatures.add('postFx')
  rendererUrl.searchParams.set('disable', [...disabledFeatures].join(','))
  history.replaceState(
    history.state,
    '',
    `${rendererUrl.pathname}${rendererUrl.search}${rendererUrl.hash}`
  )
}
