import { describe, expect, it } from 'vitest'

import type {
  BackendWorkflowGraph,
  WorkflowRunPreparation
} from '@unilab/services'

import { projectNestedWorkflow } from './canonicalWorkflow'
import {
  projectEditableBackendWorkflowCanvas,
  projectExistingWorkflowCanvas
} from './existingWorkflowCanvasProjection'

describe('Backend 已有工作流画布投影', () => {
  /** 证明只读运行快照保留 dev 画布所需的节点、位置、端口与有向边。 */
  it('投影完整只读 DAG 而不伪造创作状态', () => {
    const preparation: WorkflowRunPreparation = {
      workflow_uuid: '50000000-0000-4000-8000-000000000001',
      workflow_revision: 3,
      nodes: [{
        workflow_node_uuid: '60000000-0000-4000-8000-000000000001',
        workflow_node_template_uuid: '30000000-0000-4000-8000-000000000001',
        name: '加热至 60°C',
        description: '加热演示节点',
        type: 'device_action',
        action_name: 'auto-heat_chill',
        action_type: 'UniLabJsonCommandAsync',
        disabled: false,
        position: { x: 90, y: 150 },
        handles: [{
          uuid: '40000000-0000-4000-8000-000000000001',
          handle_key: 'output',
          display_name: '输出',
          io_type: 'source',
          value_type: 'material',
          data_key: 'sample'
        }]
      }, {
        workflow_node_uuid: '60000000-0000-4000-8000-000000000002',
        name: '输送 5 mL',
        type: 'device_action',
        disabled: false,
        handles: [{
          uuid: '40000000-0000-4000-8000-000000000002',
          handle_key: 'input',
          display_name: '输入',
          io_type: 'target',
          value_type: 'material'
        }]
      }],
      edges: [{
        uuid: '70000000-0000-4000-8000-000000000001',
        source_node_uuid: '60000000-0000-4000-8000-000000000001',
        target_node_uuid: '60000000-0000-4000-8000-000000000002',
        source_handle_uuid: '40000000-0000-4000-8000-000000000001',
        target_handle_uuid: '40000000-0000-4000-8000-000000000002'
      }]
    }

    expect(projectExistingWorkflowCanvas(preparation)).toMatchObject({
      nodes: [{
        id: preparation.nodes[0]!.workflow_node_uuid,
        name: '加热至 60°C',
        x: 90,
        y: 150,
        authoringReadOnly: true,
        handles: [{
          uuid: preparation.nodes[0]!.handles[0]!.uuid,
          handleKey: 'output',
          ioType: 'source',
          dataKey: 'sample'
        }]
      }, {
        id: preparation.nodes[1]!.workflow_node_uuid,
        name: '输送 5 mL',
        authoringReadOnly: true
      }],
      links: [{
        id: preparation.edges[0]!.uuid,
        source: preparation.nodes[0]!.workflow_node_uuid,
        target: preparation.nodes[1]!.workflow_node_uuid,
        sourceHandleUuid: preparation.edges[0]!.source_handle_uuid,
        targetHandleUuid: preparation.edges[0]!.target_handle_uuid
      }]
    })
  })

  /** 未完成图读取时返回稳定空画布，加载态由组件显式展示。 */
  it('在图快照缺失时返回空结构', () => {
    expect(projectExistingWorkflowCanvas(null)).toEqual({
      nodes: [],
      links: [],
      steps: [],
      error: null
    })
  })

  /**
   * Backend 完整图必须与 Local Authoring 共用组合工作流投影，并原样保留
   * MaterialSource 与上游动作 ResourceSlot 两种边界。
   */
  it('折叠 Backend 原生组合合同并保留两类 ResourceSlot 边界', () => {
    const graph = backendCompositeGraph()
    const projected = projectEditableBackendWorkflowCanvas(graph, {
      readOnly: true
    })
    const collapsed = projectNestedWorkflow(
      projected.nodes,
      projected.links,
      new Set()
    )

    expect(projected.nodes.filter(node => node.groupKind === 'subworkflow'))
      .toHaveLength(2)
    expect(projected.nodes.filter(node => node.visualKind === 'robot-transfer'))
      .toHaveLength(2)
    expect(projected.nodes.every(node => node.authoringReadOnly)).toBe(true)
    expect(collapsed.nodes.map(node => node.id)).toEqual([
      'material-source',
      'transfer-from-source',
      'upstream-action',
      'transfer-from-slot',
      'downstream-action'
    ])
    expect(collapsed.links.map(edgeIdentity)).toEqual([
      'material-source:material-out->transfer-from-source:resource-in',
      'transfer-from-source:resource-out->upstream-action:action-in',
      'upstream-action:action-out->transfer-from-slot:resource-in',
      'transfer-from-slot:resource-out->downstream-action:action-in'
    ])
  })
})

