import type {
  MaterialAggregate,
  MaterialGraphPort,
  MaterialScope,
  MaterialSite
} from '@unilab/material'
import { describe, expect, it } from 'vitest'

import { getDefaultBackend } from './backends'
import type { HttpClient } from './http'
import { createWorkflowRuntime } from './workflow'

// 框架节点模板 UUID 标识唯一的物料来源（MaterialSource）创作节点合同。
const frameworkTemplateUuid = '21000000-0000-4000-8000-000000000001'
// 框架所有者 UUID 标识承载非动作物料来源节点的资源模板。
const frameworkOwnerUuid = '31000000-0000-4000-8000-000000000001'
// 框架句柄 UUID 标识物料来源输出的物料占位符（ResourceSlot）。
const frameworkHandleUuid = '41000000-0000-4000-8000-000000000001'
// 挂载物料 UUID 标识直接拥有候选库位（Site）的 Deck 实例。
const mountUuid = '51000000-0000-4000-8000-000000000001'
// 被占用物料 UUID 标识已放置在第二库位中的孔板实例。
const materialUuid = '52000000-0000-4000-8000-000000000001'
// 挂载资源模板 UUID 标识 Deck 的类型身份。
const mountTemplateUuid = '61000000-0000-4000-8000-000000000001'
// 样品资源模板 UUID 标识候选孔板类型。
const sampleTemplateUuid = '62000000-0000-4000-8000-000000000001'
// 第一库位 UUID 对应公共图中的首个业务库位。
const firstSiteUuid = '71000000-0000-4000-8000-000000000009'
// 第二库位 UUID 对应具有库位占用（SiteOccupancy）的业务库位。
const secondSiteUuid = '71000000-0000-4000-8000-000000000001'
// 目录指纹冻结工作流模板目录的权威版本。
const fingerprint = `sha256:${'b'.repeat(64)}`

/**
 * 注册工作流物料来源（MaterialSource）目录适配器的公共服务行为测试。
 *
 * @returns 不返回值；模板合同、公共图依赖或失败关闭规则不符时由 Vitest 报告失败。
 */
function registerWorkflowMaterialSourceCatalogTests(): void {
  it(
    '模板来自工作流 API 且物料事实只来自注入的公共物料图端口',
    loadsTemplateAndInjectedPublicMaterialGraph
  )
  it(
    'OS 未发布唯一物料来源框架模板时必须失败关闭',
    rejectsMissingFrameworkTemplate
  )
  it(
    '未注入公共物料图端口时必须失败关闭且不得请求私有库存接口',
    rejectsMissingPublicMaterialGraphPort
  )
}

describe(
  '工作流物料来源目录适配器',
  registerWorkflowMaterialSourceCatalogTests
)

/**
 * 验证工作流运行时（Workflow Runtime）从模板 API 读取框架合同，并从公共物料图端口读取物料与库位事实。
 *
 * @returns Promise 完成时表示目录内容、单例作用域及 HTTP 请求边界均符合规范。
 */
async function loadsTemplateAndInjectedPublicMaterialGraph(): Promise<void> {
  const requests: string[] = []
  const graphScopes: MaterialScope[] = []
  const fixture = templateResponses()
  const runtime = createWorkflowRuntime(
    fixtureHttp(fixture, requests),
    getDefaultBackend('local-python'),
    { materialGraph: fixtureMaterialGraph(graphScopes) }
  )

  const snapshot = await runtime.getWorkflowMaterialSourceCatalog()

  expect(snapshot).toEqual({
    authorityId: 'os-local',
    authorityKind: 'local',
    fingerprint,
    template: {
      uuid: frameworkTemplateUuid,
      resourceTemplateUuid: frameworkOwnerUuid,
      name: 'material_source',
      displayName: 'Material Source',
      actionClass: 'unilabos.workflow.authoring:material_source',
      actionType: 'material_source',
      sourceHandle: {
        uuid: frameworkHandleUuid,
        workflowNodeTemplateUuid: frameworkTemplateUuid,
        handleKey: 'material',
        ioType: 'source',
        displayName: 'Material',
        valueType: 'ResourceSlot',
        required: false,
        dataSource: 'executor',
        dataKey: 'material'
      }
    },
    resourceTemplates: [
      { uuid: mountTemplateUuid, displayName: mountTemplateUuid },
      { uuid: sampleTemplateUuid, displayName: sampleTemplateUuid }
    ],
    materials: [
      {
        uuid: mountUuid,
        name: 'Deck A',
        resourceTemplateUuid: mountTemplateUuid
      },
      {
        uuid: materialUuid,
        name: 'Assay plate',
        resourceTemplateUuid: sampleTemplateUuid
      }
    ],
    sites: [
      {
        uuid: firstSiteUuid,
        name: '库位 A',
        sortOrder: 0,
        mountMaterialUuid: mountUuid,
        allowedResourceTemplateUuids: [sampleTemplateUuid],
        occupiedMaterialUuid: null
      },
      {
        uuid: secondSiteUuid,
        name: '库位 B',
        sortOrder: 1,
        mountMaterialUuid: mountUuid,
        allowedResourceTemplateUuids: [],
        occupiedMaterialUuid: materialUuid
      }
      ]
  })
  expect(snapshot.template.wireValue).toEqual(
    (fixture[
      `/api/v1/workflow-node-templates/${frameworkTemplateUuid}`
    ] as { data: { template: Record<string, unknown> } }).data.template
  )
  expect(snapshot.template.sourceHandle.wireValue).toEqual(
    (fixture[
      `/api/v1/workflow-node-templates/${frameworkTemplateUuid}`
    ] as { data: { handles: Record<string, unknown>[] } }).data.handles[0]
  )
  expect(graphScopes).toEqual([{ kind: 'singleton' }])
  expect(requests).toEqual([
    '/api/v1/workflow-node-templates?page=1&page_size=100',
    `/api/v1/workflow-node-templates/${frameworkTemplateUuid}`
  ])
  expect(requests.some((path) => path.startsWith('/api/v1/inventory/')))
    .toBe(false)
}

