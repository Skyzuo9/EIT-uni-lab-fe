import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import PlatformCapabilityNotice from './PlatformCapabilityNotice'

describe('PlatformCapabilityNotice', () => {
  it('hands platform-only work to the formal Workbench command', () => {
    const markup = renderToStaticMarkup(
      <PlatformCapabilityNotice
        title="请在 Uni-Lab Workbench 中继续"
        description="启动完整 Workbench 后继续操作。"
        dependency="该流程需要本地后端。"
      />
    )

    expect(markup).toContain('pnpm workbench')
    expect(markup).toContain('从 Uni-Lab Workbench 继续')
    expect(markup).not.toContain('pnpm dev:desktop')
    expect(markup).not.toContain('Electron 桌面调试台')
  })
})
