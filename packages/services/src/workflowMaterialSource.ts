import type { MaterialGraphPort } from '@unilab/material'
import {
  parseShapeLibrary,
  resolveShapeSpec,
  type MaterialShapeSpec
} from '@unilab/material/domain'

import { ServiceError } from './errors'
import { requestData, type HttpClient } from './http'
import { projectWorkflowMaterialSourceGraph } from './workflowMaterialSourceGraph'

export interface WorkflowMaterialSourceHandleTemplate {
  uuid: string
  workflowNodeTemplateUuid: string
  handleKey: 'material'
  ioType: 'source'
  displayName: string
  valueType: 'ResourceSlot'
  required: false
  dataSource: string | null
  dataKey: string | null
  wireValue?: Record<string, unknown>
}

export interface WorkflowMaterialSourceNodeTemplate {
  uuid: string
  resourceTemplateUuid: string
  name: 'material_source'
  displayName: string
  actionClass: 'unilabos.workflow.authoring:material_source'
  actionType: 'material_source'
  sourceHandle: WorkflowMaterialSourceHandleTemplate
  wireValue?: Record<string, unknown>
}

export interface WorkflowMaterialSourceResourceTemplate {
  uuid: string
  displayName: string
  shape?: MaterialShapeSpec
  shape?: MaterialShapeSpec
}

export interface WorkflowMaterialSourceMaterial {
  uuid: string
  name: string
  resourceTemplateUuid: string
  /** 遗留展示字段；公共物料图没有该权威事实时必须省略，不能从物料名称猜测。 */
  materialClass?: string
}

export interface WorkflowMaterialSourceSite {
  uuid: string
  name: string
  sortOrder: number
  mountMaterialUuid: string
  allowedResourceTemplateUuids: string[]
  occupiedMaterialUuid: string | null
}

export interface WorkflowMaterialSourceCatalogSnapshot {
  authorityId: string
  authorityKind: 'local' | 'backend'
  fingerprint: string
  template: WorkflowMaterialSourceNodeTemplate
  resourceTemplates: WorkflowMaterialSourceResourceTemplate[]
  materials: WorkflowMaterialSourceMaterial[]
  sites: WorkflowMaterialSourceSite[]
}

interface RegisteredWorkflowResourceTemplate {
  uuid: string
  displayName: string
  shape?: MaterialShapeSpec
}

/**
 * 组合工作流物料来源（MaterialSource）框架模板与公共物料图（MaterialGraph）读模型。
 *
 * @param http 只负责读取公开工作流节点模板 API 的 HTTP 客户端。
 * @param materialGraph 公共物料图端口；其 wire 解码由物料服务（Material Service）唯一负责。
 * @returns 带目录权威、框架模板和公共物料/库位（Site）事实的创作快照。
 * @throws 模板目录不一致或公共物料图无效时抛出结构化服务错误。
 */
