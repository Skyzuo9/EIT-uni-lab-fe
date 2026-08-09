import { describe, expect, it, vi } from 'vitest'

import { RendererConsoleLogLimiter } from './rendererConsoleLogLimiter'

describe('RendererConsoleLogLimiter', () => {
  it('caps a plugin-host error storm and resets in the next window', () => {
    const limiter = new RendererConsoleLogLimiter({
      limit: 2,
      windowMs: 1_000
    })

    expect(limiter.accept(100)).toEqual({ log: true, reportSuppressed: false })
    expect(limiter.accept(200)).toEqual({ log: true, reportSuppressed: false })
    expect(limiter.accept(300)).toEqual({ log: false, reportSuppressed: true })
    expect(limiter.accept(400)).toEqual({ log: false, reportSuppressed: false })
    expect(limiter.accept(1_101)).toEqual({ log: true, reportSuppressed: false })
  })

  it('records the first errors and reports one suppression marker', () => {
    const limiter = new RendererConsoleLogLimiter({ limit: 1, windowMs: 2_000 })
    const log = vi.fn()
    const trace = { record: vi.fn() }
    const now = vi.spyOn(Date, 'now').mockReturnValue(100)
    const entry = {
      level: 3,
      message: 'plugin transport failed',
      line: 42,
      sourceId: 'plugin-host.js'
    }

    limiter.record(entry, log, trace)
    limiter.record(entry, log, trace)
    limiter.record(entry, log, trace)

    expect(log).toHaveBeenNthCalledWith(
      1,
      'renderer console: plugin transport failed (plugin-host.js:42)'
    )
    expect(log).toHaveBeenNthCalledWith(
      2,
      'renderer console: 高频错误已限流（2 秒窗口最多记录 1 条）'
    )
    expect(trace.record).toHaveBeenNthCalledWith(
      1,
      'electron.renderer.console',
      expect.objectContaining({ 'log.message': 'plugin transport failed' })
    )
    expect(trace.record).toHaveBeenNthCalledWith(
      2,
      'electron.renderer.console_limited'
    )
    now.mockRestore()
  })
})
