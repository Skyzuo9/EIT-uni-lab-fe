import { ServiceError } from './errors'
import type { HttpClient } from './http'

const PAGE_LIMIT = 100
const PAGE_BUDGET = 100
const ITEM_BUDGET = PAGE_LIMIT * PAGE_BUDGET
const DETAIL_REQUEST_BATCH_SIZE = 8
const CURSOR_LIST_FIELDS = new Set([
  'authority',
  'catalog_fingerprint',
  'items',
  'has_more',
  'next_cursor_uuid',
  'total'
])
const NUMBERED_LIST_FIELDS = new Set([
  'authority',
  'catalog_fingerprint',
  'items',
  'page',
  'page_size',
  'total'
])

type CatalogPagination =
  | {
    mode: 'cursor'
    hasMore: boolean
    nextCursorUuid: unknown
  }
  | {
    mode: 'numbered'
    page: number
    pageSize: number
    total: number
  }

interface NumberedPaginationState {
  page: number
  pageSize: number | null
  total: number | null
}

/** OS 微后端可选发布的节点模板目录代际。 */
export interface WorkflowNodeTemplateCatalogGeneration {
  authorityId: string
  authorityKind: 'local' | 'backend'
  fingerprint: string
}

/** 一个已完整遍历且身份无重复的节点模板目录。 */
export interface WorkflowNodeTemplateCatalog {
  items: Record<string, unknown>[]
  generation: WorkflowNodeTemplateCatalogGeneration | null
}

/** 节点模板目录的显式查询条件。 */
export interface WorkflowNodeTemplateCatalogQuery {
  nodeType?: string
  signal?: AbortSignal
}

/** 一个列表摘要及其同代际详情。 */
export interface WorkflowNodeTemplateDetailEntry {
  summary: Record<string, unknown>
  detail: Record<string, unknown>
}

/**
 * 通过后端（Backend）UUID 游标或当前 OS 页码合同读取完整节点模板目录。
 *
 * @param http 节点模板 API 使用的 HTTP 客户端。
 * @param query 可选 node_type 筛选和取消信号；分页选择由响应合同决定。
 * @returns 按服务端游标顺序收集的唯一摘要，以及可选 OS 目录代际。
 * @throws 响应字段、UUID、游标推进、目录代际或预算无效时关闭失败。
 */
export async function loadWorkflowNodeTemplateCatalog(
  http: HttpClient,
  query: WorkflowNodeTemplateCatalogQuery = {}
): Promise<WorkflowNodeTemplateCatalog> {
  // `items` 保存跨页首见顺序，作为后续详情投影的稳定输入。
  const items: Record<string, unknown>[] = []
  // `itemUuids` 阻止同一节点模板身份跨页重复或覆盖。
  const itemUuids = new Set<string>()
  // `cursorUuids` 阻止服务端把客户端带回已经使用过的游标。
  const cursorUuids = new Set<string>()
  let cursorUuid: string | null = null
  let generation: WorkflowNodeTemplateCatalogGeneration | null | undefined
  let paginationMode: CatalogPagination['mode'] | null = null
  const numberedState: NumberedPaginationState = {
    page: 1,
    pageSize: null,
    total: null
  }

  for (let pageCount = 0; pageCount < PAGE_BUDGET; pageCount += 1) {
    const path = paginationMode === 'numbered'
      ? workflowNodeTemplateNumberedListPath(
        query.nodeType,
        numberedState.page,
        numberedState.pageSize ?? PAGE_LIMIT
      )
      : workflowNodeTemplateListPath(query.nodeType, cursorUuid)
    const data = catalogEnvelope(await http.request<unknown>(path, {
      signal: query.signal
    }))
    const pagination = parseListPagination(data)
    if (paginationMode !== null && pagination.mode !== paginationMode) {
      invalidCatalog('节点模板（WorkflowNodeTemplate）目录分页合同发生漂移')
    }
    paginationMode = pagination.mode
    const pageGeneration = optionalGeneration(data)
    generation = mergeGeneration(generation, pageGeneration)
    const pageItems = recordArray(data.items)
    if (items.length + pageItems.length > ITEM_BUDGET) invalidCatalog(
      '节点模板（WorkflowNodeTemplate）目录超过项目预算'
    )
    for (const item of pageItems) {
      const itemUuid = uuidValue(item.uuid)
      if (itemUuids.has(itemUuid)) invalidCatalog(
        '节点模板（WorkflowNodeTemplate）目录出现重复 UUID'
      )
      itemUuids.add(itemUuid)
      items.push(item)
    }

    if (pagination.mode === 'cursor') {
      const nextCursorUuid = advanceCursorPagination(
        pagination,
        pageItems.length,
        cursorUuid,
        cursorUuids
      )
      if (nextCursorUuid === null) {
        return { items, generation: generation ?? null }
      }
      cursorUuid = nextCursorUuid
      continue
    }

    if (advanceNumberedPagination(
      pagination,
      numberedState,
      pageItems.length,
      items.length
    )) {
      return { items, generation: generation ?? null }
    }
  }
  return invalidCatalog('节点模板（WorkflowNodeTemplate）目录超过分页预算')
}

