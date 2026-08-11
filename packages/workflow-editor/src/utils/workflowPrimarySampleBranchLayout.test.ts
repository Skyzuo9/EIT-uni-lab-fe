import { describe, expect, it } from 'vitest'

import type { WorkflowNode } from './parseWorkflow'
import {
  packWorkflowSupportingBranches,
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
    expect(firstBandX).toEqual([72, 72 + WORKFLOW_SUPPORTING_BRANCH_NODE_GAP])
    expect(bands.flat()).toHaveLength(3)
  })

  /** 验证前部汇入支线沿主样品上游前置，为后续主线保留清晰通道。 */
  it('places leading inbound branches before their primary join', () => {
    const branches: WorkflowSupportingBranch[] = [
      supportingBranchChain('reagent-a', 0),
      supportingBranchChain('reagent-b', 1)
    ]

    const bands = packWorkflowSupportingBranches(branches, 72, 328, 4)
    const placements = bands.flat()

    expect(bands).toHaveLength(2)
    for (const branchId of ['reagent-a', 'reagent-b']) {
      const sourceX = placements.find(({ node }) =>
        node.id === `${branchId}-source`)?.x ?? 0
      const joinX = placements.find(({ node }) =>
        node.id === `${branchId}-join`)?.x ?? 0
      expect(sourceX).toBeLessThan(joinX)
      expect(joinX - sourceX).toBe(WORKFLOW_SUPPORTING_BRANCH_NODE_GAP)
    }
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
