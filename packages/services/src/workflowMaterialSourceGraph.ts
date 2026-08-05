import type { MaterialAggregate, MaterialSite } from '@unilab/material'

import { ServiceError } from './errors'
import type {
  WorkflowMaterialSourceMaterial,
  WorkflowMaterialSourceResourceTemplate,
  WorkflowMaterialSourceSite
} from './workflowMaterialSource'

export interface WorkflowMaterialSourceGraphProjection {
  resourceTemplates: WorkflowMaterialSourceResourceTemplate[]
  materials: WorkflowMaterialSourceMaterial[]
  sites: WorkflowMaterialSourceSite[]
}

/**
 * 将公共物料图（MaterialGraph）投影成工作流物料来源（MaterialSource）目录所需的最小读模型。
 *
 * @param aggregates 由公共物料图端口解码完成的物料聚合；函数不会读取 wire DTO 或私有库存接口。
 * @returns 按稳定身份和公共图遍历顺序组织的资源模板、物料与业务库位（Site）。
 * @throws 公共图出现重复身份、所有者冲突、非单一占用或悬空占用物料时抛出结构化服务错误。
 */
export function projectWorkflowMaterialSourceGraph(
  aggregates: readonly MaterialAggregate[]
): WorkflowMaterialSourceGraphProjection {
  // 物料身份集合用于同时拒绝重复物料和悬空库位占用（SiteOccupancy）。
  const materialIds = new Set<string>()
  // 资源模板身份集合只保存公共图明确给出的 UUID；显示名采用 UUID 稳定回退，不冒充模板名称。
  const resourceTemplateIds = new Set<string>()
  const materials: WorkflowMaterialSourceMaterial[] = []

  for (const aggregate of aggregates) {
    // 物料 UUID 是工作流选择器与后续任务物料准入（TaskMaterialAdmission）的稳定身份。
    const materialUuid = uuidValue(aggregate.material.id, 'Material UUID')
    if (materialIds.has(materialUuid)) {
      invalidGraph(`Material UUID is duplicated: ${materialUuid}`)
    }
    materialIds.add(materialUuid)
    // 资源模板 UUID 只表达物料的来源类型，不从物料名称推导模板显示名。
    const resourceTemplateUuid = uuidValue(
      aggregate.material.sourceTemplateId,
      `Material ${materialUuid} ResourceTemplate UUID`
    )
    resourceTemplateIds.add(resourceTemplateUuid)
    materials.push({
      uuid: materialUuid,
      name: nonEmptyString(
        aggregate.material.name,
        `Material ${materialUuid} name`
      ),
      resourceTemplateUuid
    })
  }

  // 库位身份集合保证多个挂载物料不会发布同一个业务库位。
  const siteIds = new Set<string>()
  const sites: WorkflowMaterialSourceSite[] = []
  // 库位遍历序号保留公共图中挂载物料与其业务库位数组给出的稳定顺序。
  let siteTraversalOrder = 0
  for (const aggregate of aggregates) {
    // 聚合物料 UUID 是其 sites 数组中每个业务库位的唯一合法所有者。
    const ownerMaterialUuid = uuidValue(
      aggregate.material.id,
      'Site owner Material UUID'
    )
    for (const site of aggregate.sites) {
      if (isManagedLabwareComponent(site)) continue
      // 库位 UUID 是物料来源挂载范围中的稳定选择身份。
      const siteUuid = uuidValue(site.id, 'Site UUID')
      if (siteIds.has(siteUuid)) {
        invalidGraph(`Site UUID is duplicated: ${siteUuid}`)
      }
      siteIds.add(siteUuid)
      // 库位所有者 UUID 必须与承载该库位数组的公共聚合一致。
      const declaredOwnerUuid = uuidValue(
        site.ownerMaterialId,
        `Site ${siteUuid} owner Material UUID`
      )
      if (declaredOwnerUuid !== ownerMaterialUuid) {
        invalidGraph(
          `Site ${siteUuid} owner ${declaredOwnerUuid} does not match ${ownerMaterialUuid}`
        )
      }
      if (site.capacity !== 1 || site.occupiedMaterialIds.length > 1) {
        invalidGraph(`Site ${siteUuid} cannot project to single occupancy`)
      }
      // 允许资源模板 UUID 集合来自公共库位兼容性事实，并按 UUID 排序以稳定输出。
      const allowedResourceTemplateUuids = uniqueUuidArray(
        site.allowedTemplateIds,
        `Site ${siteUuid} allowed ResourceTemplate UUIDs`
      ).sort(compareUuid)
      for (const resourceTemplateUuid of allowedResourceTemplateUuids) {
        resourceTemplateIds.add(resourceTemplateUuid)
      }
      // 占用物料 UUID 表达当前库位占用（SiteOccupancy）；空数组明确投影为 null。
      const occupiedMaterialUuid = site.occupiedMaterialIds.length === 0
        ? null
        : uuidValue(
            site.occupiedMaterialIds[0],
            `Site ${siteUuid} occupied Material UUID`
          )
      if (occupiedMaterialUuid && !materialIds.has(occupiedMaterialUuid)) {
        invalidGraph(
          `Site ${siteUuid} occupied Material ${occupiedMaterialUuid} is missing`
        )
      }
      sites.push({
        uuid: siteUuid,
        name: nonEmptyString(site.name, `Site ${siteUuid} name`),
        sortOrder: siteTraversalOrder,
        mountMaterialUuid: ownerMaterialUuid,
        allowedResourceTemplateUuids,
        occupiedMaterialUuid
      })
      siteTraversalOrder += 1
    }
  }

  return {
    resourceTemplates: [...resourceTemplateIds]
      .sort(compareUuid)
      .map(resourceTemplateProjection),
    materials: materials.sort(compareMaterialByUuid),
    sites: sites.sort(compareSiteByTraversalOrder)
  }
}