/** 校验 UUID 游标页并返回下一游标；null 表示目录已完整收集。 */
function advanceCursorPagination(
  pagination: Extract<CatalogPagination, { mode: 'cursor' }>,
  pageItemCount: number,
  currentCursorUuid: string | null,
  observedCursorUuids: Set<string>
): string | null {
  if (!pagination.hasMore) {
    if (pagination.nextCursorUuid !== null) invalidCatalog(
      '节点模板（WorkflowNodeTemplate）末页游标必须为 null'
    )
    return null
  }
  if (pageItemCount === 0) invalidCatalog(
    '节点模板（WorkflowNodeTemplate）目录无法从空页推进'
  )
  const nextCursorUuid = uuidValue(pagination.nextCursorUuid)
  if (
    nextCursorUuid === currentCursorUuid ||
    observedCursorUuids.has(nextCursorUuid)
  ) invalidCatalog('节点模板（WorkflowNodeTemplate）目录游标重复')
  observedCursorUuids.add(nextCursorUuid)
  return nextCursorUuid
}

/** 校验页码目录的稳定元数据，并在仍有后续页时推进请求页码。 */
function advanceNumberedPagination(
  pagination: Extract<CatalogPagination, { mode: 'numbered' }>,
  state: NumberedPaginationState,
  pageItemCount: number,
  collectedItemCount: number
): boolean {
  if (pagination.page !== state.page) invalidCatalog(
    '节点模板（WorkflowNodeTemplate）目录页码未按请求推进'
  )
  if (pagination.pageSize > PAGE_LIMIT) invalidCatalog(
    '节点模板（WorkflowNodeTemplate）目录页大小超过项目预算'
  )
  if (state.pageSize === null) state.pageSize = pagination.pageSize
  else if (pagination.pageSize !== state.pageSize) invalidCatalog(
    '节点模板（WorkflowNodeTemplate）目录页大小发生漂移'
  )
  if (state.total === null) state.total = pagination.total
  else if (pagination.total !== state.total) invalidCatalog(
    '节点模板（WorkflowNodeTemplate）目录总数发生漂移'
  )
  if (state.total > ITEM_BUDGET || pageItemCount > state.pageSize) {
    invalidCatalog('节点模板（WorkflowNodeTemplate）目录超过项目预算')
  }
  if (collectedItemCount > state.total) invalidCatalog(
    '节点模板（WorkflowNodeTemplate）目录项目数超过 total'
  )
  if (collectedItemCount === state.total) return true
  if (pageItemCount === 0 || pageItemCount < state.pageSize) {
    invalidCatalog('节点模板（WorkflowNodeTemplate）目录无法从短页推进')
  }
  state.page += 1
  return false
}

