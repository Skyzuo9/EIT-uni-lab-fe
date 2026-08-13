import { describe, expect, it } from 'vitest'

import type { WorkflowRunPreparation } from '@unilab/services'

import { projectExistingWorkflowCanvas } from './existingWorkflowCanvasProjection'

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
})
