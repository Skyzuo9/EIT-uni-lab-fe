import { requestData, type HttpClient } from './http'

export interface MaterialTemplateSummary {
  uuid: string
  name: string
  tags: readonly string[]
  resourceType: 'device' | 'resource'
  icon?: string
  description?: string
}

export interface MaterialTemplateDetail extends MaterialTemplateSummary {
  configInfos: readonly Record<string, unknown>[]
  model?: Record<string, unknown>
}

export interface MaterialGraphPayload {
  nodes: readonly Record<string, unknown>[]
}

export interface MaterialService {
  getTemplates: (laboratoryId: string) => Promise<MaterialTemplateSummary[]>
  getTemplate: (templateId: string) => Promise<MaterialTemplateDetail>
  saveGraph: (
    laboratoryId: string,
    graph: MaterialGraphPayload
  ) => Promise<void>
}

export function createMaterialService(http: HttpClient): MaterialService {
  return {
    getTemplates: async (laboratoryId) => {
      const response = await requestData<{
        templates?: Record<string, unknown>[]
      }>(
        http,
        `/api/v1/lab/material/template?lab_uuid=${encodeURIComponent(laboratoryId)}`
      )
      return (response.templates ?? []).map(mapTemplateSummary)
    },
    getTemplate: async (templateId) => {
      const response = await requestData<Record<string, unknown>>(
        http,
        `/api/v1/lab/material/template/${encodeURIComponent(templateId)}`
      )
      return mapTemplateDetail(response)
    },
    saveGraph: async (laboratoryId, graph) => {
      await requestData<unknown>(http, '/api/v1/lab/material/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          graph,
          lab_uuid: laboratoryId
        })
      })
    }
  }
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
    configInfos: Array.isArray(raw.config_infos)
      ? raw.config_infos.filter(isRecord)
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}