/**
 * 以固定并发上限读取目录中全部节点模板详情。
 *
 * @param http 节点模板详情 API 使用的 HTTP 客户端。
 * @param catalog 已完成游标遍历和 UUID 去重的目录。
 * @param signal 调用方取消信号；传递到每个详情请求。
 * @returns 与摘要首见顺序一致、且已核对可选 OS 代际的详情条目。
 * @throws 任一详情响应无效时拒绝整个结果，不返回部分目录。
 */
export async function loadWorkflowNodeTemplateDetails(
  http: HttpClient,
  catalog: WorkflowNodeTemplateCatalog,
  signal?: AbortSignal
): Promise<WorkflowNodeTemplateDetailEntry[]> {
  const entries: WorkflowNodeTemplateDetailEntry[] = []

  /**
   * 读取并核对一个摘要对应的节点模板详情。
   *
   * @param summary 已去重但字段仍保持 wire 形状的列表摘要。
   * @returns 原摘要与同代际详情组成的条目。
   * @throws 摘要 UUID 或详情响应无效时关闭失败。
   */
  async function loadDetail(
    summary: Record<string, unknown>
  ): Promise<WorkflowNodeTemplateDetailEntry> {
    const uuid = uuidValue(summary.uuid)
    const raw = await http.request<unknown>(
      `/api/v1/workflow-node-templates/${encodeURIComponent(uuid)}`,
      { signal }
    )
    return {
      summary,
      detail: parseWorkflowNodeTemplateDetail(raw, catalog.generation)
    }
  }

  for (
    let index = 0;
    index < catalog.items.length;
    index += DETAIL_REQUEST_BATCH_SIZE
  ) {
    const batch = catalog.items.slice(
      index,
      index + DETAIL_REQUEST_BATCH_SIZE
    )
    entries.push(...await Promise.all(batch.map(loadDetail)))
  }
  return entries
}

/**
 * 合并多个分别筛选的节点模板目录，并保持首见 UUID 顺序。
 *
 * @param catalogs 默认目录、已发布工作流（PublishedWorkflow）目录等结果。
 * @returns 同身份同内容只保留一次的闭合目录。
 * @throws 目录代际混合、同 UUID 内容冲突或输入为空时关闭失败。
 */
export function mergeWorkflowNodeTemplateCatalogs(
  ...catalogs: WorkflowNodeTemplateCatalog[]
): WorkflowNodeTemplateCatalog {
  if (catalogs.length === 0) invalidCatalog(
    '节点模板（WorkflowNodeTemplate）目录合并输入为空'
  )
  // `mergedItems` 保留默认目录优先、显式目录随后出现的稳定顺序。
  const mergedItems: Record<string, unknown>[] = []
  // `itemsByUuid` 用于区分安全的相同摘要重叠与危险的身份冲突。
  const itemsByUuid = new Map<string, Record<string, unknown>>()
  let generation: WorkflowNodeTemplateCatalogGeneration | null | undefined
  for (const catalog of catalogs) {
    generation = mergeGeneration(generation, catalog.generation)
    for (const item of catalog.items) {
      const uuid = uuidValue(item.uuid)
      const current = itemsByUuid.get(uuid)
      if (current) {
        if (!jsonEquals(current, item)) invalidCatalog(
          '节点模板（WorkflowNodeTemplate）相同 UUID 的摘要发生冲突'
        )
        continue
      }
      itemsByUuid.set(uuid, item)
      mergedItems.push(item)
    }
  }
  return { items: mergedItems, generation: generation ?? null }
}

/**
 * 解码一个节点模板详情并核对其目录代际。
 *
 * @param raw 带 API 响应外壳的节点模板详情。
 * @param expectedGeneration 列表阶段得到的可选 OS 目录代际。
 * @returns 只含 template/handles 与可选 OS 扩展的详情数据主体。
 * @throws 响应外壳无效，或列表与详情混合缺失/漂移代际时关闭失败。
 */
