import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { RuntimeModeControl } from './environment-manager'

describe('RuntimeModeControl', () => {
  it('exposes a clear selected state for normal mode', () => {
    const markup = renderToStaticMarkup(
      <RuntimeModeControl
        mode="normal"
        disabled={false}
        onSetRuntimeMode={vi.fn()}
      />
    )

    expect(markup).toContain('aria-pressed="true"')
    expect(markup).toContain('正常运行')
    expect(markup).toContain('当前模式')
  })

  it('exposes a clear selected state for Dry-run mode', () => {
    const markup = renderToStaticMarkup(
      <RuntimeModeControl
        mode="dry-run"
        disabled={false}
        onSetRuntimeMode={vi.fn()}
      />
    )

    expect(markup).toMatch(/Dry-run[\s\S]*当前模式/)
    expect(markup).toContain('aria-pressed="true"')
  })
})
