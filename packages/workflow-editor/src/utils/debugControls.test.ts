import { describe, expect, it } from 'vitest'
import { workflowDebugControls } from './debugControls'

function controls(
  status: Parameters<typeof workflowDebugControls>[0]['debugStatus'],
  options: {
    enabled?: boolean
    runStatus?: Parameters<typeof workflowDebugControls>[0]['runStatus']
    busy?: boolean
  } = {}
) {
  return workflowDebugControls({
    debugEnabled: options.enabled ?? true,
    debugStatus: status,
    runStatus: options.runStatus ?? 'running',
    busy: options.busy ?? false
  })
}

function enabledCommands(
  status: Parameters<typeof workflowDebugControls>[0]['debugStatus']
): string[] {
  return controls(status)
    .filter((control) => !control.disabled)
    .map((control) => control.command)
}

describe('workflowDebugControls', () => {
  it('defines the seven OS command names exactly once and in toolbar order', () => {
    expect(controls('paused').map((control) => control.command)).toEqual([
      'pause',
      'step',
      'step_over',
      'step_into',
      'continue',
      'terminate',
      'emergency_stop'
    ])
  })

  it('enables step variants, continue, terminate and emergency stop only while paused', () => {
    expect(enabledCommands('paused')).toEqual([
      'step',
      'step_over',
      'step_into',
      'continue',
      'terminate',
      'emergency_stop'
    ])
  })

  it('enables pause and both stop actions while running', () => {
    expect(enabledCommands('running')).toEqual([
      'pause',
      'terminate',
      'emergency_stop'
    ])
    expect(enabledCommands('pause_pending')).toEqual([
      'terminate',
      'emergency_stop'
    ])
  })

  it('blocks every command while busy, disabled, or terminal', () => {
    expect(controls('paused', { busy: true }).every((item) => item.disabled))
      .toBe(true)
    expect(controls('paused', { enabled: false }).every((item) => item.disabled))
      .toBe(true)
    for (const status of ['completed', 'failed', 'cancelled', 'terminated'] as const) {
      expect(controls(status).every((item) => item.disabled)).toBe(true)
    }
  })

  it('describes emergency stop truthfully as run-scoped rather than a site-wide hard stop', () => {
    const emergency = controls('paused').find(
      (control) => control.command === 'emergency_stop'
    )
    expect(emergency?.title).toContain('当前 run')
    expect(emergency?.title).toContain('非全站硬件急停')
  })
})