export function parseWorkflowNodeTemplateDetail(
  raw: unknown,
  expectedGeneration: WorkflowNodeTemplateCatalogGeneration | null
): Record<string, unknown> {
  const data = catalogEnvelope(raw)
  const detailGeneration = optionalGeneration(data)
  mergeGeneration(expectedGeneration, detailGeneration)
  if (!Object.prototype.hasOwnProperty.call(data, 'template') ||
    !Object.prototype.hasOwnProperty.call(data, 'handles')) {
    invalidCatalog('节点模板（WorkflowNodeTemplate）详情字段不完整')
  }
  return data
}

/**
 * 构造仅含后端（Backend）正式字段的节点模板列表路径。
 *
 * @param nodeType 可选的显式节点类型筛选。
 * @param cursorUuid 上一页给出的 UUID 游标。
 * @returns 只含 limit、node_type 和 cursor_uuid 的稳定相对路径。
 * @throws nodeType 为空白时关闭失败；cursorUuid 已由调用方校验。
 */
function workflowNodeTemplateListPath(
  nodeType: string | undefined,
  cursorUuid: string | null
): string {
  const query = new URLSearchParams({ limit: String(PAGE_LIMIT) })
  if (cursorUuid) query.set('cursor_uuid', cursorUuid)
  if (nodeType !== undefined) {
    const normalizedNodeType = nodeType.trim()
    if (!normalizedNodeType) invalidCatalog(
      '节点模板（WorkflowNodeTemplate）node_type 不能为空'
    )
    query.set('node_type', normalizedNodeType)
  }
  return `/api/v1/workflow-node-templates?${query.toString()}`
}

/** 构造当前 OS 页码合同的后续页路径。 */
function workflowNodeTemplateNumberedListPath(
  nodeType: string | undefined,
  page: number,
  pageSize: number
): string {
  const query = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize)
  })
  if (nodeType !== undefined) query.set('node_type', nodeType.trim())
  return `/api/v1/workflow-node-templates?${query.toString()}`
}

/**
 * 解码统一 API 响应外壳。
 *
 * @param raw 未信任 HTTP 响应。
 * @returns code 为零且无 error 的 data 对象。
 * @throws 外壳缺失、业务码非零或 data 非对象时关闭失败。
 */
function catalogEnvelope(raw: unknown): Record<string, unknown> {
  const envelope = recordValue(raw)
  if (
    envelope.code !== 0 ||
    !Object.prototype.hasOwnProperty.call(envelope, 'data') ||
    Object.prototype.hasOwnProperty.call(envelope, 'error')
  ) invalidCatalog('节点模板（WorkflowNodeTemplate）响应外壳无效')
  return recordValue(envelope.data)
}

/**
 * 识别互斥的 UUID 游标与当前 OS 页码合同，并拒绝混合或未知字段。
 *
 * @param data 列表响应 data 对象。
 * @returns 已验证的分页元数据。
 * @throws 两套字段混合、字段缺失、类型无效或出现未知字段时关闭失败。
 */
