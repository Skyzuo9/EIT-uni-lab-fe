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
  WORKFLOW_SUPPORTING_BRANCH_LEADING_LEFT_SHIFT,
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

    expect(bands).toHaveLength(2)
    expect(firstBandX).toEqual([
      72 - WORKFLOW_SUPPORTING_BRANCH_LEADING_LEFT_SHIFT,
      72 + WORKFLOW_SUPPORTING_BRANCH_NODE_GAP -
        WORKFLOW_SUPPORTING_BRANCH_LEADING_LEFT_SHIFT
    ])
    expect(bands.flat()).toHaveLength(3)
  })

  /** 验证前两条支线仅整组左移，内部顺序和第三条支线位置保持原样。 */
  it('translates only the first two branches left', () => {
    const branches: WorkflowSupportingBranch[] = [
      supportingBranchChain('reagent-a', 0),
      supportingBranchChain('reagent-b', 1),
      supportingBranchChain('reagent-c', 2)
    ]

    const bands = packWorkflowSupportingBranches(branches, 72, 328, 4)
    const placements = bands.flat()

    expect(bands).toHaveLength(3)
    for (const branchId of ['reagent-a', 'reagent-b']) {
      const sourceX = placements.find(({ node }) =>
        node.id === `${branchId}-source`)?.x ?? 0
      const joinX = placements.find(({ node }) =>
        node.id === `${branchId}-join`)?.x ?? 0
      expect(sourceX).toBeGreaterThan(joinX)
      expect(sourceX - joinX).toBe(WORKFLOW_SUPPORTING_BRANCH_NODE_GAP)
      expect(joinX).toBe(
        72 + 328 - WORKFLOW_SUPPORTING_BRANCH_LEADING_LEFT_SHIFT
      )
    }
    expect(placements.find(({ node }) =>
      node.id === 'reagent-c-join')?.x).toBe(72 + 328)
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
function supportingBranch(id: string, order: number): WorkflowSupportingBranch {
  const node: WorkflowNode = {
    id,
    name: id,
    type: 'material_source',
    className: 'MaterialSource',
    labNodeType: 'MaterialSource'
  }
  return {
    nodes: [node],
    anchorIndex: 0,
    anchorColumn: 0,
    order,
    flowDirection: 'into-primary'
  }
}

/**
 * 创建汇入第一行第二列动作的双节点辅助物料支线。
 *
 * @param id 支线测试身份前缀。
 * @param order 支线在同一接入区内的稳定声明顺序。
 * @returns 来源与汇入端组成的辅助物料支线。
 */
function supportingBranchChain(
  id: string,
  order: number
): WorkflowSupportingBranch {
  return {
    nodes: [
      supportingNode(`${id}-source`),
      supportingNode(`${id}-join`)
    ],
    anchorIndex: 1,
    anchorColumn: 1,
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
