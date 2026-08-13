import { Position, getSmoothStepPath } from 'reactflow'
import { describe, expect, it } from 'vitest'

import {
  alignPrimaryMaterialEdgeEndpoints,
  getWorkflowSmoothStepCenter,
  WORKFLOW_SMOOTHSTEP_OFFSET
} from './workflowDagEdgeRouting'

describe('workflowDagEdgeRouting', () => {
  /** 验证相邻纵向分支保持圆角正交折线。 */
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

  /** 验证跨层纵向连线在目标顶侧局部折转。 */
  it('keeps the final bend of a long cross-layer edge near its target', () => {
    expect(getWorkflowSmoothStepCenter({
      sourceX: 110,
      sourceY: 35,
      targetX: -30,
      targetY: 377,
      targetPosition: Position.Top
    })).toEqual({ centerY: 349 })
  })

  /** 验证横向跨层边把最后一个折点收在目标节点左侧。 */
  it('keeps the final bend of a long horizontal edge near its target', () => {
    expect(getWorkflowSmoothStepCenter({
      sourceX: 110,
      sourceY: 35,
      targetX: 477,
      targetY: 170,
      targetPosition: Position.Left,
      direction: 'LR'
    })).toEqual({ centerX: 449 })
  })

  /** 验证反向蛇形行不会把目标右侧 Handle 错路由到左侧。 */
  it('keeps the final bend on a right-side target handle', () => {
    expect(getWorkflowSmoothStepCenter({
      sourceX: 110,
      sourceY: 35,
      targetX: 477,
      targetY: 170,
      targetPosition: Position.Right,
      direction: 'LR'
    })).toEqual({ centerX: 505 })
  })

  /** 主样品横向端口只差一个卡片节距时应吸附为同一水平轴。 */
  it('straightens near-aligned horizontal primary material edges', () => {
    expect(alignPrimaryMaterialEdgeEndpoints({
      sourceX: 100,
      sourceY: 166,
      targetX: 300,
      targetY: 197,
      direction: 'LR',
      materialRole: 'primary_sample'
    })).toEqual({
      sourceX: 100,
      sourceY: 181.5,
      targetX: 300,
      targetY: 181.5,
      direction: 'LR',
      materialRole: 'primary_sample'
    })
  })

  /** 主样品纵向端口的 React Flow 微偏移同样吸附为竖直轴。 */
  it('straightens near-aligned vertical primary material edges', () => {
    expect(alignPrimaryMaterialEdgeEndpoints({
      sourceX: 528,
      sourceY: 100,
      targetX: 512,
      targetY: 300,
      direction: 'TB',
      materialRole: 'primary_sample'
    })).toEqual({
      sourceX: 520,
      sourceY: 100,
      targetX: 520,
      targetY: 300,
      direction: 'TB',
      materialRole: 'primary_sample'
    })
  })

  /** 蛇形换行及辅助物料仍保留真实转向，不被近同轴规则改写。 */
  it('preserves real turns and non-primary material routes', () => {
    const turn = {
      sourceX: 100,
      sourceY: 166,
      targetX: 300,
      targetY: 466,
      direction: 'LR' as const,
      materialRole: 'primary_sample'
    }
    const supporting = {
      sourceX: 100,
      sourceY: 166,
      targetX: 300,
      targetY: 197,
      direction: 'LR' as const,
      materialRole: 'reagent'
    }

    expect(alignPrimaryMaterialEdgeEndpoints(turn)).toEqual(turn)
    expect(alignPrimaryMaterialEdgeEndpoints(supporting)).toEqual(supporting)
  })
})
