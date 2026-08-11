import { describe, expect, it } from 'vitest'

import { resizedWorkflowOutputHeight } from './useResizableWorkflowOutput'

describe('resizedWorkflowOutputHeight', () => {
  it('grows the bottom output when the separator is dragged upward', () => {
    expect(resizedWorkflowOutputHeight(240, 500, 400, 180, 600)).toBe(340)
  })

  it('clamps pointer movement to the reachable panel limits', () => {
    expect(resizedWorkflowOutputHeight(240, 500, 700, 180, 600)).toBe(180)
    expect(resizedWorkflowOutputHeight(240, 500, 0, 180, 600)).toBe(600)
  })
})
