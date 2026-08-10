import React from 'react'
import ReactDOM from 'react-dom/client'
import { ensurePascalRendererDefaults } from '@unilab/pascal-host'
import App from './App'
import '@unilab/design-system/theme.css'
import './styles/global.css'
import '@unilab/pascal-host/styles/source.css'

// Pascal 0.9.2's post-processing pipeline cannot render through the
// WebGPU-to-WebGL fallback used by common local Chromium/Electron setups. The
// native scene, materials and camera still render correctly without that
// optional pass. Keep Web and Electron usable in both development and
// packaged builds while retaining an explicit `?enable=postFx` opt-in for GPU
// pipeline debugging.
ensurePascalRendererDefaults()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
