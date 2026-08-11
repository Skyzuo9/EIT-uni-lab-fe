import { describe, expect, it } from 'vitest'

import type {
  WorkflowHandlePort,
  WorkflowLink,
  WorkflowNode
} from './parseWorkflow'
import { projectWorkflowReactionMaterialAnnotations } from './workflowReactionMaterialProjection'

describe('projectWorkflowReactionMaterialAnnotations', () => {
  /** 验证辅助试剂只在实际汇入主样品（Primary Sample）的反应步骤显示一次。 */
  it('projects a supporting reagent at its primary-sample join', () => {
    const nodes = [
      materialSource('sample', '主样品', 'primary_sample', 'sample-output'),
      materialSource('reagent', '无水乙醇', 'reagent', 'reagent-output'),
      actionNode('prepare-reagent', [
        handle('prepare-input', 'reagent', 'target'),
        handle('prepare-output', 'reagent', 'source')
      ]),
      actionNode('react', [
        handle('react-sample-input', 'sample', 'target'),
        handle('react-reagent-input', 'reagent', 'target')
      ])
    ]
    const links: WorkflowLink[] = [
      materialLink('sample', 'sample-output', 'react', 'react-sample-input'),
      materialLink(
        'reagent',
        'reagent-output',
        'prepare-reagent',
        'prepare-input'
      ),
      materialLink(
        'prepare-reagent',
        'prepare-output',
        'react',
        'react-reagent-input'
      )
    ]

    const annotations = projectWorkflowReactionMaterialAnnotations(
      nodes,
      links,
      new Set(['sample', 'react'])
    )

    expect(annotations).toEqual([{
      targetNodeUuid: 'react',
      targetNodeName: '反应',
      items: [expect.objectContaining({
        sourceNodeUuid: 'reagent',
        sourceNodeName: '无水乙醇',
        materialRole: 'reagent',
        materialRoleLabel: '试剂'
      })]
    }])
  })

  /** 验证主样品自身与纯控制边不会被误标成辅助反应物。 */
  it('excludes the primary sample and structural links', () => {
    const nodes = [
      materialSource('sample', '主样品', 'primary_sample', 'sample-output'),
      actionNode('react', [handle('react-input', 'sample', 'target')])
    ]
    const links: WorkflowLink[] = [
      materialLink('sample', 'sample-output', 'react', 'react-input'),
      { source: 'sample', target: 'react', type: 'communication' }
    ]

    expect(projectWorkflowReactionMaterialAnnotations(
      nodes,
      links,
      new Set(['sample', 'react'])
    )).toEqual([])
  })
})

/** 创建测试用物料来源（MaterialSource）。 */
function materialSource(
  id: string,
  name: string,
  flowRole: string,
  outputUuid: string
): WorkflowNode {
  return {
    id,
    name,
    type: 'material_source',
    className: 'MaterialSource',
    labNodeType: 'MaterialSource',
    materialSource: {
      mode: 'inventory',
      flowRole,
      mountUuid: `${id}-mount`,
      resourceTemplateUuid: `${id}-template`
    },
    handles: [handle(outputUuid, id, 'source')]
  }
}

/** 创建测试用动作节点。 */
function actionNode(
  id: string,
  handles: WorkflowHandlePort[]
): WorkflowNode {
  return {
    id,
    name: id === 'react' ? '反应' : '配制试剂',
    type: 'action',
    className: 'Action',
    labNodeType: 'Action',
    handles
  }
}

/** 创建测试用物料占位符（ResourceSlot）Handle。 */
function handle(
  uuid: string,
  dataKey: string,
  ioType: 'source' | 'target'
): WorkflowHandlePort {
  return {
    uuid,
    handleKey: dataKey,
    dataKey,
    displayName: dataKey,
    ioType,
    valueType: 'ResourceSlot'
  }
}

/** 创建测试用物料流（MaterialFlow）边。 */
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
    type: 'control'
  }
}