/**
 * 验证工作流物料来源（MaterialSource）框架模板身份不精确时不发布有损目录。
 *
 * @returns Promise 完成时表示无效模板被结构化拒绝。
 */
async function rejectsMissingFrameworkTemplate(): Promise<void> {
  const fixture = templateResponses()
  const list = fixture[
    '/api/v1/workflow-node-templates?page=1&page_size=100'
  ] as { data: { items: Array<Record<string, unknown>> } }
  list.data.items[0].node_type = 'device'
  const runtime = createWorkflowRuntime(
    fixtureHttp(fixture, []),
    getDefaultBackend('local-python'),
    { materialGraph: fixtureMaterialGraph([]) }
  )

  await expect(runtime.getWorkflowMaterialSourceCatalog()).rejects.toThrow(
    'MaterialSource framework template'
  )
}

/**
 * 验证公共物料图端口缺失时工作流运行时（Workflow Runtime）不会回退到私有库存（Inventory）HTTP。
 *
 * @returns Promise 完成时表示缺少依赖被失败关闭且请求路径保持在公开合同内。
 */
async function rejectsMissingPublicMaterialGraphPort(): Promise<void> {
  const requests: string[] = []
  const runtime = createWorkflowRuntime(
    fixtureHttp(templateResponses(), requests),
    getDefaultBackend('local-python')
  )

  await expect(runtime.getWorkflowMaterialSourceCatalog()).rejects
    .toMatchObject({ code: 'WORKFLOW_MATERIAL_GRAPH_PORT_REQUIRED' })
  expect(requests).toEqual([])
}

/**
 * 构造只包含工作流物料来源（MaterialSource）框架模板的 HTTP fixture。
 *
 * @returns 以公开工作流模板路径为键的响应对象，不包含任何私有库存路径。
 */
function templateResponses(): Record<string, unknown> {
  return {
    '/api/v1/workflow-node-templates?page=1&page_size=100': {
      code: 0,
      data: {
        authority: { authority_id: 'os-local', kind: 'local' },
        catalog_fingerprint: fingerprint,
        items: [{
          uuid: frameworkTemplateUuid,
          name: 'material_source',
          display_name: 'Material Source',
          type: 'material_source',
          node_type: 'material_source',
          resource_template: {
            uuid: frameworkOwnerUuid,
            name: 'host_node',
            display_name: 'Host node'
          }
        }],
        total: 1,
        page: 1,
        page_size: 100
      }
    },
    [`/api/v1/workflow-node-templates/${frameworkTemplateUuid}`]: {
      code: 0,
      data: {
        authority: { authority_id: 'os-local', kind: 'local' },
        catalog_fingerprint: fingerprint,
        template: {
          uuid: frameworkTemplateUuid,
          resource_template_uuid: frameworkOwnerUuid,
          name: 'material_source',
          display_name: 'Material Source',
          class: 'unilabos.workflow.authoring:material_source',
          type: 'material_source',
          node_type: 'material_source',
          schema: null,
          goal: {},
          goal_default: {},
          meta_data: {}
        },
        handles: [{
          uuid: frameworkHandleUuid,
          workflow_node_template_uuid: frameworkTemplateUuid,
          handle_key: 'material',
          io_type: 'source',
          display_name: 'Material',
          type: 'ResourceSlot',
          required: false,
          data_source: 'executor',
          data_key: 'material',
          meta_data: {}
        }]
      }
    }
  }
}

