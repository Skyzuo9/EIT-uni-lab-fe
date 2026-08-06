import { describe, expect, it } from 'vitest'

import type { WorkflowLink, WorkflowNode } from './parseWorkflow'
import { layoutVisibleWorkflowDag } from './workflowDagLayout'

describe('layoutVisibleWorkflowDag', () => {
  /** 验证物料来源与动作节点共同参与纵向分层，并且同层不重叠。 */
  it('lays out every visible node in non-overlapping horizontal layers', async () => {
    const nodes = [
      workflowNode('fine-powder', 'material_source'),
      workflowNode('sample-vial', 'material_source'),
      workflowNode('prepare', 'action'),
      workflowNode('open', 'action'),
      workflowNode('finish', 'action')
    ]
    const links: WorkflowLink[] = [
      { source: 'fine-powder', target: 'prepare', type: 'material' },
      { source: 'sample-vial', target: 'open', type: 'material' },
      { source: 'prepare', target: 'finish', type: 'ready' },
      { source: 'open', target: 'finish', type: 'ready' }
    ]

    const result = await layoutVisibleWorkflowDag(nodes, links)
    const byId = new Map(result.nodes.map((node) => [node.id, node]))

    expect(result.nodes).toHaveLength(nodes.length)
    expect(byId.get('fine-powder')?.y).toBe(byId.get('sample-vial')?.y)
    expect(byId.get('prepare')?.y).toBe(byId.get('open')?.y)
    expect(byId.get('prepare')?.y).toBeGreaterThan(
      byId.get('fine-powder')?.y ?? 0
    )
    expect(byId.get('finish')?.y).toBeGreaterThan(byId.get('prepare')?.y ?? 0)
    expect(Math.abs(
      (byId.get('fine-powder')?.x ?? 0) -
      (byId.get('sample-vial')?.x ?? 0)
    )).toBeGreaterThanOrEqual(216)
    expect(new Set(
      result.nodes.map((node) => `${node.x}:${node.y}`)
    ).size).toBe(nodes.length)
  })
})

/**
 * 创建布局测试所需的最小工作流节点。
 *
 * @param id 节点 UUID。
 * @param type 节点类型。
 * @returns 不含历史坐标的工作流节点。
 */
function workflowNode(id: string, type: string): WorkflowNode {
  return {
    id,
    name: id,
    type,
    className: '',
    labNodeType: ''
  }
}
