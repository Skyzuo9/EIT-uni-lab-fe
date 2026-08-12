import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { beforeAll, describe, expect, it } from 'vitest'

let stylesheet = ''

beforeAll(async () => {
  stylesheet = await readFile(
    fileURLToPath(new URL('./index.css', import.meta.url)),
    'utf8'
  )
})

describe('environment manager layering and responsive layout', () => {
  it('owns the viewport above every material canvas overlay', () => {
    const overlay = cssRule('.unilab-environment-manager__overlay')
    const panel = cssRule('.unilab-environment-manager')
    const overlayZIndex = Number(overlay.match(/z-index:\s*(\d+)/u)?.[1])

    expect(overlay).toContain('position: fixed')
    expect(overlayZIndex).toBeGreaterThan(1000)
    expect(panel).toContain('position: absolute')
    expect(panel).toMatch(/box-sizing:\s*border-box/u)
    expect(panel).toMatch(/bottom:\s*12px/u)
    expect(panel).not.toMatch(/max-height:/u)
  })

  it('keeps the status rail independently scrollable in short windows', () => {
    const rule = cssRule('.unilab-environment-manager__rail')

    expect(rule).toMatch(/min-height:\s*0/u)
    expect(rule).toMatch(/overflow-y:\s*auto/u)
    expect(rule).toMatch(/overflow-x:\s*hidden/u)
    expect(rule).toMatch(/scrollbar-gutter:\s*stable/u)
  })

  it('uses a high-contrast primary selection for the OS mode control', () => {
    const rule = cssRule('.unilab-environment-manager__mode button.is-active')

    expect(rule).toMatch(/color:\s*#fff/u)
    expect(rule).toMatch(/background:\s*var\(--unilab-color-primary\)/u)
  })

  it('shows complete paths instead of silently truncating runtime facts', () => {
    const rule = cssRule('.unilab-environment-card dd')

    expect(rule).toMatch(/overflow-wrap:\s*anywhere/u)
    expect(rule).toMatch(/white-space:\s*normal/u)
    expect(rule).not.toMatch(/text-overflow:\s*ellipsis/u)
  })
})

function cssRule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  const match = stylesheet.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'u'))
  if (!match) throw new Error(`Missing CSS rule: ${selector}`)
  return match[1]!
}
