import { describe, expect, it } from 'vitest'

import type {
  WorkflowHandlePort,
  WorkflowLink,
  WorkflowNode
} from './parseWorkflow'
import { layoutWorkflowMaterialSwimlanes } from './workflowMaterialSwimlaneLayout'
import { projectMaterialTraces } from './workflowMaterialTrace'
import { layoutWorkflowPrimarySampleFlow } from './workflowPrimarySampleLayout'
import { projectWorkflowSampleBackbone } from './workflowSampleBackbone'

describe('projectWorkflowSampleBackbone', () => {
  /** 验证每次两个样品交汇后，主线切换到唯一的新样品输出。 */
  it('switches from the incoming vial to the plate and then collected vial', () => {
    const nodes = sampleConvergenceNodes()
    const links = sampleConvergenceLinks()

    const result = projectWorkflowSampleBackbone(
      nodes,
      links,
      projectMaterialTraces(nodes, links)
    )

    expect(result.hasPrimarySample).toBe(true)
    expect(result.lineageKeys).toEqual([
      'incoming-vial-source',
      'blank-plate-source',
      'collection-vial-source'
    ])
    expect(result.nodeIds).toEqual([
      'incoming-vial-source',
      'spot-sample',
      'develop-plate',
      'collect-powder',
      'archive-vial'
    ])
    expect(result.nodeIds).not.toContain('blank-plate-source')
    expect(result.nodeIds).not.toContain('collection-vial-source')

    const snake = layoutWorkflowPrimarySampleFlow(nodes, links)
    const vertical = layoutWorkflowMaterialSwimlanes(nodes, links, 'vertical')
    const horizontal = layoutWorkflowMaterialSwimlanes(
      nodes,
      links,
      'horizontal'
    )
    expect(snake.primarySample?.backboneNodeIds).toEqual(result.nodeIds)
    expect(vertical.swimlanes.sampleBackboneNodeIds).toEqual(result.nodeIds)
    expect(horizontal.swimlanes.sampleBackboneNodeIds).toEqual(result.nodeIds)
    expect(vertical.swimlanes.sampleBackboneLineageKeys).toEqual(
      result.lineageKeys
    )
    expect(horizontal.swimlanes.sampleBackboneLineageKeys).toEqual(
      result.lineageKeys
    )
  })

  /** 验证交汇点保留旧样品支线时，主线仍切到唯一的新样品输出。 */
  it('switches to the only new sample while retaining the prior sample branch', () => {
    const nodes = sampleConvergenceNodes()
    const collect = nodes.find((node) => node.id === 'collect-powder')!
    collect.handles = [
      ...(collect.handles ?? []),
      resourceSlotHandle('collect-plate-output', 'plate', 'source')
    ]
    const links = [
      ...sampleConvergenceLinks(),
      materialLink(
        'collect-powder',
        'collect-plate-output',
        'archive-plate',
        'archive-plate-input'
      )
    ]
    nodes.push(actionNode('archive-plate', [
      resourceSlotHandle('archive-plate-input', 'plate', 'target')
    ]))

    const result = projectWorkflowSampleBackbone(
      nodes,
      links,
      projectMaterialTraces(nodes, links)
    )

    expect(result.lineageKeys).toEqual([
      'incoming-vial-source',
      'blank-plate-source',
      'collection-vial-source'
    ])
    expect(result.nodeIds).toEqual([
      'incoming-vial-source',
      'spot-sample',
      'develop-plate',
      'collect-powder',
      'archive-vial'
    ])
    expect(result.nodeIds).not.toContain('archive-plate')
  })
})

