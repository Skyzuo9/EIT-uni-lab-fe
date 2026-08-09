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
})