export async function loadWorkflowMaterialSourceCatalog(
  http: HttpClient,
  materialGraph: Pick<MaterialGraphPort, 'getGraph'>
): Promise<WorkflowMaterialSourceCatalogSnapshot> {
  // 模板摘要集合保存同一目录指纹下的全部工作流节点模板页。
  const summaries: Record<string, unknown>[] = []
  // 目录权威标识哪个 OS 或 Backend 发布了当前工作流模板事实。
  let authority: { authorityId: string; authorityKind: 'local' | 'backend' } |
    null = null
  // 目录指纹冻结模板摘要和详情必须属于同一个版本。
  let fingerprint: string | null = null
  let total: number | null = null
  let page = 1
  do {
    const envelope = catalogEnvelope(await http.request<unknown>(
      `/api/v1/workflow-node-templates?page=${page}&page_size=100`
    ))
    const pageAuthority = authorityValue(envelope.authority)
    const pageFingerprint = nonEmptyString(envelope.catalog_fingerprint)
    const pageTotal = nonNegativeInteger(envelope.total)
    if (
      positiveInteger(envelope.page) !== page ||
      positiveInteger(envelope.page_size) > 100 ||
      (authority && !sameAuthority(authority, pageAuthority)) ||
      (fingerprint && fingerprint !== pageFingerprint) ||
      (total !== null && total !== pageTotal)
    ) invalidCatalog('MaterialSource catalog pagination is inconsistent')
    authority ??= pageAuthority
    fingerprint ??= pageFingerprint
    total ??= pageTotal
    const items = recordArray(envelope.items)
    summaries.push(...items)
    if (summaries.length > total) invalidCatalog('MaterialSource catalog total changed')
    if (summaries.length < total && items.length === 0) {
      invalidCatalog('MaterialSource catalog pagination stopped early')
    }
    page += 1
  } while (summaries.length < (total ?? 0))
  if (!authority || !fingerprint || summaries.length !== total) {
    invalidCatalog('MaterialSource catalog metadata is incomplete')
  }

  // 框架候选必须精确匹配物料来源（MaterialSource）节点的三项 wire 身份。
  const candidates = summaries.filter((summary) =>
    summary.name === 'material_source' &&
    summary.type === 'material_source' &&
    summary.node_type === 'material_source'
  )
  if (candidates.length !== 1) {
    invalidCatalog('OS must publish exactly one MaterialSource framework template')
  }
  const summary = candidates[0]
  // 框架模板 UUID 是工作流图引用该非动作节点合同的稳定身份。
  const summaryUuid = uuidString(summary.uuid)
  const summaryResource = recordValue(summary.resource_template)
  // 框架所有者资源模板 UUID 证明摘要与详情描述同一个节点模板。
  const summaryResourceUuid = uuidString(summaryResource.uuid)
  const detail = catalogEnvelope(await http.request<unknown>(
    `/api/v1/workflow-node-templates/${encodeURIComponent(summaryUuid)}`
  ))
  if (
    !sameAuthority(authority, authorityValue(detail.authority)) ||
    fingerprint !== nonEmptyString(detail.catalog_fingerprint)
  ) invalidCatalog('MaterialSource detail authority changed')
  const template = recordValue(detail.template)
  const handles = recordArray(detail.handles)
  if (
    uuidString(template.uuid) !== summaryUuid ||
    uuidString(template.resource_template_uuid) !== summaryResourceUuid ||
    template.name !== 'material_source' ||
    template.type !== 'material_source' ||
    template.node_type !== 'material_source' ||
    template.class !== 'unilabos.workflow.authoring:material_source' ||
    template.schema !== null ||
    handles.length !== 1
  ) invalidCatalog('MaterialSource framework template detail is invalid')
  const handle = handles[0]
  if (
    uuidString(handle.workflow_node_template_uuid) !== summaryUuid ||
    handle.handle_key !== 'material' ||
    handle.io_type !== 'source' ||
    handle.type !== 'ResourceSlot' ||
    handle.required !== false
  ) invalidCatalog('MaterialSource framework Handle is invalid')

  // 公共物料图聚合是物料、挂载关系和库位占用（SiteOccupancy）的唯一前端业务投影。
  const graphProjection = projectWorkflowMaterialSourceGraph(
    await materialGraph.getGraph({ kind: 'singleton' })
  )
  // 公共资源模板与外形目录只增强标题/外形，不再提供物料或库位事实。
  const registeredResourceTemplates =
    await loadRegisteredMaterialSourceTemplates(http)
  const resourceTemplatesByUuid = new Map(
    graphProjection.resourceTemplates.map((template) => [
      template.uuid,
      { ...template } as WorkflowMaterialSourceResourceTemplate
    ])
  )
  for (const registered of registeredResourceTemplates) {
    const projected = resourceTemplatesByUuid.get(registered.uuid)
    resourceTemplatesByUuid.set(registered.uuid, {
      uuid: registered.uuid,
      displayName: registered.displayName || projected?.displayName || registered.uuid,
      ...(registered.shape ? { shape: registered.shape } : {})
    })
  }

  // 来源句柄携带物料占位符（ResourceSlot）的原始 wire 合同以供图保存。
  const sourceHandle = attachWireValue({
    uuid: uuidString(handle.uuid),
    workflowNodeTemplateUuid: summaryUuid,
    handleKey: 'material' as const,
    ioType: 'source' as const,
    displayName: nonEmptyString(handle.display_name),
    valueType: 'ResourceSlot' as const,
    required: false as const,
    dataSource: nullableString(handle.data_source),
    dataKey: nullableString(handle.data_key)
  }, handle)
  // 框架模板保存 OS 发布的完整 wire 值，不从公共物料图反向构造模板合同。
  const frameworkTemplate = attachWireValue({
    uuid: summaryUuid,
    resourceTemplateUuid: summaryResourceUuid,
    name: 'material_source' as const,
    displayName: nonEmptyString(template.display_name),
    actionClass: 'unilabos.workflow.authoring:material_source' as const,
    actionType: 'material_source' as const,
    sourceHandle
  }, template)

  return {
    authorityId: authority.authorityId,
    authorityKind: authority.authorityKind,
    fingerprint,
    template: frameworkTemplate,
    ...graphProjection,
    resourceTemplates: [...resourceTemplatesByUuid.values()]
      .sort((left, right) => left.uuid.localeCompare(right.uuid))
  }
}

