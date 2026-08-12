import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { RuntimeModeControl } from './environment-manager'

describe('RuntimeModeControl', () => {
  it.each([
    ['normal', '正常运行', 'Dry-run'],
    ['dry-run', 'Dry-run', '正常运行']
  ] as const)('exposes %s as the unambiguous selected mode', (
    mode,
    selectedLabel,
    otherLabel
  ) => {
    const markup = renderToStaticMarkup(
      <RuntimeModeControl
        mode={mode}
        disabled={false}
        onSetRuntimeMode={vi.fn()}
      />
    )

    expect(markup).toContain(
      `aria-label="${selectedLabel}（当前）"`
    )
    expect(markup).toContain('aria-pressed="true"')
    expect(markup).toContain('codicon-check')
    expect(markup).toContain(`aria-label="${otherLabel}"`)
    expect(markup).toContain('aria-pressed="false"')
  })
})
