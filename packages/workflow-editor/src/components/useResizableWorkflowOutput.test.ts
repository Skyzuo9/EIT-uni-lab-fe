import { describe, expect, it } from 'vitest'

import {
  MINIMUM_OUTPUT_HEIGHT,
  maximumWorkflowOutputHeight,
  resizedWorkflowOutputHeight,
  workflowOutputAvailableHeight
} from './useResizableWorkflowOutput'

describe('resizedWorkflowOutputHeight', () => {
  it('grows the bottom output when the separator is dragged upward', () => {
    expect(resizedWorkflowOutputHeight(240, 500, 400, 180, 600)).toBe(340)
  })

  it('clamps pointer movement to the reachable panel limits', () => {
    expect(resizedWorkflowOutputHeight(240, 500, 700, 180, 600)).toBe(180)
    expect(resizedWorkflowOutputHeight(240, 500, 0, 180, 600)).toBe(600)
    expect(resizedWorkflowOutputHeight(
      120,
      500,
      900,
      MINIMUM_OUTPUT_HEIGHT,
      600
    )).toBe(MINIMUM_OUTPUT_HEIGHT)
  })
})

describe('workflowOutputAvailableHeight', () => {
  it('uses the whole workflow viewport instead of the short runtime wrapper', () => {
    const workflow = {
      getBoundingClientRect: () => ({ height: 700 })
    }
    const panel = {
      closest: () => workflow,
      parentElement: {
        getBoundingClientRect: () => ({ height: 354 })
      }
    } as unknown as HTMLElement

    expect(workflowOutputAvailableHeight(panel, 900)).toBe(700)
  })
})

describe('maximumWorkflowOutputHeight', () => {
  it('keeps at least 360px available for the workflow canvas', () => {
    expect(maximumWorkflowOutputHeight(700)).toBe(340)
    expect(maximumWorkflowOutputHeight(900)).toBe(495)
  })

  it('caps output growth on tall and short viewports', () => {
    expect(maximumWorkflowOutputHeight(1_600)).toBe(720)
    expect(maximumWorkflowOutputHeight(420)).toBe(60)
  })
})
