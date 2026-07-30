import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import '@unilab/design-system/theme.css'
import './styles/global.css'
import './styles/tailwind.css'
import './styles/pascal.css'

// Pascal 0.9.2's post-processing pipeline cannot render through the
// WebGPU-to-WebGL fallback used by common local Chromium/Electron setups. The
// native scene, materials and camera still render correctly without that
// optional pass. Keep Web and Electron usable in both development and
// packaged builds while retaining an explicit `?enable=postFx` opt-in for GPU
// pipeline debugging.
const rendererUrl = new URL(window.location.href)
const enabledRendererFeatures = new Set(
  (rendererUrl.searchParams.get('enable') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
)
const disabledRendererFeatures = new Set(
  (rendererUrl.searchParams.get('disable') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
)
if (
  !enabledRendererFeatures.has('postFx') &&
  !disabledRendererFeatures.has('postFx')
) {
  disabledRendererFeatures.add('postFx')
  rendererUrl.searchParams.set(
    'disable',
    [...disabledRendererFeatures].join(',')
  )
  window.history.replaceState(
    window.history.state,
    '',
    `${rendererUrl.pathname}${rendererUrl.search}${rendererUrl.hash}`
  )
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
