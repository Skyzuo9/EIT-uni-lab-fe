import type { MaterialAggregate, MaterialSite } from '@unilab/material'
import { describe, expect, it } from 'vitest'

import { projectWorkflowMaterialSourceGraph } from './workflowMaterialSourceGraph'

// 挂载物料 UUID 标识直接拥有测试库位（Site）的 Deck 实例。
const mountUuid = '51000000-0000-4000-8000-000000000001'
// 被占用物料 UUID 标识放置在测试库位中的具体孔板。
const materialUuid = '52000000-0000-4000-8000-000000000001'
// 挂载资源模板 UUID 标识 Deck 物料实例的来源类型。
const mountTemplateUuid = '61000000-0000-4000-8000-000000000001'
// 样品资源模板 UUID 标识库位允许承载的孔板类型。
const sampleTemplateUuid = '62000000-0000-4000-8000-000000000001'
// 第一库位 UUID 故意使用较大的字典序，证明业务顺序不由 UUID 猜测。
const firstSiteUuid = '71000000-0000-4000-8000-000000000009'
// 第二库位 UUID 故意使用较小的字典序，证明公共图遍历顺序优先。
const secondSiteUuid = '71000000-0000-4000-8000-000000000001'

/**
 * 注册公共物料图（MaterialGraph）到工作流物料来源（MaterialSource）目录的行为测试。
 *
 * @returns 不返回值；任一公开投影或失败关闭不变量被破坏时由 Vitest 报告失败。
 */
function registerWorkflowMaterialSourceGraphTests(): void {
  it(
    '按公共图遍历顺序投影物料、挂载物料、库位占用与兼容模板',
    projectsPublicGraphFactsInStableOrder
  )
  it('重复物料 UUID 必须失败关闭', rejectsDuplicateMaterialIdentity)
  it('重复库位 UUID 必须失败关闭', rejectsDuplicateSiteIdentity)
  it('库位所有者与聚合物料不一致时必须失败关闭', rejectsMismatchedSiteOwner)
  it('单占用目录遇到多个占用物料时必须失败关闭', rejectsMultipleSiteOccupants)
  it('实验耗材内部结构不得进入工作流候选库位', excludesManagedLabwareComponents)
}

describe(
  '工作流物料来源公共物料图投影',
  registerWorkflowMaterialSourceGraphTests
)

/**
 * 验证工作流物料来源（MaterialSource）只消费公共物料聚合，并保留公共图给出的稳定遍历顺序。
 *
 * @returns 不返回值；物料、资源模板、库位（Site）或库位占用（SiteOccupancy）投影不符时断言失败。
 */
function projectsPublicGraphFactsInStableOrder(): void {
  // 挂载物料聚合是库位（Site）的直接所有者；测试故意让库位 UUID 与遍历顺序相反。
  const mountAggregate = materialAggregate(
    mountUuid,
    mountTemplateUuid,
    'Deck A',
    [
      materialSite(firstSiteUuid, mountUuid, '库位 A', [], []),
      materialSite(
        secondSiteUuid,
        mountUuid,
        '库位 B',
        [sampleTemplateUuid],
        [materialUuid]
      )
    ]
  )
  // 被占用物料聚合提供库位占用（SiteOccupancy）中引用的稳定物料 UUID。
  const occupiedAggregate = materialAggregate(
    materialUuid,
    sampleTemplateUuid,
    'Assay plate'
  )

  const projection = projectWorkflowMaterialSourceGraph([
    occupiedAggregate,
    mountAggregate
  ])

  expect(projection).toEqual({
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
        allowedResourceTemplateUuids: [],
        occupiedMaterialUuid: null
      },
      {
        uuid: secondSiteUuid,
        name: '库位 B',
        sortOrder: 1,
        mountMaterialUuid: mountUuid,
        allowedResourceTemplateUuids: [sampleTemplateUuid],
        occupiedMaterialUuid: materialUuid
      }
    ]
  })
  expect(mountAggregate.sites.map((site) => site.id)).toEqual([
    firstSiteUuid,
    secondSiteUuid
  ])
}

/**
 * 验证两个公共物料聚合不能声明同一个物料 UUID。
 *
 * @returns 不返回值；重复身份未产生结构化失败时断言失败。
 */
function rejectsDuplicateMaterialIdentity(): void {
  const duplicatedMaterialUuid = mountUuid
  expect(() => projectWorkflowMaterialSourceGraph([
    materialAggregate(duplicatedMaterialUuid, mountTemplateUuid, 'Deck A'),
    materialAggregate(duplicatedMaterialUuid, sampleTemplateUuid, 'Deck B')
  ])).toThrowError(expect.objectContaining({
    code: 'INVALID_WORKFLOW_MATERIAL_SOURCE_GRAPH'
  }))
}