function parseListPagination(data: Record<string, unknown>): CatalogPagination {
  const hasCursorFields = ['has_more', 'next_cursor_uuid'].some((field) =>
    Object.prototype.hasOwnProperty.call(data, field)
  )
  // `total` 也可作为 UUID 游标响应的兼容统计元数据，不能单独判定为页码合同。
  const hasNumberedFields = ['page', 'page_size'].some((field) =>
    Object.prototype.hasOwnProperty.call(data, field)
  )
  if (hasCursorFields && hasNumberedFields) invalidCatalog(
    '节点模板（WorkflowNodeTemplate）目录混合了两套分页字段'
  )
  const allowedFields = hasNumberedFields
    ? NUMBERED_LIST_FIELDS
    : CURSOR_LIST_FIELDS
  for (const field of Object.keys(data)) {
    if (!allowedFields.has(field)) invalidCatalog(
      `节点模板（WorkflowNodeTemplate）目录包含未约定字段 ${field}`
    )
  }
  const requiredFields = hasNumberedFields
    ? ['items', 'page', 'page_size', 'total']
    : ['items', 'has_more', 'next_cursor_uuid']
  for (const field of requiredFields) {
    if (!Object.prototype.hasOwnProperty.call(data, field)) invalidCatalog(
      `节点模板（WorkflowNodeTemplate）目录缺少 ${field}`
    )
  }
  if (hasNumberedFields) return {
    mode: 'numbered',
    page: positiveInteger(data.page),
    pageSize: positiveInteger(data.page_size),
    total: nonNegativeInteger(data.total)
  }
  if (Object.prototype.hasOwnProperty.call(data, 'total')) {
    // `total` 只兼容部署端的目录统计，不参与 UUID 游标推进或模板实体投影。
    nonNegativeInteger(data.total)
  }
  if (typeof data.has_more !== 'boolean') invalidCatalog(
    '节点模板（WorkflowNodeTemplate）目录 has_more 必须是布尔值'
  )
  return {
    mode: 'cursor',
    hasMore: data.has_more,
    nextCursorUuid: data.next_cursor_uuid
  }
}

/** 解析正整数分页字段。 */
function positiveInteger(raw: unknown): number {
  const value = nonNegativeInteger(raw)
  if (value < 1) invalidCatalog(
    '节点模板（WorkflowNodeTemplate）分页字段必须为正整数'
  )
  return value
}

/** 解析不超过 JavaScript 安全范围的非负整数。 */
function nonNegativeInteger(raw: unknown): number {
  if (!Number.isSafeInteger(raw) || (raw as number) < 0) invalidCatalog(
    '节点模板（WorkflowNodeTemplate）分页字段必须为非负安全整数'
  )
  return raw as number
}

/**
 * 解析后端（Backend）可省略、OS 必须成对发布的目录代际扩展。
 *
 * @param data 列表或详情数据主体。
 * @returns 后端（Backend）响应返回 null；OS 响应返回权威和指纹。
 * @throws authority 与 catalog_fingerprint 只出现一个或格式无效时关闭失败。
 */
function optionalGeneration(
  data: Record<string, unknown>
): WorkflowNodeTemplateCatalogGeneration | null {
  const hasAuthority = Object.prototype.hasOwnProperty.call(data, 'authority')
  const hasFingerprint = Object.prototype.hasOwnProperty.call(
    data,
    'catalog_fingerprint'
  )
  if (!hasAuthority && !hasFingerprint) return null
  if (hasAuthority !== hasFingerprint) invalidCatalog(
    '节点模板（WorkflowNodeTemplate）OS 目录代际字段必须成对出现'
  )
  const authority = recordValue(data.authority)
  const authorityId = nonEmptyString(authority.authority_id)
  const authorityKind = nonEmptyString(authority.kind)
  if (authorityKind !== 'local' && authorityKind !== 'backend') invalidCatalog(
    '节点模板（WorkflowNodeTemplate）目录权威类型无效'
  )
  const fingerprint = nonEmptyString(data.catalog_fingerprint)
  if (!/^sha256:[0-9a-f]{64}$/.test(fingerprint)) invalidCatalog(
    '节点模板（WorkflowNodeTemplate）目录指纹无效'
  )
  return { authorityId, authorityKind, fingerprint }
}

/**
 * 合并前后响应中的可选 OS 目录代际。
 *
 * @param current 已观察代际；undefined 表示尚未观察任何响应。
 * @param next 新响应携带的代际或后端（Backend）缺省值 null。
 * @returns 第一次观察到的代际；合法后端（Backend）流程始终为 null。
 * @throws 混合缺失、权威漂移或指纹漂移时关闭失败。
 */
