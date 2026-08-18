import { readFileSync } from 'node:fs'

import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { UnifiedMaterialViewport } from './UnifiedMaterialViewport'

describe('UnifiedMaterialViewport', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn()
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders the shared 2D, 2.5D, 3D and split switch', () => {
    const markup = renderToStaticMarkup(
      <UnifiedMaterialViewport renderView={() => <div>scene</div>} />
    )

    expect(markup).toContain('aria-label="实验室视图"')
    expect(markup).toContain('<span>2D</span>')
    expect(markup).toContain('<span>2.5D</span>')
    expect(markup).toContain('<span>3D</span>')
    expect(markup).toContain('<span>分屏</span>')
  })

  it('owns the shared site-layer switch chrome', () => {
    const styles = readFileSync(
      new URL('./UnifiedMaterialViewport.css', import.meta.url),
      'utf8'
    )

    expect(styles).toContain('.lab-site-layer-toggle i::after')
    expect(styles).toContain(
      '.lab-site-layer-toggle button.is-active.is-transfer'
    )
  })

  /** 证明 3D 模式展示选择、旋转、缩放和平移的常驻操作说明。 */
  it('shows an operation guide only when a 3D scene is visible', () => {
    const threeDimensionalMarkup = renderToStaticMarkup(
      <UnifiedMaterialViewport
        viewState={{
          mode: '3d',
          showSites: true,
          showMaterialTransfers: true
        }}
        renderView={() => <div>scene</div>}
      />
    )
    const twoDimensionalMarkup = renderToStaticMarkup(
      <UnifiedMaterialViewport
        viewState={{
          mode: '2d',
          showSites: true,
          showMaterialTransfers: true
        }}
        renderView={() => <div>scene</div>}
      />
    )

    expect(threeDimensionalMarkup).toContain('aria-label="3D 操作说明"')
    expect(threeDimensionalMarkup).toContain('左键选择物料')
    expect(threeDimensionalMarkup).toContain('拖拽旋转视角')
    expect(threeDimensionalMarkup).toContain('滚轮缩放')
    expect(threeDimensionalMarkup).toContain('右键拖拽平移')
    expect(twoDimensionalMarkup).not.toContain('aria-label="3D 操作说明"')
  })

  it('renders independently selectable material roles from the shared package', () => {
    const markup = renderToStaticMarkup(
      <UnifiedMaterialViewport
        visibleMaterialRoles={['reagent']}
        materialRoleOptions={[
          {
            value: 'reagent',
            label: '试剂',
            accent: '#7c3aed',
            lineageCount: 5
          },
          {
            value: 'consumable',
            label: '耗材',
            accent: '#0f766e',
            lineageCount: 2
          }
        ]}
        onVisibleMaterialRolesChange={vi.fn()}
        renderView={() => <div>scene</div>}
      />
    )

    expect(markup).toContain('aria-label="物料节点可见性：显示 1/2"')
    expect(markup).toContain('type="checkbox"')
    expect(markup).toContain('checked=""')
    expect(markup).toContain('试剂')
    expect(markup).toContain('耗材')
  })
})
