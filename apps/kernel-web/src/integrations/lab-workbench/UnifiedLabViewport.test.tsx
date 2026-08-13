import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { UnifiedLabViewport } from './UnifiedLabViewport'

describe('UnifiedLabViewport material role filter', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn()
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /** 验证统一场景复用多选物料流角色（MaterialFlowRole）显隐意图。 */
  it('renders shared multi-role visibility with text and lineage counts', () => {
    const markup = renderToStaticMarkup(
      <UnifiedLabViewport
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
    expect(markup).toContain('aria-label="物料节点可见性"')
    expect(markup).toContain('type="checkbox"')
    expect(markup).toContain('checked=""')
    expect(markup).toContain('试剂')
    expect(markup).toContain('耗材')
    expect(markup).toContain('>5<')
  })
})
