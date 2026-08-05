import { ServiceError } from './errors'
import { requestData, type HttpClient } from './http'
import {
  parseShapeLibrary,
  resolveShapeSpec,
  type MaterialShapeSpec
} from '@unilab/material/domain'

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
}

export interface WorkflowMaterialSourceMaterial {
  uuid: string
  name: string
  resourceTemplateUuid: string
  materialClass: string
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

export async function loadWorkflowMaterialSourceCatalog(
  http: HttpClient
): Promise<WorkflowMaterialSourceCatalogSnapshot> {
  const summaries: Record<string, unknown>[] = []
  let authority: { authorityId: string; authorityKind: 'local' | 'backend' } |
    null = null
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

  const candidates = summaries.filter((summary) =>
    summary.name === 'material_source' &&
    summary.type === 'material_source' &&
    summary.node_type === 'material_source'
  )
  if (candidates.length !== 1) {
    invalidCatalog('OS must publish exactly one MaterialSource framework template')
  }
  const summary = candidates[0]
  const summaryUuid = uuidString(summary.uuid)
  const summaryResource = recordValue(summary.resource_template)
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

  const [materialResponse, siteResponse, registeredResourceTemplates] =
    await Promise.all([
    http.request<unknown>('/api/v1/inventory/materials?limit=500'),
    http.request<unknown>('/api/v1/inventory/sites?limit=500'),
    loadRegisteredMaterialSourceTemplates(http)
  ])
  const materials = uniqueRecords(
    recordArray(recordValue(materialResponse).materials),
    'Material'
  )
    .filter((item) => item.deleted_at === null || item.deleted_at === undefined)
    .map((item): WorkflowMaterialSourceMaterial => ({
      uuid: uuidString(item.uuid),
      name: nonEmptyString(item.name),
      resourceTemplateUuid: uuidString(item.resource_template_uuid),
      materialClass: nonEmptyString(item.class)
    }))
    .sort((left, right) => left.uuid.localeCompare(right.uuid))
  const sites = uniqueRecords(
    recordArray(recordValue(siteResponse).sites),
    'Site'
  )
    .filter((item) => item.deleted_at === null || item.deleted_at === undefined)
    .map((item): WorkflowMaterialSourceSite => ({
      uuid: uuidString(item.uuid),
      name: nonEmptyString(item.name),
      sortOrder: integer(item.sort_order),
      mountMaterialUuid: uuidString(item.material_uuid),
      allowedResourceTemplateUuids: uuidArray(
        item.allowed_resource_template_uuids
      ),
      occupiedMaterialUuid: nullableUuid(item.occupied_material_uuid)
    }))
    .sort((left, right) =>
      left.sortOrder - right.sortOrder || left.uuid.localeCompare(right.uuid)
    )
  const templateNames = new Map<string, string>()
  for (const material of materials) {
    templateNames.set(material.resourceTemplateUuid, material.materialClass)
  }
  for (const site of sites) {
    for (const uuid of site.allowedResourceTemplateUuids) {
      if (!templateNames.has(uuid)) templateNames.set(uuid, uuid)
    }
  }
  const registeredTemplatesByUuid = new Map(
    registeredResourceTemplates.map((template) => [template.uuid, template])
  )
  for (const template of registeredResourceTemplates) {
    if (!templateNames.has(template.uuid)) {
      templateNames.set(template.uuid, template.displayName)
    }
  }

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
    resourceTemplates: [...templateNames.entries()]
      .map(([uuid, displayName]) => {
        const shape = registeredTemplatesByUuid.get(uuid)?.shape
        return {
          uuid,
          displayName,
          ...(shape ? { shape } : {})
        }
      })
      .sort((left, right) => left.uuid.localeCompare(right.uuid)),
    materials,
    sites
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

function uniqueRecords(
  records: Record<string, unknown>[],
  label: string
): Record<string, unknown>[] {
  const seen = new Set<string>()
  for (const record of records) {
    const uuid = uuidString(record.uuid)
    if (seen.has(uuid)) invalidCatalog(`${label} UUID is duplicated`)
    seen.add(uuid)
  }
  return records
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

function nullableUuid(value: unknown): string | null {
  return value === null || value === undefined ? null : uuidString(value)
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : nonEmptyString(value)
}

function uuidArray(value: unknown): string[] {
  if (!Array.isArray(value)) invalidCatalog('Expected a UUID array')
  const uuids = value.map(uuidString)
  if (new Set(uuids).size !== uuids.length) {
    invalidCatalog('UUID array contains duplicates')
  }
  return uuids
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
