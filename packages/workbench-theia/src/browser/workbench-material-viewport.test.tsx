import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'
import { resolveWorkbenchModelUrl } from './workbench-model-url'

const materialViewportConsumers = [
  './workbench-material-viewport.tsx'
] as const

describe('Workbench material viewport layer controls', () => {
  it.each(materialViewportConsumers)(
    'forwards the shared name-label layer in %s',
    async (relativePath) => {
      const source = await readFile(
        fileURLToPath(new URL(relativePath, import.meta.url)),
        'utf8'
      )

      expect(source).toMatch(
        /renderView=\{\(viewMode,\s*\{\s*showSites,\s*showMaterialTransfers,\s*showMaterialLabels\s*\}\)\s*=>/u
      )
      expect(source).toContain('showMaterialLabels={showMaterialLabels}')
    }
  )

  it('routes the Workbench surface through the shared viewport adapter', async () => {
    const source = await readFile(
      fileURLToPath(new URL('./unilab-workbench-widget.tsx', import.meta.url)),
      'utf8'
    )

    expect(source).toContain('<WorkbenchMaterialViewport')
  })

  it('does not show the 2.5D fallback notice over pure 3D controls', async () => {
    const source = await readFile(
      fileURLToPath(new URL('./workbench-material-viewport.tsx', import.meta.url)),
      'utf8'
    )

    expect(source).toContain("displayedViewState.mode === '2.5d'")
    expect(source).toContain("displayedViewState.mode === 'split'")
  })

  it('keeps the Theia Backend proxy prefix for root-relative model paths', () => {
    expect(resolveWorkbenchModelUrl(
      'http://127.0.0.1:3100/__unilab_backend',
      '/api/v1/kinematic-models/robot.urdf'
    )).toBe(
      'http://127.0.0.1:3100/__unilab_backend/api/v1/kinematic-models/robot.urdf'
    )
  })

  it('leaves absolute model URLs unchanged', () => {
    expect(resolveWorkbenchModelUrl(
      'http://127.0.0.1:3100/__unilab_backend',
      'http://127.0.0.1:50895/api/v1/material-models/device.glb'
    )).toBe(
      'http://127.0.0.1:50895/api/v1/material-models/device.glb'
    )
  })
})
