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

    expect(bands).toHaveLength(1)
    expect(firstBandX).toEqual([
      72 - WORKFLOW_SUPPORTING_BRANCH_NODE_GAP,
      72 + 328 - WORKFLOW_SUPPORTING_BRANCH_NODE_GAP,
      72 + 2 * 328 - WORKFLOW_SUPPORTING_BRANCH_NODE_GAP
    ])
    expect(bands.flat()).toHaveLength(3)
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
    anchorColumn: order,
    order,
    flowDirection: 'into-primary'
  }
}