function mergeGeneration(
  current: WorkflowNodeTemplateCatalogGeneration | null | undefined,
  next: WorkflowNodeTemplateCatalogGeneration | null
): WorkflowNodeTemplateCatalogGeneration | null {
  if (current === undefined) return next
  if (current === null || next === null) {
    if (current === next) return current
    return invalidCatalog(
      '节点模板（WorkflowNodeTemplate）目录代际混合缺失'
    )
  }
  if (
    current.authorityId !== next.authorityId ||
    current.authorityKind !== next.authorityKind ||
    current.fingerprint !== next.fingerprint
  ) return invalidCatalog('节点模板（WorkflowNodeTemplate）目录代际发生漂移')
  return current
}

/**
 * 解析记录数组且不丢弃任何无效项目。
 *
 * @param raw 未信任数组值。
 * @returns 每项均为普通对象的原顺序数组。
 * @throws 值非数组或任一项非对象时关闭失败。
 */
function recordArray(raw: unknown): Record<string, unknown>[] {
  if (!Array.isArray(raw)) invalidCatalog(
    '节点模板（WorkflowNodeTemplate）items 必须是数组'
  )
  const values: Record<string, unknown>[] = []
  for (const item of raw) values.push(recordValue(item))
  return values
}

/**
 * 解析非数组对象。
 *
 * @param raw 未信任值。
 * @returns 原对象记录。
 * @throws null、数组或非对象值时关闭失败。
 */
function recordValue(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) invalidCatalog(
    '节点模板（WorkflowNodeTemplate）字段必须是对象'
  )
  return raw as Record<string, unknown>
}

/**
 * 解析非空字符串。
 *
 * @param raw 未信任值。
 * @returns 保留 wire 内容的非空字符串。
 * @throws 非字符串或空白字符串时关闭失败。
 */
function nonEmptyString(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) invalidCatalog(
    '节点模板（WorkflowNodeTemplate）字段必须是非空字符串'
  )
  return raw
}

/**
 * 解析并规范 UUID 身份。
 *
 * @param raw 未信任 UUID 值。
 * @returns 小写规范 UUID。
 * @throws UUID 版本或格式无效时关闭失败。
 */
function uuidValue(raw: unknown): string {
  const value = nonEmptyString(raw)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    invalidCatalog('节点模板（WorkflowNodeTemplate）UUID 无效')
  }
  return value.toLowerCase()
}

/**
 * 比较两个 JSON 值的结构语义，不依赖对象键顺序。
 *
 * @param left 首次观察到的摘要。
 * @param right 后续目录中的同身份摘要。
 * @returns 数组顺序与对象键值语义均相同时为 true。
 */
function jsonEquals(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) ||
      left.length !== right.length) return false
    for (let index = 0; index < left.length; index += 1) {
      if (!jsonEquals(left[index], right[index])) return false
    }
    return true
  }
  if (!left || typeof left !== 'object' ||
    !right || typeof right !== 'object') return false
  const leftRecord = left as Record<string, unknown>
  const rightRecord = right as Record<string, unknown>
  const leftKeys = Object.keys(leftRecord).sort()
  const rightKeys = Object.keys(rightRecord).sort()
  if (leftKeys.length !== rightKeys.length) return false
  for (let index = 0; index < leftKeys.length; index += 1) {
    const key = leftKeys[index]
    if (key !== rightKeys[index] ||
      !jsonEquals(leftRecord[key], rightRecord[key])) return false
  }
  return true
}

/**
 * 抛出不可重试的节点模板目录合同错误。
 *
 * @param message 包含中文领域上下文的失败原因。
 * @returns 永不返回。
 * @throws 始终抛出 INVALID_API_RESPONSE 服务错误。
 */
function invalidCatalog(message: string): never {
  throw new ServiceError({
    code: 'INVALID_API_RESPONSE',
    message,
    retryable: false
  })
}
