import type {
  MaterialTemplateCatalog,
  MaterialTemplateDetail,
  MaterialTemplateSummary
} from '@unilab/material'

import { ServiceError } from './errors'
import { requestData, type HttpClient } from './http'

interface BackendCursorPage {
  items?: unknown
  has_more?: unknown
  next_cursor_uuid?: unknown
}

const BACKEND_CATALOG_PAGE_SIZE = 100

/**
 * 读取 Backend 的完整资源模板目录，并把 UUID 游标分页隐藏在 Service adapter 内。
 *
 * @param http 已绑定 Backend 权威地址的 HTTP 客户端。
 * @returns 前端统一的只读物料模板目录；revision 由当前目录内容稳定派生。
 */
export async function loadBackendMaterialTemplateCatalog(
  http: HttpClient
): Promise<MaterialTemplateCatalog> {
  const rawItems: Record<string, unknown>[] = []
  let cursor: string | null = null

  do {
    const query = new URLSearchParams({
      limit: String(BACKEND_CATALOG_PAGE_SIZE)
    })
    if (cursor) query.set('cursor_uuid', cursor)
    const page = await requestData<BackendCursorPage>(
      http,
      `/api/v1/resource-templates?${query.toString()}`
    )
    const items = recordArray(page.items, 'resource template items')
    rawItems.push(...items)

    if (page.has_more !== true) break
    const nextCursor = optionalString(page.next_cursor_uuid)
    if (!nextCursor || nextCursor === cursor) {
      throw invalidCatalog('resource template cursor did not advance')
    }
    cursor = nextCursor
  } while (true)

  const items = rawItems.map(mapBackendTemplateSummary)
  return {
    revision: contentFingerprint(items),
    stale: false,
    items
  }
}

/**
 * 读取一个 Backend 资源模板详情，并映射为只读物料模板详情。
 *
 * @param http 已绑定 Backend 权威地址的 HTTP 客户端。
 * @param templateId Backend 资源模板 UUID。
 * @returns 前端可展示的模板详情；不虚构几何、库位或创建能力。
 */
export async function loadBackendMaterialTemplateDetail(
  http: HttpClient,
  templateId: string
): Promise<MaterialTemplateDetail> {
  const raw = await requestData<Record<string, unknown>>(
    http,
    `/api/v1/resource-templates/${encodeURIComponent(templateId)}`
  )
  const summary = mapBackendTemplateSummary(raw)
  const assets: Record<string, string> = {}
  const cover = optionalString(raw.cover)
  if (cover) assets.cover = cover

  return {
    ...summary,
    description: optionalString(raw.description),
    contentHash: contentFingerprint(raw),
    compatibility: {},
    configuration: {
      schema: asRecord(raw.config_schema),
      uiSchema: asRecord(raw.ui_overlay)
    },
    assets
  }
}

/** 把 Backend 资源模板摘要映射为前端只读模板，不提升写入能力。 */
function mapBackendTemplateSummary(
  raw: Record<string, unknown>
): MaterialTemplateSummary {
  const uuid = requiredString(raw.uuid, 'uuid')
  const key = requiredString(raw.name, 'name')
  const resourceType = requiredString(raw.resource_type, 'resource_type')
  const kind = resourceType === 'device' ? 'device' : 'resource'
  const tags = stringArray(raw.tags)

  return {
    uuid,
    key,
    sourceNamespace: 'backend',
    kind,
    displayName: optionalString(raw.display_name) ?? key,
    tags,
    categoryPath: [resourceType],
    icon: optionalString(raw.icon),
    description: optionalString(raw.description),
    status: 'ready',
    contentHash: contentFingerprint({
      uuid,
      key,
      resourceType,
      displayName: raw.display_name,
      tags
    }),
    creation: {
      mode: kind === 'device' ? 'dynamic-device' : 'resource-tree',
      available: false,
      reason: 'Backend 尚未向前端开放带修订与补偿语义的物料创建命令'
    }
  }
}

/** 为只读目录生成稳定的非安全散列，只用于检测同一会话中的内容变化。 */
function contentFingerprint(value: unknown): string {
  const content = JSON.stringify(value)
  let hash = 2166136261
  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `backend:${(hash >>> 0).toString(16).padStart(8, '0')}`
}

/** 读取对象数组；Backend 合同形状异常时失败关闭。 */
function recordArray(value: unknown, field: string): Record<string, unknown>[] {
  if (!Array.isArray(value) || value.some((item) => !isRecord(item))) {
    throw invalidCatalog(`${field} must be an object array`)
  }
  return value as Record<string, unknown>[]
}

/** 读取必填非空字符串。 */
function requiredString(value: unknown, field: string): string {
  const result = optionalString(value)
  if (!result) throw invalidCatalog(`${field} must be a non-empty string`)
  return result
}

/** 读取可选非空字符串。 */
function optionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const result = value.trim()
  return result || undefined
}

/** 读取字符串数组并丢弃非法扩展值。 */
function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

/** 把未知 JSON 值收敛为普通对象。 */
function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

/** 判断未知 JSON 值是否为普通对象。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

/** 创建可诊断、不可重试的 Backend 模板合同错误。 */
function invalidCatalog(detail: string): ServiceError {
  return new ServiceError({
    code: 'INVALID_BACKEND_RESOURCE_TEMPLATE',
    message: `Backend 资源模板响应无效：${detail}`,
    retryable: false
  })
}
