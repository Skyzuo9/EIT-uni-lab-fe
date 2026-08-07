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

  it('renders the shared role filter with text and lineage counts', () => {
    const markup = renderToStaticMarkup(
      <UnifiedLabViewport
        materialRoleFilter="reagent"
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
        onMaterialRoleFilterChange={vi.fn()}
        renderView={() => <div>scene</div>}
      />
    )

    expect(markup).toContain('aria-label="按物料角色筛选：试剂"')
    expect(markup).toContain('aria-label="物料画布角色"')
    expect(markup).toContain('aria-checked="true"')
    expect(markup).toContain('试剂')
    expect(markup).toContain('耗材')
    expect(markup).toContain('>5<')
  })
})
