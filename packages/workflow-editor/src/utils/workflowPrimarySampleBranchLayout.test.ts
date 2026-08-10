import { describe, expect, it } from 'vitest'

import type { WorkflowNode } from './parseWorkflow'
import {
  packWorkflowSupportingBranches,
  WORKFLOW_SUPPORTING_BRANCH_NODE_GAP,
  WORKFLOW_SUPPORTING_BRANCH_TRACK_GAP,
  type WorkflowSupportingBranch
} from './workflowPrimarySampleBranchLayout'

describe('packWorkflowSupportingBranches', () => {
  /** 验证共享接入动作的支线使用独立短轨道，不再通过整列偏移挤进同一带。 */
  it('gives sibling feeds exclusive short tracks', () => {
    const branches: WorkflowSupportingBranch[] = [
      supportingBranch('reagent-a', 0),
      supportingBranch('reagent-b', 1),
      supportingBranch('reagent-c', 2)
    ]

    const bands = packWorkflowSupportingBranches(branches, 72, 328, 4)
    const attachmentPositions = bands.map((band) => band[0]?.x)

    expect(bands).toHaveLength(3)
    expect(attachmentPositions).toEqual([
      72,
      72 - WORKFLOW_SUPPORTING_BRANCH_TRACK_GAP,
      72 - 2 * WORKFLOW_SUPPORTING_BRANCH_TRACK_GAP
    ])
    expect(bands.flat()).toHaveLength(3)
  })

  /** 验证左右半区的多步供料链分别向画布外侧展开，释放主线中央空间。 */
  it('expands multi-step feeds away from the backbone center', () => {
    const branches: WorkflowSupportingBranch[] = [
      supportingBranch('west-feed', 0, 1, 3),
      supportingBranch('east-feed', 1, 2, 3)
    ]

    const bands = packWorkflowSupportingBranches(branches, 72, 328, 4)
    const placements = new Map(
      bands.flat().map(({ node, x }) => [node.id, x])
    )

    expect(placements.get('west-feed-0')).toBe(
      72 + 328 - 2 * WORKFLOW_SUPPORTING_BRANCH_NODE_GAP
    )
    expect(placements.get('west-feed-2')).toBe(72 + 328)
    expect(placements.get('east-feed-0')).toBe(
      72 + 2 * 328 + 2 * WORKFLOW_SUPPORTING_BRANCH_NODE_GAP
    )
    expect(placements.get('east-feed-2')).toBe(72 + 2 * 328)
  })
})

/**
 * 创建接入指定主样品动作的辅助物料支线。
 *
 * @param id 支线稳定测试前缀。
 * @param order 支线声明顺序。
 * @param anchorColumn 支线实际接入的主干列。
 * @param nodeCount 支线包含的顺序节点数。
 * @returns 可验证局部供料轨道的辅助物料支线。
 */
function supportingBranch(
  id: string,
  order: number,
  anchorColumn = 0,
  nodeCount = 1
): WorkflowSupportingBranch {
  const nodes: WorkflowNode[] = Array.from({ length: nodeCount }, (_, index) => ({
    id: nodeCount === 1 ? id : `${id}-${index}`,
    name: id,
    type: index === 0 ? 'material_source' : 'action',
    className: index === 0 ? 'MaterialSource' : 'Action',
    labNodeType: index === 0 ? 'MaterialSource' : 'Action'
  }))
  return {
    nodes,
    anchorIndex: anchorColumn,
    anchorColumn,
    order,
    flowDirection: 'into-primary'
  }
}
