import { describe, expect, it } from 'vitest'

import type { WorkflowRunPreparation } from '@unilab/services'

import { projectExistingWorkflowCanvas } from './existingWorkflowCanvasProjection'
import {
  projectMaterialTraces,
  workflowMaterialRoleOptions
} from './workflowMaterialTrace'

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
          value_type: 'ResourceSlot',
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
          value_type: 'ResourceSlot'
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

  /**
   * 物料来源（MaterialSource）的角色必须穿过 Backend 适配层，使共享画布自动
   * 选择主样品蛇形，并同时提供主物料聚焦与完整支线两种投影。
   */
  it('为主样品蛇形和完整支线建立 Backend 物料谱系', () => {
    const preparation: WorkflowRunPreparation = {
      workflow_uuid: '50000000-0000-4000-8000-000000000001',
      workflow_revision: 4,
      nodes: [
        materialSourceNode('sample-source', '主样品', 'primary_sample'),
        materialSourceNode('reagent-source', '试剂', 'reagent'),
        {
          workflow_node_uuid: 'reaction',
          name: '反应',
          type: 'device_action',
          disabled: false,
          handles: [
            materialHandle('sample-input', 'sample', 'target'),
            materialHandle('reagent-input', 'reagent', 'target')
          ]
        }
      ],
      edges: [{
        uuid: 'sample-edge',
        source_node_uuid: 'sample-source',
        target_node_uuid: 'reaction',
        source_handle_uuid: 'sample-source-output',
        target_handle_uuid: 'sample-input'
      }, {
        uuid: 'reagent-edge',
        source_node_uuid: 'reagent-source',
        target_node_uuid: 'reaction',
        source_handle_uuid: 'reagent-source-output',
        target_handle_uuid: 'reagent-input'
      }]
    }

    const structure = projectExistingWorkflowCanvas(preparation)
    const projection = projectMaterialTraces(structure.nodes, structure.links)

    expect(structure.nodes[0]).toMatchObject({
      type: 'material_source',
      materialSource: {
        flowRole: 'primary_sample',
        mountUuid: 'sample-source-mount'
      }
    })
    expect(workflowMaterialRoleOptions(projection).map(({ value }) => value))
      .toEqual(['primary_sample', 'reagent'])
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
})

/** 构造 Backend 已有工作流中的物料来源（MaterialSource）节点。 */
function materialSourceNode(
  nodeUuid: string,
  name: string,
  flowRole: string
): WorkflowRunPreparation['nodes'][number] {
  return {
    workflow_node_uuid: nodeUuid,
    workflow_node_template_uuid: `${nodeUuid}-template`,
    name,
    type: 'material_source',
    disabled: false,
    material_source: {
      mode: 'existing',
      flow_role: flowRole,
      mount_uuid: `${nodeUuid}-mount`,
      resource_template_uuid: `${nodeUuid}-resource-template`
    },
    handles: [materialHandle(
      `${nodeUuid}-output`,
      nodeUuid,
      'source'
    )]
  }
}

/** 构造一条物料占位符（ResourceSlot）Handle 合同。 */
function materialHandle(
  uuid: string,
  dataKey: string,
  ioType: 'source' | 'target'
): WorkflowRunPreparation['nodes'][number]['handles'][number] {
  return {
    uuid,
    handle_key: dataKey,
    display_name: dataKey,
    io_type: ioType,
    value_type: 'ResourceSlot',
    data_key: dataKey
  }
}