/** 构造“进料瓶→硅胶板→收集瓶”的最小物料谱系节点。 */
function sampleConvergenceNodes(): WorkflowNode[] {
  return [
    materialSourceNode(
      'incoming-vial-source',
      '进料玻璃瓶',
      'primary_sample',
      resourceSlotHandle('incoming-vial-output', 'sample_vial', 'source')
    ),
    materialSourceNode(
      'blank-plate-source',
      '空白 pTLC 板',
      'aliquot_sample',
      resourceSlotHandle('blank-plate-output', 'plate', 'source')
    ),
    actionNode('spot-sample', [
      resourceSlotHandle('spot-vial-input', 'sample_vial', 'target'),
      resourceSlotHandle('spot-plate-input', 'plate', 'target'),
      resourceSlotHandle('spot-plate-output', 'plate', 'source')
    ]),
    actionNode('develop-plate', [
      resourceSlotHandle('develop-plate-input', 'plate', 'target'),
      resourceSlotHandle('develop-plate-output', 'plate', 'source')
    ]),
    materialSourceNode(
      'collection-vial-source',
      '空收集瓶',
      'aliquot_sample',
      resourceSlotHandle('collection-vial-output', 'vial', 'source')
    ),
    actionNode('collect-powder', [
      resourceSlotHandle('collect-plate-input', 'plate', 'target'),
      resourceSlotHandle('collect-vial-input', 'vial', 'target'),
      resourceSlotHandle('collect-vial-output', 'vial', 'source')
    ]),
    actionNode('archive-vial', [
      resourceSlotHandle('archive-vial-input', 'vial', 'target')
    ])
  ]
}

/** 返回最小样品谱系中全部有类型物料边。 */
function sampleConvergenceLinks(): WorkflowLink[] {
  return [
    materialLink(
      'incoming-vial-source',
      'incoming-vial-output',
      'spot-sample',
      'spot-vial-input'
    ),
    materialLink(
      'blank-plate-source',
      'blank-plate-output',
      'spot-sample',
      'spot-plate-input'
    ),
    materialLink(
      'spot-sample',
      'spot-plate-output',
      'develop-plate',
      'develop-plate-input'
    ),
    materialLink(
      'develop-plate',
      'develop-plate-output',
      'collect-powder',
      'collect-plate-input'
    ),
    materialLink(
      'collection-vial-source',
      'collection-vial-output',
      'collect-powder',
      'collect-vial-input'
    ),
    materialLink(
      'collect-powder',
      'collect-vial-output',
      'archive-vial',
      'archive-vial-input'
    )
  ]
}

/** 创建带物料流角色（MaterialFlowRole）的物料来源（MaterialSource）。 */
function materialSourceNode(
  id: string,
  name: string,
  flowRole: string,
  output: WorkflowHandlePort
): WorkflowNode {
  return {
    ...actionNode(id, [output]),
    name,
    type: 'material_source',
    className: 'material_source',
    labNodeType: 'material_source',
    materialSource: {
      mode: 'existing',
      flowRole,
      mountUuid: `${id}-mount`,
      resourceTemplateUuid: `${id}-template`
    }
  }
}

/** 创建最小动作（Action）节点；句柄是该节点公开的物料合同。 */
function actionNode(
  id: string,
  handles: WorkflowHandlePort[]
): WorkflowNode {
  return {
    id,
    name: id,
    type: 'action',
    className: 'action',
    labNodeType: 'action',
    handles
  }
}

/** 创建有类型物料占位符（ResourceSlot）句柄。 */
function resourceSlotHandle(
  uuid: string,
  dataKey: string,
  ioType: 'source' | 'target'
): WorkflowHandlePort {
  return {
    uuid,
    handleKey: dataKey,
    displayName: dataKey,
    ioType,
    valueType: 'ResourceSlot',
    valueSchema: { $slot: 'ResourceSlot' },
    dataKey,
    editorControl: 'material_port',
    allowedResourceTemplateUuids: null,
    implicitPassthrough: false
  }
}

/** 创建连接两个物料占位符（ResourceSlot）句柄的工作流边。 */
function materialLink(
  source: string,
  sourceHandleUuid: string,
  target: string,
  targetHandleUuid: string
): WorkflowLink {
  return {
    source,
    sourceHandleUuid,
    target,
    targetHandleUuid,
    type: 'material'
  }
}
