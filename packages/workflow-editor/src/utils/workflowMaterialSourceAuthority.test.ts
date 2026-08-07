import type {
  WorkflowAuthoringGraph,
  WorkflowMaterialSourceCatalogSnapshot,
  WorkflowRuntimePort
} from '@unilab/services'
import { describe, expect, it, vi } from 'vitest'

import {
  rehydrateWorkflowMaterialSourceAuthority,
  workflowMaterialSourceAuthorityBlockedReason
} from './workflowMaterialSourceAuthority'

const templateUuid = '10000000-0000-4000-8000-000000000001'
const resourceTemplateUuid = '20000000-0000-4000-8000-000000000001'
const mountUuid = '30000000-0000-4000-8000-000000000001'
const nodeUuid = '40000000-0000-4000-8000-000000000001'

describe('物料来源目录运行前重读', () => {
  it('候选先于目录更新时重读最新快照并解除旧引用门禁', async () => {
    const staleCatalog = catalog([])
    const currentCatalog = catalog([{ uuid: mountUuid }])
    const runtime = {
      getWorkflowMaterialSourceCatalog: vi.fn()
        .mockResolvedValue(currentCatalog)
    } as unknown as Pick<
      WorkflowRuntimePort,
      'getWorkflowMaterialSourceCatalog'
    >

    const result = await rehydrateWorkflowMaterialSourceAuthority(
      runtime,
      graph()
    )

    expect(
      workflowMaterialSourceAuthorityBlockedReason(staleCatalog, graph())
    ).toContain(`挂载点 ${mountUuid}`)
    expect(runtime.getWorkflowMaterialSourceCatalog).toHaveBeenCalledOnce()
    expect(result.catalog).toBe(currentCatalog)
    expect(result.blockedReason).toBeNull()
  })

  it('重读后仍失效时返回节点名称和具体挂载物料 UUID', async () => {
    const currentCatalog = catalog([])
    const runtime = {
      getWorkflowMaterialSourceCatalog: vi.fn()
        .mockResolvedValue(currentCatalog)
    } as unknown as Pick<
      WorkflowRuntimePort,
      'getWorkflowMaterialSourceCatalog'
    >

    const result = await rehydrateWorkflowMaterialSourceAuthority(
      runtime,
      graph()
    )

    expect(result.blockedReason).toContain('样品来源')
    expect(result.blockedReason).toContain(`挂载点 ${mountUuid}`)
  })
})

/**
 * 构造仅覆盖运行前权威重读所需字段的工作流（Workflow）图。
 *
 * @returns 带一个物料来源（MaterialSource）节点的候选图。
 */
function graph(): WorkflowAuthoringGraph {
  return {
    workflow: {},
    nodes: [{
      uuid: nodeUuid,
      workflow_node_template_uuid: templateUuid,
      name: '样品来源',
      type: 'material_source',
      material_uuid: null,
      param: {
        resource_template_uuid: resourceTemplateUuid,
        mode: 'existing',
        mount: { uuid: mountUuid },
        material_uuid: null,
        site: null,
        slot_range: null,
        flow_role: 'primary_sample'
      }
    }],
    edges: [],
    node_templates: [],
    handle_templates: []
  }
}

/**
 * 构造可切换挂载物料存在性的物料来源（MaterialSource）目录。
 *
 * @param mounts 当前目录可见的挂载物料最小身份集合。
 * @returns 可供前端选择器校验的目录快照。
 */
function catalog(
  mounts: Array<{ uuid: string }>
): WorkflowMaterialSourceCatalogSnapshot {
  return {
    template: {
      uuid: templateUuid,
      resourceTemplateUuid: '50000000-0000-4000-8000-000000000001',
      name: 'material_source',
      displayName: '物料来源',
      actionClass: 'unilabos.workflow.authoring:material_source',
      actionType: 'material_source',
      sourceHandle: {
        uuid: '60000000-0000-4000-8000-000000000001',
        workflowNodeTemplateUuid: templateUuid,
        handleKey: 'material',
        ioType: 'source',
        displayName: '物料',
        valueType: 'ResourceSlot',
        required: false,
        dataSource: null,
        dataKey: null
      }
    },
    resourceTemplates: [{
      uuid: resourceTemplateUuid,
      displayName: '烧杯'
    }],
    materials: mounts.map((mount) => ({
      uuid: mount.uuid,
      name: 'S3 空烧杯架',
      resourceTemplateUuid: resourceTemplateUuid,
      materialClass: 'beaker_rack'
    })),
    sites: []
  }
}