function backendCompositeGraph(): BackendWorkflowGraph {
  const compositeMeta = {
    unilab: {
      composite: {
        version: 1,
        child_workflow_uuid: 'child-transfer',
        child_workflow_revision: 4,
        child_source_hash: 'sha256:source',
        contract_digest: 'sha256:contract'
      },
      workflow_source: {
        symbol: 's_z_lab_标准物料转运',
        definition_fqid:
          'szlab_poly_studio.workflows.material_transfer.s_z_lab_标准物料转运'
      }
    }
  }
  return {
    workflow: { uuid: 'backend-workflow', revision: 9 },
    nodes: [
      backendNode('material-source', 'Material Source', 'material_source', 'source-template'),
      backendNode('transfer-from-source', 'SZLab 标准物料转运', 'workflow', 'composite-template', undefined, compositeMeta),
      backendNode('source-pick', 'pick', 'device_action', 'action-template', 'transfer-from-source'),
      backendNode('upstream-action', '上游 ResourceSlot', 'device_action', 'action-template'),
      backendNode('transfer-from-slot', 'SZLab 标准物料转运', 'workflow', 'composite-template', undefined, compositeMeta),
      backendNode('slot-pick', 'pick', 'device_action', 'action-template', 'transfer-from-slot'),
      backendNode('downstream-action', '下游 ResourceSlot', 'device_action', 'action-template')
    ],
    edges: [
      backendEdge('source-boundary', 'material-source', 'material-out', 'transfer-from-source', 'resource-in'),
      backendEdge('source-result', 'transfer-from-source', 'resource-out', 'upstream-action', 'action-in'),
      backendEdge('slot-boundary', 'upstream-action', 'action-out', 'transfer-from-slot', 'resource-in'),
      backendEdge('slot-result', 'transfer-from-slot', 'resource-out', 'downstream-action', 'action-in')
    ],
    node_templates: [
      { uuid: 'source-template', type: 'material_source', name: 'material_source' },
      {
        uuid: 'composite-template',
        type: 'workflow',
        node_type: 'workflow',
        name: 'workflow:child-transfer:r4',
        meta_data: {
          unilab: {
            workflow_contract: {
              version: 1,
              workflow_uuid: 'child-transfer',
              workflow_revision: 4,
              source_hash: 'sha256:source',
              contract_digest: 'sha256:contract'
            }
          }
        }
      },
      { uuid: 'action-template', type: 'device_action', name: 'action' }
    ],
    handle_templates: [
      backendHandle('material-out', 'source-template', 'material', 'source'),
      backendHandle('resource-in', 'composite-template', 'resource', 'target'),
      backendHandle('resource-out', 'composite-template', 'resource', 'source'),
      backendHandle('action-in', 'action-template', 'resource', 'target'),
      backendHandle('action-out', 'action-template', 'resource', 'source')
    ],
    inventory_requirements: []
  }
}

function backendNode(
  uuid: string,
  name: string,
  type: string,
  templateUuid: string,
  parentUuid?: string,
  metaData?: Record<string, unknown>
): BackendWorkflowGraph['nodes'][number] {
  return {
    uuid,
    name,
    type,
    disabled: false,
    workflow_node_template_uuid: templateUuid,
    ...(parentUuid ? { parent_uuid: parentUuid } : {}),
    ...(metaData ? { meta_data: metaData } : {})
  }
}

function backendEdge(
  uuid: string,
  sourceNodeUuid: string,
  sourceHandleUuid: string,
  targetNodeUuid: string,
  targetHandleUuid: string
): BackendWorkflowGraph['edges'][number] {
  return {
    uuid,
    source_node_uuid: sourceNodeUuid,
    source_handle_uuid: sourceHandleUuid,
    target_node_uuid: targetNodeUuid,
    target_handle_uuid: targetHandleUuid
  }
}

function backendHandle(
  uuid: string,
  templateUuid: string,
  handleKey: string,
  ioType: 'source' | 'target'
): Record<string, unknown> {
  return {
    uuid,
    workflow_node_template_uuid: templateUuid,
    handle_key: handleKey,
    display_name: handleKey,
    io_type: ioType,
    type: 'ResourceSlot'
  }
}

function edgeIdentity(edge: {
  source: string
  sourceHandleUuid?: string | null
  target: string
  targetHandleUuid?: string | null
}): string {
  return `${edge.source}:${edge.sourceHandleUuid ?? ''}->` +
    `${edge.target}:${edge.targetHandleUuid ?? ''}`
}
