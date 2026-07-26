import type {
  LabPose,
  MaterialAggregate,
  MaterialAnchor,
  MaterialGraphPort,
  MaterialPlacement,
  MaterialScope,
  MaterialSite,
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

  const requireReadGraph = (): void => {
    assertCapability(
      getCapabilityStatus(
        backend,
        capabilities,
        'material.readGraph'
      ),
      'material.readGraph'
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

    getGraph: async (scope) => {
      requireReadGraph()
      assertSingletonScope(scope)

      const aggregates: MaterialAggregate[] = []
      let page = 1
      let total = Number.POSITIVE_INFINITY
      while (aggregates.length < total) {
        const response = await requestData<{
          items?: Record<string, unknown>[]
          total?: number
          page?: number
          page_size?: number
        }>(
          http,
          `/api/v1/materials?page=${page}&page_size=100`
        )
        const items = response.items ?? []
        aggregates.push(...items.map(mapMaterialAggregate))
        total = finiteNumber(response.total, aggregates.length)
        if (items.length === 0 || aggregates.length >= total) break
        page += 1
      }
      return aggregates
    },
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

function mapMaterialAggregate(
  raw: Record<string, unknown>
): MaterialAggregate {
  const config = recordValue(raw.config)
  const placement = parsePlacement(config.placement)
  const sites = Array.isArray(config.sites)
    ? config.sites.map(parseSite)
    : []
  const id = requiredString(raw.uuid, 'uuid')

  for (const site of sites) {
    if (site.ownerMaterialId !== id) {
      throw invalidGraph(
        `Site ${site.id} owner ${site.ownerMaterialId} does not match ${id}`
      )
    }
  }

  return {
    material: {
      id,
      sourceTemplateId: requiredString(
        raw.resource_template_uuid,
        'resource_template_uuid'
      ),
      code: requiredString(raw.code, 'code'),
      name: requiredString(raw.name, 'name'),
      description: optionalString(raw.description),
      config,
      createdAt: requiredString(raw.create_time, 'create_time'),
      updatedAt: requiredString(raw.update_time, 'update_time')
    },
    placement,
    sites,
    revision: Math.max(1, finiteNumber(raw.revision, 1))
  }
}

function parsePlacement(value: unknown): MaterialPlacement {
  const raw = recordValue(value)
  const kind = requiredString(raw.kind, 'config.placement.kind')
  if (kind === 'unplaced') return { kind }
  if (kind === 'world') {
    return {
      kind,
      pose: parsePose(raw.pose, 'config.placement.pose')
    }
  }
  if (kind === 'parent') {
    return {
      kind,
      parentId: requiredString(
        raw.parentId,
        'config.placement.parentId'
      ),
      anchor: parseAnchor(raw.anchor),
      localPose: parsePose(
        raw.localPose,
        'config.placement.localPose'
      )
    }
  }
  if (kind === 'site') {
    return {
      kind,
      parentId: requiredString(
        raw.parentId,
        'config.placement.parentId'
      ),
      siteId: requiredString(
        raw.siteId,
        'config.placement.siteId'
      ),
      offsetPose: parsePose(
        raw.offsetPose,
        'config.placement.offsetPose'
      )
    }
  }
  throw invalidGraph(`Unsupported placement kind: ${kind}`)
}

function parseAnchor(value: unknown): MaterialAnchor {
  const raw = recordValue(value)
  const kind = requiredString(raw.kind, 'anchor.kind')
  if (kind === 'root') return { kind }
  if (kind === 'link') {
    return {
      kind,
      linkName: requiredString(raw.linkName, 'anchor.linkName')
    }
  }
  throw invalidGraph(`Unsupported anchor kind: ${kind}`)
}

function parseSite(value: unknown): MaterialSite {
  const raw = recordValue(value)
  const visual = isRecord(raw.visual) ? raw.visual : undefined
  return {
    id: requiredString(raw.id, 'site.id'),
    ownerMaterialId: requiredString(
      raw.ownerMaterialId,
      'site.ownerMaterialId'
    ),
    key: requiredString(raw.key, 'site.key'),
    name: requiredString(raw.name, 'site.name'),
    anchor: parseAnchor(raw.anchor),
    poseInAnchor: parsePose(raw.poseInAnchor, 'site.poseInAnchor'),
    sizeMm: parseTuple(raw.sizeMm, 'site.sizeMm'),
    capacity: Math.max(1, finiteNumber(raw.capacity, 1)),
    allowedTemplateIds: stringArray(raw.allowedTemplateIds),
    occupiedMaterialIds: stringArray(raw.occupiedMaterialIds),
    kind: siteKind(raw.kind),
    shape:
      raw.shape === 'circle' || raw.shape === 'rectangle'
        ? raw.shape
        : undefined,
    visible: raw.visible == null ? true : Boolean(raw.visible),
    maxVolumeUl:
      raw.maxVolumeUl == null
        ? undefined
        : Math.max(0, finiteNumber(raw.maxVolumeUl)),
    visual: visual
      ? {
          state: siteVisualState(visual.state),
          fillFraction: Math.min(
            Math.max(finiteNumber(visual.fillFraction), 0),
            1
          )
        }
      : undefined
  }
}

function siteKind(value: unknown): MaterialSite['kind'] {
  return value === 'site' ||
    value === 'deck-slot' ||
    value === 'well' ||
    value === 'tip-spot'
    ? value
    : undefined
}

function siteVisualState(
  value: unknown
): NonNullable<MaterialSite['visual']>['state'] {
  return value === 'occupied' ||
    value === 'filled' ||
    value === 'tip-present'
    ? value
    : 'empty'
}

function parsePose(value: unknown, field: string): LabPose {
  const raw = recordValue(value)
  return {
    positionMm: parseTuple(raw.positionMm, `${field}.positionMm`),
    rotationDegXYZ: parseTuple(
      raw.rotationDegXYZ,
      `${field}.rotationDegXYZ`
    )
  }
}

function parseTuple(
  value: unknown,
  field: string
): readonly [number, number, number] {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    value.some((entry) => !Number.isFinite(Number(entry)))
  ) {
    throw invalidGraph(`${field} must contain three finite numbers`)
  }
  return [Number(value[0]), Number(value[1]), Number(value[2])]
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((entry) => String(entry))
    : []
}

function requiredString(value: unknown, field: string): string {
  const result = optionalString(value)?.trim()
  if (!result) throw invalidGraph(`${field} is required`)
  return result
}

function recordValue(value: unknown): Record<string, unknown> {
  if (isRecord(value)) return value
  throw invalidGraph('Material graph field must be an object')
}

function invalidGraph(message: string): ServiceError {
  return new ServiceError({
    code: 'INVALID_MATERIAL_GRAPH_RESPONSE',
    message,
    retryable: false
  })
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