/**
 * 验证不同挂载物料不能发布相同的库位 UUID。
 *
 * @returns 不返回值；重复库位身份未失败关闭时断言失败。
 */
function rejectsDuplicateSiteIdentity(): void {
  const secondMountUuid = '51000000-0000-4000-8000-000000000002'
  expect(() => projectWorkflowMaterialSourceGraph([
    materialAggregate(mountUuid, mountTemplateUuid, 'Deck A', [
      materialSite(firstSiteUuid, mountUuid, '库位 A', [], [])
    ]),
    materialAggregate(secondMountUuid, mountTemplateUuid, 'Deck B', [
      materialSite(firstSiteUuid, secondMountUuid, '库位 B', [], [])
    ])
  ])).toThrowError(expect.objectContaining({
    code: 'INVALID_WORKFLOW_MATERIAL_SOURCE_GRAPH'
  }))
}

/**
 * 验证库位（Site）声明的所有者必须等于承载它的公共物料聚合身份。
 *
 * @returns 不返回值；不一致所有者被静默接受时断言失败。
 */
function rejectsMismatchedSiteOwner(): void {
  expect(() => projectWorkflowMaterialSourceGraph([
    materialAggregate(mountUuid, mountTemplateUuid, 'Deck A', [
      materialSite(firstSiteUuid, materialUuid, '库位 A', [], [])
    ])
  ])).toThrowError(expect.objectContaining({
    code: 'INVALID_WORKFLOW_MATERIAL_SOURCE_GRAPH'
  }))
}

/**
 * 验证现有单一占用字段不能有损吞掉公共库位（Site）的第二个占用物料。
 *
 * @returns 不返回值；多个占用物料被折叠为一个 UUID 时断言失败。
 */
function rejectsMultipleSiteOccupants(): void {
  const secondMaterialUuid = '52000000-0000-4000-8000-000000000002'
  expect(() => projectWorkflowMaterialSourceGraph([
    materialAggregate(mountUuid, mountTemplateUuid, 'Deck A', [
      materialSite(
        firstSiteUuid,
        mountUuid,
        '库位 A',
        [sampleTemplateUuid],
        [materialUuid, secondMaterialUuid]
      )
    ]),
    materialAggregate(materialUuid, sampleTemplateUuid, 'Plate A'),
    materialAggregate(secondMaterialUuid, sampleTemplateUuid, 'Plate B')
  ])).toThrowError(expect.objectContaining({
    code: 'INVALID_WORKFLOW_MATERIAL_SOURCE_GRAPH'
  }))
}

/**
 * 验证孔（well）和吸头点位（tip-spot）只属于物料内部展示结构，不能升级为工作流业务库位（Site）。
 *
 * @returns 不返回值；内部结构出现在物料来源候选库位时断言失败。
 */
function excludesManagedLabwareComponents(): void {
  // 孔 UUID 标识只属于容器内部结构的测试位置。
  const wellUuid = '71000000-0000-4000-8000-000000000003'
  // 吸头点位 UUID 标识只属于耗材内部结构的测试位置。
  const tipSpotUuid = '71000000-0000-4000-8000-000000000004'
  const projection = projectWorkflowMaterialSourceGraph([
    materialAggregate(mountUuid, mountTemplateUuid, 'Deck A', [
      materialSite(firstSiteUuid, mountUuid, '库位 A', [], []),
      materialSite(wellUuid, mountUuid, 'A1', [], [], 'well'),
      materialSite(tipSpotUuid, mountUuid, 'T1', [], [], 'tip-spot')
    ])
  ])

  expect(projection.sites.map((site) => site.uuid)).toEqual([firstSiteUuid])
}

/**
 * 构造测试使用的公共物料聚合（MaterialAggregate）。
 *
 * @param materialId 具体物料（Material）的稳定 UUID。
 * @param sourceTemplateId 物料实例来源的资源模板 UUID。
 * @param name 面向工作流创作界面的物料名称。
 * @param sites 由该物料直接拥有的库位（Site）集合。
 * @returns 只包含公共投影所需事实的物料聚合。
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
 * 构造测试使用的公共库位（Site）事实。
 *
 * @param siteId 库位的稳定 UUID。
 * @param ownerMaterialId 直接拥有该库位的挂载物料 UUID。
 * @param name 库位显示名称。
 * @param allowedTemplateIds 该库位允许承载的资源模板 UUID 集合。
 * @param occupiedMaterialIds 当前权威库位占用（SiteOccupancy）的物料 UUID 集合。
 * @param kind 公共图中的结构类型；孔和吸头点位只用于验证过滤规则。
 * @returns 容量为一的公共库位对象。
 */
function materialSite(
  siteId: string,
  ownerMaterialId: string,
  name: string,
  allowedTemplateIds: readonly string[],
  occupiedMaterialIds: readonly string[],
  kind: MaterialSite['kind'] = 'site'
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
    kind
  }
}
