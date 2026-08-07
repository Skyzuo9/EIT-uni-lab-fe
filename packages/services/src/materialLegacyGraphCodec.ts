import type {
  CreateMaterialResult,
  MaterialAggregate,
  MaterialAnchor,
  MaterialPlacement,
  MaterialSite
} from '@unilab/material'

import {
  finiteNumber,
  invalidGraph,
  isRecord,
  optionalString,
  parsePose,
  parseTuple,
  recordValue,
  requiredString,
  siteKind,
  siteVisualState,
  stringArray
} from './materialCodecPrimitives'

export function mapCreateMaterialResult(
  raw: Record<string, unknown>
): CreateMaterialResult {
  if (
    !Array.isArray(raw.aggregates) ||
    raw.aggregates.some((aggregate) => !isRecord(aggregate))
  ) {
    throw invalidGraph('create.aggregates must be an object array')
  }
  const edgeSyncState = raw.edge_sync_state
  if (
    edgeSyncState !== 'not-required' &&
    edgeSyncState !== 'pending' &&
    edgeSyncState !== 'synced' &&
    edgeSyncState !== 'failed'
  ) {
    throw invalidGraph('create.edge_sync_state is invalid')
  }
  return {
    aggregates: raw.aggregates.map(mapMaterialAggregate),
    primaryMaterialId: requiredString(
      raw.primary_material_id,
      'primary_material_id'
    ),
    creationOperationId: requiredString(
      raw.creation_operation_id,
      'creation_operation_id'
    ),
    edgeSyncState
  }
}

/**
 * Backend 的 MaterialGraph 是共享 wire contract；MaterialAggregate 只是 FE
 * 内部渲染模型。所有 snake_case、相对位置及 Site 占用关系只在这个 adapter
 * seam 转换，UI 不读取 Inventory 私有 DTO，也不猜测字段名。
 */

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
    sortOrder: finiteNumber(raw.sortOrder, 0),
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


