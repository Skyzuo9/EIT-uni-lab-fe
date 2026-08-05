import type {
  WorkflowAuthoringGraph,
  WorkflowNodeJob
} from '@unilab/services'
import { describe, expect, it } from 'vitest'

import {
  aggregateTransferStatus,
  projectWorkflowMaterialTransferRoutes
} from './workflowMaterialTransferScene'

describe('工作流（Workflow）3D 物料转运投影', () => {
  it('只从已发布标准转运复合节点读取库位（Site）关系', () => {
    const graph = transferGraph()

    expect(projectWorkflowMaterialTransferRoutes(graph)).toEqual([{
      id: 'workflow-transfer-transfer-1',
      workflowNodeUuid: 'transfer-1',
      label: '烧杯搬到 S07',
      source: {
        ownerMaterialId: 's3_unused_beaker',
        siteKey: 'L1B1'
      },
      target: {
        ownerMaterialId: 's07_process_warehouse',
        siteKey: 'S0721'
      },
      executorId: 'szlab_mixer_robot',
      status: 'planned'
    }])
  })

  it('忽略名称相似但没有已发布来源身份的节点', () => {
    const graph = transferGraph()
    graph.nodes.push({
      uuid: 'fake-transfer',
      name: 'material_transfer',
      workflow_node_template_uuid: 'plain-template',
      param: graph.nodes[0]?.param
    })
    graph.node_templates.push({
      uuid: 'plain-template',
      name: 'material_transfer'
    })

    expect(projectWorkflowMaterialTransferRoutes(graph)).toHaveLength(1)
  })

  it('按复合节点的子作业聚合权威运行状态', () => {
    const graph = transferGraph()
    graph.nodes.push({
      uuid: 'pick-action',
      parent_uuid: 'transfer-1',
      workflow_node_template_uuid: 'plain-template'
    })
    const jobs = [
      workflowJob('pick-action', 'succeeded'),
      workflowJob('place-action', 'running')
    ]
    graph.nodes.push({
      uuid: 'place-action',
      parent_uuid: 'transfer-1',
      workflow_node_template_uuid: 'plain-template'
    })

    expect(projectWorkflowMaterialTransferRoutes(graph, jobs)[0]?.status)
      .toBe('running')
  })

  it('异常优先于运行和成功状态', () => {
    expect(aggregateTransferStatus([
      { status: 'succeeded' },
      { status: 'running' },
      { status: 'execution_unknown' }
    ])).toBe('attention')
    expect(aggregateTransferStatus([
      { status: 'succeeded' },
      { status: 'failed' }
    ])).toBe('failed')
  })
})

function transferGraph(): WorkflowAuthoringGraph {
  return {
    workflow: { uuid: 'workflow-1', revision: 4 },
    nodes: [{
      uuid: 'transfer-1',
      name: '烧杯搬到 S07',
      workflow_node_template_uuid: 'transfer-template',
      param: {
        source_warehouse: { uuid: 's3_unused_beaker' },
        source_site: 'L1B1',
        target_warehouse: { uuid: 's07_process_warehouse' },
        target_site: 'S0721',
        target_device: 'szlab_mixer_robot'
      }
    }],
    edges: [],
    node_templates: [{
      uuid: 'transfer-template',
      meta_data: {
        unilab: {
          workflow_source: {
            symbol: 's_z_lab_标准物料转运',
            definition_fqid:
              'szlab_poly_studio.workflows.material_transfer.s_z_lab_标准物料转运'
          }
        }
      }
    }],
    handle_templates: []
  }
}
function workflowJob(
  workflowNodeUuid: string,
  status: WorkflowNodeJob['status']
): WorkflowNodeJob {
  return {
    uuid: `job-${workflowNodeUuid}`,
    create_time: '',
    update_time: '',
    meta_data: {},
    workflow_task_uuid: 'task-1',
    workflow_node_uuid: workflowNodeUuid,
    feedback_sequence: 0,
    topological_index: 0,
    executor_kind: 'device_action',
    execution_policy: {},
    execution_timeout_seconds: 30,
    status,
    attempt: 1,
    param: {},
    feedback_data: {},
    return_info: {},
    control_data: {},
    error_info: []
  }
}
