import { describe, expect, it } from 'vitest'

import type {
  WorkflowHandlePort,
  WorkflowLink,
  WorkflowNode
} from './parseWorkflow'
import {
  packWorkflowSupportingBranches,
  routeWorkflowTransferPorts,
  workflowEdgeDirectionForPorts,
  WORKFLOW_SUPPORTING_BRANCH_MATERIAL_SOURCE_PITCH,
  WORKFLOW_SUPPORTING_BRANCH_NODE_GAP,
  type WorkflowSupportingBranch
} from './workflowPrimarySampleBranchLayout'

describe('packWorkflowSupportingBranches', () => {
  /** 验证共享接入动作的短支线优先横向扇入，而不是形成长距离竖塔。 */
  it('fans sibling branches into the same compact band', () => {
    const branches: WorkflowSupportingBranch[] = [
      supportingBranch('reagent-a', 0),
      supportingBranch('reagent-b', 1),
      supportingBranch('reagent-c', 2)
    ]

    const bands = packWorkflowSupportingBranches(branches, 72, 328, 4)
    const firstBandX = bands[0]?.map(({ x }) => x) ?? []

    expect(bands).toHaveLength(1)
    expect(firstBandX).toEqual([
      72 - WORKFLOW_SUPPORTING_BRANCH_NODE_GAP -
        2 * WORKFLOW_SUPPORTING_BRANCH_MATERIAL_SOURCE_PITCH,
      72 - WORKFLOW_SUPPORTING_BRANCH_NODE_GAP -
        WORKFLOW_SUPPORTING_BRANCH_MATERIAL_SOURCE_PITCH,
      72 - WORKFLOW_SUPPORTING_BRANCH_NODE_GAP
    ])
    expect(firstBandX[1]! - firstBandX[0]!)
      .toBe(WORKFLOW_SUPPORTING_BRANCH_MATERIAL_SOURCE_PITCH)
    expect(firstBandX[2]! - firstBandX[1]!)
      .toBe(WORKFLOW_SUPPORTING_BRANCH_MATERIAL_SOURCE_PITCH)
    expect(bands.flat()).toHaveLength(3)
  })

  /** 反向蛇形行的来源簇仍应位于接入点右侧，并保持相同紧凑节距。 */
  it('keeps a compact source cluster in front of a reverse row attachment', () => {
    const branches: WorkflowSupportingBranch[] = [
      supportingBranch('consumable-a', 0, 4, 3),
      supportingBranch('consumable-b', 1, 4, 3),
      supportingBranch('consumable-c', 2, 4, 3)
    ]
    const anchorX = 72 + 3 * 328

    const bands = packWorkflowSupportingBranches(branches, 72, 328, 4)
    const positions = bands[0]?.map(({ x }) => x) ?? []

    expect(bands).toHaveLength(1)
    expect(positions.every((x) => x > anchorX)).toBe(true)
    expect(positions[1]! - positions[0]!)
      .toBe(WORKFLOW_SUPPORTING_BRANCH_MATERIAL_SOURCE_PITCH)
    expect(positions[2]! - positions[1]!)
      .toBe(WORKFLOW_SUPPORTING_BRANCH_MATERIAL_SOURCE_PITCH)
  })

  /** 验证跨上下带的转运物料输出改走北侧，同带物料输入仍保持东西向。 */
  it('faces transfer material handles along their vertical displacement', () => {
    const materialSource = materialHandle('material-source', 'source')
    const materialTarget = materialHandle('material-target', 'target')
    const lower = supportingNode('lower-transfer')
    lower.visualKind = 'robot-transfer'
    lower.handles = [materialSource]
    const upper = supportingNode('upper-transfer')
    upper.handles = [materialTarget]
    const links: WorkflowLink[] = [{
      source: lower.id,
      sourceHandleUuid: materialSource.uuid,
      target: upper.id,
      targetHandleUuid: materialTarget.uuid,
      type: 'control'
    }]
    const ports = new Map([
      [lower.id, { target: 'left', source: 'right' } as const],
      [upper.id, { target: 'left', source: 'right' } as const]
    ])

    routeWorkflowTransferPorts(
      [lower, upper],
      links,
      new Map([
        [lower.id, { x: 300, y: 200 }],
        [upper.id, { x: 72, y: 72 }]
      ]),
      ports
    )

    expect(ports.get(lower.id)).toEqual({
      target: 'left',
      source: 'top'
    })
    expect(ports.get(upper.id)).toEqual({
      target: 'left',
      source: 'right'
    })
    expect(workflowEdgeDirectionForPorts(links[0]!, ports)).toBe('TB')
  })
})

/** 创建接入第一列主样品动作的单节点辅助物料支线。 */
function supportingBranch(
  id: string,
  order: number,
  anchorIndex = 0,
  anchorColumn = 0
): WorkflowSupportingBranch {
  const node: WorkflowNode = {
    id,
    name: id,
    type: 'material_source',
    className: 'MaterialSource',
    labNodeType: 'MaterialSource'
  }
  return {
    nodes: [node],
    anchorIndex,
    anchorColumn,
    order,
    flowDirection: 'into-primary'
  }
}

/**
 * 创建支线布局测试使用的最小工作流（Workflow）节点。
 *
 * @param id 节点稳定测试身份。
 * @returns 不承载执行语义的最小物料相关节点。
 */
function supportingNode(id: string): WorkflowNode {
  return {
    id,
    name: id,
    type: 'action',
    className: 'Action',
    labNodeType: 'Action'
  }
}

/** 创建物料占位符（ResourceSlot）测试句柄。 */
function materialHandle(
  uuid: string,
  ioType: 'source' | 'target'
): WorkflowHandlePort {
  return {
    uuid,
    handleKey: 'material',
    displayName: 'material',
    ioType,
    valueType: 'ResourceSlot',
    valueSchema: { $slot: 'ResourceSlot' }
  }
}