/**
 * 按 UUID 字典序稳定比较两个资源身份。
 *
 * @param left 左侧物料、库位或资源模板 UUID。
 * @param right 右侧物料、库位或资源模板 UUID。
 * @returns 负数、零或正数，供 Array.sort 使用。
 */
function compareUuid(left: string, right: string): number {
  return left.localeCompare(right)
}

/**
 * 将资源模板 UUID 投影为工作流目录的稳定展示回退。
 *
 * @param uuid 公共物料图明确给出的资源模板 UUID。
 * @returns 显示名等于 UUID 的最小资源模板条目；不会用物料名称冒充模板名称。
 */
function resourceTemplateProjection(
  uuid: string
): WorkflowMaterialSourceResourceTemplate {
  return { uuid, displayName: uuid }
}

/**
 * 按稳定物料 UUID 排序工作流物料来源目录条目。
 *
 * @param left 左侧物料目录条目。
 * @param right 右侧物料目录条目。
 * @returns UUID 字典序比较结果。
 */
function compareMaterialByUuid(
  left: WorkflowMaterialSourceMaterial,
  right: WorkflowMaterialSourceMaterial
): number {
  return compareUuid(left.uuid, right.uuid)
}

/**
 * 按公共图遍历序号排序业务库位（Site），并以 UUID 作为冲突时的稳定次序。
 *
 * @param left 左侧工作流库位目录条目。
 * @param right 右侧工作流库位目录条目。
 * @returns 先比较遍历序号、再比较 UUID 的排序结果。
 */
function compareSiteByTraversalOrder(
  left: WorkflowMaterialSourceSite,
  right: WorkflowMaterialSourceSite
): number {
  return left.sortOrder - right.sortOrder || compareUuid(left.uuid, right.uuid)
}

/**
 * 判断一个公共物料库位是否只是孔或吸头点位等耗材内部结构。
 *
 * @param site 公共物料聚合中的候选库位对象。
 * @returns `true` 表示该对象只供物料内部展示，不得成为工作流业务库位（Site）。
 */
function isManagedLabwareComponent(site: MaterialSite): boolean {
  return site.kind === 'well' || site.kind === 'tip-spot'
}

/**
 * 校验一组稳定 UUID，保留调用方顺序并拒绝重复身份。
 *
 * @param values 待校验的 UUID 集合。
 * @param label 用于结构化诊断的领域字段说明。
 * @returns 新数组；调用方可安全排序且不会修改公共图原值。
 * @throws 任一值不是 UUID 或集合含重复身份时抛出结构化服务错误。
 */
function uniqueUuidArray(
  values: readonly string[],
  label: string
): string[] {
  const uuids: string[] = []
  for (const value of values) uuids.push(uuidValue(value, label))
  if (new Set(uuids).size !== uuids.length) {
    invalidGraph(`${label} contains duplicates`)
  }
  return uuids
}

/**
 * 校验领域身份是否为规范 UUID 字符串。
 *
 * @param value 物料、库位或资源模板的候选身份。
 * @param label 用于错误信息的领域字段说明。
 * @returns 去除首尾空白后的 UUID。
 * @throws 值为空或不符合 UUID 格式时抛出结构化服务错误。
 */
function uuidValue(value: string, label: string): string {
  const uuid = nonEmptyString(value, label)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid)) {
    invalidGraph(`${label} must be a UUID`)
  }
  return uuid
}

/**
 * 校验公共图中的必填字符串。
 *
 * @param value 待校验字符串。
 * @param label 用于错误信息的领域字段说明。
 * @returns 去除首尾空白后的非空字符串。
 * @throws 值为空时抛出结构化服务错误。
 */
function nonEmptyString(value: string, label: string): string {
  const normalized = value.trim()
  if (!normalized) invalidGraph(`${label} must be non-empty`)
  return normalized
}

/**
 * 统一构造公共物料图投影的失败关闭错误。
 *
 * @param message 描述无效物料、资源模板或库位事实的诊断文本。
 * @returns 永不返回，函数签名用于保持调用处类型收窄。
 * @throws 始终抛出不可重试的结构化服务错误。
 */
function invalidGraph(message: string): never {
  throw new ServiceError({
    code: 'INVALID_WORKFLOW_MATERIAL_SOURCE_GRAPH',
    message,
    retryable: false
  })
}
