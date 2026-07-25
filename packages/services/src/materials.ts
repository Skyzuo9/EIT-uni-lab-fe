import type {
  MaterialGraphPort,
  MaterialScope,
  MaterialTemplateCatalogPort,
  MaterialTemplateDetail,
  MaterialTemplatePage,
  MaterialTemplateQuery,
  MaterialTemplateSummary,
  MaterialTemplateWell
} from '@unilab/material'

import type { BackendConfig } from './backends'
import {
  getCapabilityStatus,
  type ServerCapabilities
} from './capabilities'
import { assertCapability, ServiceError } from './errors'
import { requestData, type HttpClient } from './http'

export type {
  MaterialScope,
  MaterialTemplateDetail,
  MaterialTemplatePage,
  MaterialTemplateQuery,
  MaterialTemplateSummary
} from '@unilab/material'

export type MaterialService =
  MaterialTemplateCatalogPort &
  MaterialGraphPort

export function createMaterialService(
  http: HttpClient,
  backend: BackendConfig,
  capabilities: ServerCapabilities
): MaterialService {
  const requireReadTemplates = (): void => {
    assertCapability(
      getCapabilityStatus(
        backend,
        capabilities,
        'material.readTemplates'
      ),
      'material.readTemplates'
    )
  }

  return {
    listTemplates: async (scope, query = {}) => {
      requireReadTemplates()
      assertSingletonScope(scope)

      const response = await requestData<{
        items?: Record<string, unknown>[]
        total?: number
        page?: number
        page_size?: number
      }>(http, `/api/v1/resource-templates${templateQuery(query)}`)

      return {
        items: (response.items ?? []).map(mapTemplateSummary),
        total: finiteNumber(response.total),
        page: finiteNumber(response.page, 1),
        pageSize: finiteNumber(response.page_size, 20)
      }
    },

    getTemplate: async (scope, templateId) => {
      requireReadTemplates()
      assertSingletonScope(scope)

      const response = await requestData<Record<string, unknown>>(
        http,
        `/api/v1/resource-templates/${encodeURIComponent(templateId)}`
      )
      return mapTemplateDetail(response)
    },

    getGraph: async (_scope) =>
      unavailableGraphOperation('material.readGraph'),
    createMaterial: async (_scope, _input) =>
      unavailableGraphOperation('material.create'),
    undoCreate: async (_command) =>
      unavailableGraphOperation('edge.undoCreate'),
    updateConfig: async (_command) =>
      unavailableGraphOperation('material.updateConfig'),
    move: async (_command) =>
      unavailableGraphOperation('material.move'),
    attach: async (_command) =>
      unavailableGraphOperation('material.attach'),
    detach: async (_command) =>
      unavailableGraphOperation('material.detach'),
    updateSite: async (_command) =>
      unavailableGraphOperation('material.updateSite'),
    getEdgeOperations: async (_scope, _operationIds) =>
      unavailableGraphOperation('edge.provisioning')
  }

  function unavailableGraphOperation(
    capability: import('./capabilities').ServerCapability
  ): never {
    assertCapability(
      getCapabilityStatus(backend, capabilities, capability),
      capability
    )
    throw new ServiceError({
      code: 'MATERIAL_GRAPH_ADAPTER_NOT_IMPLEMENTED',
      message: `${capability} 已声明，但当前 adapter 尚未实现`,
      retryable: false
    })
  }
}

function assertSingletonScope(scope: MaterialScope): void {
  if (scope.kind === 'singleton') return
  throw new ServiceError({
    code: 'UNSUPPORTED_MATERIAL_SCOPE',
    message: '当前 Material adapter 只支持 singleton scope',
    retryable: false
  })
}

function templateQuery(query: MaterialTemplateQuery): string {
  const params = new URLSearchParams()
  if (query.page != null) params.set('page', String(query.page))
  if (query.pageSize != null) params.set('page_size', String(query.pageSize))
  if (query.name) params.set('name', query.name)
  if (query.resourceType) params.set('resource_type', query.resourceType)
  const value = params.toString()
  return value ? `?${value}` : ''
}

function mapTemplateSummary(
  raw: Record<string, unknown>
): MaterialTemplateSummary {
  return {
    uuid: stringValue(raw.uuid),
    name: stringValue(raw.name),
    tags: Array.isArray(raw.tags)
      ? raw.tags.filter((tag): tag is string => typeof tag === 'string')
      : [],
    resourceType: raw.resource_type === 'resource' ? 'resource' : 'device',
    icon: optionalString(raw.icon),
    description: optionalString(raw.description)
  }
}

function mapTemplateDetail(
  raw: Record<string, unknown>
): MaterialTemplateDetail {
  return {
    ...mapTemplateSummary(raw),
    configInfos: Array.isArray(raw.config_info)
      ? (raw.config_info.filter(isRecord) as MaterialTemplateWell[])
      : [],
    model: isRecord(raw.model) ? raw.model : undefined
  }
}

function stringValue(value: unknown): string {
  return value == null ? '' : String(value)
}

function optionalString(value: unknown): string | undefined {
  return value == null ? undefined : String(value)
}

function finiteNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}
