import { Position, getSmoothStepPath } from 'reactflow'
import { describe, expect, it } from 'vitest'

import {
  getWorkflowSmoothStepCenter,
  WORKFLOW_SMOOTHSTEP_OFFSET
} from './workflowDagEdgeRouting'

describe('workflowDagEdgeRouting', () => {
  it('keeps adjacent vertical branches orthogonal with rounded corners', () => {
    const [path] = getSmoothStepPath({
      sourceX: 110,
      sourceY: 235,
      sourcePosition: Position.Bottom,
      targetX: -30,
      targetY: 377,
      targetPosition: Position.Top,
      borderRadius: 8,
      offset: WORKFLOW_SMOOTHSTEP_OFFSET
    })

    expect(path).toContain('Q')
    expect(path).toContain('M110 235L110 243')
  })

  it('keeps the final bend of a long cross-layer edge near its target', () => {
    expect(getWorkflowSmoothStepCenter({
      sourceX: 110,
      sourceY: 35,
      targetX: -30,
      targetY: 377
    })).toEqual({ centerY: 349 })
  })

  /** 验证横向跨层边把最后一个折点收在目标节点左侧。 */
  it('keeps the final bend of a long horizontal edge near its target', () => {
    expect(getWorkflowSmoothStepCenter({
      sourceX: 110,
      sourceY: 35,
      targetX: 477,
      targetY: 170,
      direction: 'LR'
    })).toEqual({ centerX: 449 })
  })
})