/**
 * 构造测试专用公共物料图端口，并记录工作流目录使用的物料作用域。
 *
 * @param scopes 接收每次读取时的物料作用域，证明当前合同使用单例作用域。
 * @returns 只实现 getGraph 的最小公共物料图端口。
 */
function fixtureMaterialGraph(
  scopes: MaterialScope[]
): Pick<MaterialGraphPort, 'getGraph'> {
  /**
   * 返回测试公共物料聚合，绝不读取私有库存 DTO。
   *
   * @param scope 工作流物料来源目录请求的公共物料作用域。
   * @returns 包含挂载物料、具体物料及库位占用事实的公共聚合。
   */
  async function getGraph(
    scope: MaterialScope
  ): Promise<readonly MaterialAggregate[]> {
    scopes.push(scope)
    return [
      materialAggregate(materialUuid, sampleTemplateUuid, 'Assay plate'),
      materialAggregate(mountUuid, mountTemplateUuid, 'Deck A', [
        materialSite(
          firstSiteUuid,
          mountUuid,
          '库位 A',
          [sampleTemplateUuid],
          []
        ),
        materialSite(
          secondSiteUuid,
          mountUuid,
          '库位 B',
          [],
          [materialUuid]
        )
      ])
    ]
  }

  return { getGraph }
}

/**
 * 构造公共物料聚合（MaterialAggregate）fixture。
 *
 * @param materialId 具体物料的稳定 UUID。
 * @param sourceTemplateId 物料来源资源模板 UUID。
 * @param name 物料显示名称。
 * @param sites 该物料直接拥有的库位（Site）集合。
 * @returns 可由公共物料图端口返回的聚合对象。
 */
function materialAggregate(
  materialId: string,
  sourceTemplateId: string,
  name: string,
  sites: readonly MaterialSite[] = []
): MaterialAggregate {
  return {
    material: {
      id: materialId,
      sourceTemplateId,
      code: materialId,
      name,
      config: {},
      createdAt: '2026-08-05T00:00:00Z',
      updatedAt: '2026-08-05T00:00:00Z'
    },
    placement: { kind: 'unplaced' },
    sites,
    revision: 1
  }
}

/**
 * 构造公共库位（Site）fixture。
 *
 * @param siteId 库位稳定 UUID。
 * @param ownerMaterialId 直接拥有库位的挂载物料 UUID。
 * @param name 库位显示名称。
 * @param allowedTemplateIds 允许承载的资源模板 UUID。
 * @param occupiedMaterialIds 当前库位占用（SiteOccupancy）的物料 UUID。
 * @returns 容量为一的公共库位事实。
 */
function materialSite(
  siteId: string,
  ownerMaterialId: string,
  name: string,
  allowedTemplateIds: readonly string[],
  occupiedMaterialIds: readonly string[]
): MaterialSite {
  return {
    id: siteId,
    ownerMaterialId,
    key: siteId,
    name,
    anchor: { kind: 'root' },
    poseInAnchor: {
      positionMm: [0, 0, 0],
      rotationDegXYZ: [0, 0, 0]
    },
    sizeMm: [100, 100, 100],
    capacity: 1,
    allowedTemplateIds,
    occupiedMaterialIds,
    kind: 'site'
  }
}

/**
 * 构造只接受显式公开路径的 HTTP fixture。
 *
 * @param fixture 公开路径到响应的映射。
 * @param requests 接收实际请求路径的审计数组。
 * @returns 遇到未知或私有路径就抛错的 HTTP 客户端。
 */
function fixtureHttp(
  fixture: Record<string, unknown>,
  requests: string[]
): HttpClient {
  /**
   * 读取一条已声明的公开响应并记录路径。
   *
   * @param path 工作流服务请求的相对 API 路径。
   * @returns 对应 fixture 的结构化克隆，避免测试间共享可变状态。
   * @throws 请求未声明路径时抛出异常，从而禁止私有库存接口回退。
   */
  async function request<ResponseValue>(path: string): Promise<ResponseValue> {
    requests.push(path)
    if (!Object.prototype.hasOwnProperty.call(fixture, path)) {
      throw new Error(`Unexpected request: ${path}`)
    }
    return structuredClone(fixture[path]) as ResponseValue
  }

  return { request }
}
