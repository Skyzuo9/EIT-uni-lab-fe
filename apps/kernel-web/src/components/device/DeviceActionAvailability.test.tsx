import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { DeviceActionAvailability } from './DevicePanel'

describe('device action Runtime availability', () => {
  it('keeps direct execution unavailable until an applied Workflow owns the Task', () => {
    const markup = renderToStaticMarkup(<DeviceActionAvailability />)

    expect(markup).toContain('请在工作流中运行')
    expect(markup).toContain('disabled')
  })
})