async function loadRegisteredMaterialSourceTemplates(
  http: HttpClient
): Promise<RegisteredWorkflowResourceTemplate[]> {
  try {
    const [templates, shapeCatalog] = await Promise.all([
      loadRegisteredResourceTemplatePages(http),
      requestData<Record<string, unknown>>(
        http,
        '/api/v1/material-shapes'
      )
    ])
    const library = parseShapeLibrary(shapeCatalog.items)
    return templates.map((template) => {
      const uuid = uuidString(template.uuid)
      const name = nonEmptyString(template.name)
      const displayName = nonEmptyString(template.display_name)
      const shapeCandidates = [
        ...stringArray(template.tags),
        name,
        displayName
      ]
      const shape = shapeCandidates.reduce<MaterialShapeSpec | undefined>(
        (match, candidate) => match ?? resolveShapeSpec(library, candidate),
        undefined
      )
      return {
        uuid,
        displayName,
        ...(shape ? { shape } : {})
      }
    })
  } catch {
    // 外形注册表是渐进增强；旧边缘侧（Edge）或不完整目录仍使用默认来源图标。
    return []
  }
}

async function loadRegisteredResourceTemplatePages(
  http: HttpClient
): Promise<Record<string, unknown>[]> {
  const templates: Record<string, unknown>[] = []
  const seen = new Set<string>()
  let cursorUuid: string | null = null
  do {
    const query = new URLSearchParams({ limit: '100' })
    if (cursorUuid) query.set('cursor_uuid', cursorUuid)
    const page = await requestData<Record<string, unknown>>(
      http,
      `/api/v1/resource-templates?${query.toString()}`
    )
    const items = recordArray(page.items)
    for (const item of items) {
      const uuid = uuidString(item.uuid)
      if (seen.has(uuid)) {
        invalidCatalog('资源模板（ResourceTemplate）UUID 重复')
      }
      seen.add(uuid)
      templates.push(item)
    }
    if (page.has_more !== true) return templates
    const nextCursor = uuidString(page.next_cursor_uuid)
    if (nextCursor === cursorUuid || items.length === 0) {
      invalidCatalog('资源模板（ResourceTemplate）目录分页提前终止')
    }
    cursorUuid = nextCursor
  } while (true)
}

function attachWireValue<T extends object>(
  value: T,
  wireValue: Record<string, unknown>
): T & { wireValue: Record<string, unknown> } {
  Object.defineProperty(value, 'wireValue', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: structuredClone(wireValue)
  })
  return value as T & { wireValue: Record<string, unknown> }
}

function catalogEnvelope(value: unknown): Record<string, unknown> {
  const envelope = recordValue(value)
  if (envelope.code !== 0 || !Object.prototype.hasOwnProperty.call(
    envelope,
    'data'
  )) invalidCatalog('MaterialSource catalog envelope is invalid')
  return recordValue(envelope.data)
}

function authorityValue(value: unknown): {
  authorityId: string
  authorityKind: 'local' | 'backend'
} {
  const authority = recordValue(value)
  const authorityKind = nonEmptyString(authority.kind)
  if (authorityKind !== 'local' && authorityKind !== 'backend') {
    invalidCatalog('MaterialSource catalog authority kind is invalid')
  }
  return {
    authorityId: nonEmptyString(authority.authority_id),
    authorityKind
  }
}

function sameAuthority(
  left: { authorityId: string; authorityKind: string },
  right: { authorityId: string; authorityKind: string }
): boolean {
  return left.authorityId === right.authorityId &&
    left.authorityKind === right.authorityKind
}

function recordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value) || value.some((item) => !isRecord(item))) {
    invalidCatalog('Expected an object array')
  }
  return value as Record<string, unknown>[]
}

function recordValue(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) invalidCatalog('Expected an object')
  return value
}

function nonEmptyString(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    invalidCatalog('Expected a non-empty string')
  }
  return value
}

function uuidString(value: unknown): string {
  const uuid = nonEmptyString(value)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid)) {
    invalidCatalog('Expected a UUID')
  }
  return uuid
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : nonEmptyString(value)
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string =>
      typeof entry === 'string' && Boolean(entry.trim())
    )
    : []
}

function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    invalidCatalog('Expected an integer')
  }
  return value
}

function positiveInteger(value: unknown): number {
  const parsed = integer(value)
  if (parsed <= 0) invalidCatalog('Expected a positive integer')
  return parsed
}

function nonNegativeInteger(value: unknown): number {
  const parsed = integer(value)
  if (parsed < 0) invalidCatalog('Expected a non-negative integer')
  return parsed
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function invalidCatalog(message: string): never {
  throw new ServiceError({
    code: 'INVALID_WORKFLOW_MATERIAL_SOURCE_CATALOG',
    message,
    retryable: false
  })
}
