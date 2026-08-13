import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { beforeAll, describe, expect, it } from 'vitest'

let stylesheet = ''
let domainNavigationStylesheet = ''

/** 读取 Workbench 主样式与领域导航样式，供结构性回归断言复用。 */
beforeAll(async () => {
  ;[stylesheet, domainNavigationStylesheet] = await Promise.all([
    readFile(fileURLToPath(new URL('./index.css', import.meta.url)), 'utf8'),
    readFile(
      fileURLToPath(new URL('./workbench-domain-navigation.css', import.meta.url)),
      'utf8'
    )
  ])
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

  /** 证明选择工作区入口以同一弹性轴对齐图标和文案。 */
  it('vertically aligns the workspace icon and label as one control', () => {
    const button = cssRule(
      '.unilab-workbench__bar nav .unilab-workspace-switch'
    )
    const icon = cssRule('.unilab-workspace-switch__icon')

    expect(button).toMatch(/display:\s*inline-flex/u)
    expect(button).toMatch(/align-items:\s*center/u)
    expect(icon).toMatch(/place-items:\s*center/u)
    expect(icon).toMatch(/flex:\s*0 0 14px/u)
  })

  /** 证明大纲不再占用 Workbench 右侧产品导航入口。 */
  it('removes the outline entry from the right product navigation', () => {
    expect(domainNavigationStylesheet).toMatch(
      /\.theia-app-right\s+\.lm-TabBar-tab\[id='shell-tab-outline-view'\]\s*\{[^}]*display:\s*none/u
    )
  })

  /** 证明 Theia 底部面板展开时，运行输出连同表头一起让出空间。 */
  it('hides embedded workflow output while the bottom panel is open', () => {
    expect(stylesheet).toMatch(
      /#theia-bottom-split-panel:has\(\s*> #theia-bottom-content-panel:not\(\.lm-mod-hidden\)\s*\)[\s\S]*?> #theia-main-content-panel[\s\S]*?\.unilab-workbench__surface--workflow[\s\S]*?\.workflow-runtime__results:not\(\.is-fullscreen\)\s*\{\s*display:\s*none !important;/u
    )
  })
})

function cssRule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  const match = stylesheet.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'u'))
  if (!match) throw new Error(`Missing CSS rule: ${selector}`)
  return match[1]!
}
