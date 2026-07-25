import {
  composePoses,
  IDENTITY_POSE,
  relativePose,
  type LabPose,
  type MaterialAggregate,
  type MaterialAnchor,
  type MaterialId,
  type MaterialPlacement,
  type Vector3Tuple as MaterialVector3Tuple
} from '@unilab/material/domain'
import type { SceneGraph } from '@unilab/pascal-host'

import {
  LabDeviceNodeSchema,
  LabTableNodeSchema,
  isLabDeviceNode,
  isLabTableNode,
  type LabAttachPoint,
  type LabPlacementRef
} from './schema'
import { inferModelFormat } from './modelFormat'
import {
  labLinkPoseToThree,
  labPoseToPascal,
  pascalPoseToLab,
  threePoseToLabLink,
  type Vector3Tuple
} from './units'

const SITE_ID = 'site_unilab'
const BUILDING_ID = 'building_unilab'
const LEVEL_ID = 'level_unilab'

export interface MaterialSceneMove {
  materialId: MaterialId
  placement: MaterialPlacement
}

export interface MaterialRenderingSnapshot {
  kind: string
  dimensionsMm: MaterialVector3Tuple
  scale: MaterialVector3Tuple
  model: {
    path: string
    format?: string
    meshDir?: string
    ossDir?: string
    version?: string
    type?: string
    attachPoints: readonly LabAttachPoint[]
  }
}

/**
 * Project the authoritative Material aggregates into Pascal-owned view state.
 * `material.config.rendering` is the preferred, instance-scoped rendering
 * snapshot. Direct config fields are accepted only as a migration fallback.
 */
export function materialAggregatesToSceneGraph(
  aggregates: readonly MaterialAggregate[]
): SceneGraph {
  const aggregatesById = Object.fromEntries(
    aggregates.map((aggregate) => [aggregate.material.id, aggregate])
  )
  const sceneObjectIdByMaterialId = Object.fromEntries(
    aggregates.map((aggregate) => [
      aggregate.material.id,
      materialSceneObjectId(aggregate)
    ])
  )
  const nodes: Record<string, unknown> = {}
  const labNodeIds: string[] = []

  for (const aggregate of aggregates) {
    const id = sceneObjectIdByMaterialId[aggregate.material.id]
    const rendering = readMaterialRendering(aggregate)
    const projected = projectPlacement(
      aggregate,
      aggregatesById,
      sceneObjectIdByMaterialId
    )
    const common = {
      id,
      parentId: LEVEL_ID,
      materialNodeId: aggregate.material.id,
      displayName: aggregate.material.name,
      position: projected.position,
      rotation: projected.rotation,
      dimensions: rendering.dimensionsMm.map(
        (value) => Math.max(value / 1000, 0.01)
      ) as Vector3Tuple,
      placementRef: projected.placementRef
    }

    if (rendering.kind === 'table') {
      nodes[id] = LabTableNodeSchema.parse({
        ...common,
        type: 'lab-table'
      })
    } else {
      nodes[id] = LabDeviceNodeSchema.parse({
        ...common,
        type: 'lab-device',
        deviceType: rendering.kind || 'custom',
        templateUuid: aggregate.material.sourceTemplateId,
        rosDeviceName: sanitizeRosName(
          stringValue(
            readRecord(aggregate.material.config).rosDeviceName,
            aggregate.material.code || aggregate.material.name
          )
        ),
        scale: rendering.scale,
        model: {
          path: rendering.model.path,
          format: inferModelFormat(
            rendering.model.path,
            rendering.model.format
          ),
          meshDir: rendering.model.meshDir,
          ossDir: rendering.model.ossDir,
          version: rendering.model.version,
          type: rendering.model.type,
          attachPoints: rendering.model.attachPoints
        },
        attach: projected.attach
      })
    }
    labNodeIds.push(id)
  }

  nodes[SITE_ID] = {
    id: SITE_ID,
    type: 'site',
    object: 'node',
    name: 'Uni-Lab',
    parentId: null,
    visible: true,
    children: [BUILDING_ID]
  }
  nodes[BUILDING_ID] = {
    id: BUILDING_ID,
    type: 'building',
    object: 'node',
    name: 'Laboratory',
    parentId: SITE_ID,
    visible: true,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    children: [LEVEL_ID]
  }
  nodes[LEVEL_ID] = {
    id: LEVEL_ID,
    type: 'level',
    object: 'node',
    name: 'Lab floor',
    parentId: BUILDING_ID,
    visible: true,
    level: 0,
    children: labNodeIds
  }

  return {
    nodes,
    rootNodeIds: [SITE_ID],
    installedPlugins: ['unilab.lab']
  }
}

export function sceneGraphToMaterialMoves(
  scene: SceneGraph,
  aggregates: readonly MaterialAggregate[]
): MaterialSceneMove[] {
  const aggregatesById = Object.fromEntries(
    aggregates.map((aggregate) => [aggregate.material.id, aggregate])
  )
  const moves: MaterialSceneMove[] = []

  for (const value of Object.values(scene.nodes)) {
    if (!isLabDeviceNode(value) && !isLabTableNode(value)) continue
    const aggregate = aggregatesById[value.materialNodeId]
    if (!aggregate) continue

    const placement = placementFromSceneNode(
      value.position,
      value.rotation,
      aggregate,
      aggregatesById
    )
    if (!samePlacement(placement, aggregate.placement)) {
      moves.push({
        materialId: aggregate.material.id,
        placement
      })
    }
  }

  return moves
}

export function materialSceneObjectId(
  aggregate: MaterialAggregate
): string {
  return readMaterialRendering(aggregate).kind === 'table'
    ? `lab-table-${aggregate.material.id}`
    : `lab-${aggregate.material.id}`
}

export function readMaterialRendering(
  aggregate: MaterialAggregate
): MaterialRenderingSnapshot {
  const config = readRecord(aggregate.material.config)
  const source = recordValue(config.rendering) ?? config
  const model = recordValue(source.model) ?? {}
  const pose = recordValue(source.pose) ?? {}
  const size = recordValue(pose.size) ?? {}
  const kind = stringValue(
    source.kind ?? source.type ?? source.resourceType,
    'custom'
  ).toLowerCase()

  return {
    kind: kind === 'lab-table' || kind === 'workbench' ? 'table' : kind,
    dimensionsMm:
      vectorTuple(source.dimensionsMm ?? source.sizeMm) ??
      [
        finiteNumber(size.width, kind === 'table' ? 1500 : 600),
        finiteNumber(size.height, kind === 'table' ? 900 : 500),
        finiteNumber(size.depth, kind === 'table' ? 750 : 600)
      ],
    scale: vectorTuple(source.scale) ?? [1, 1, 1],
    model: {
      path: stringValue(model.path ?? model.mesh),
      format: optionalString(model.format ?? model.model_type),
      meshDir: optionalString(model.meshDir ?? model.mesh),
      ossDir: optionalString(model.ossDir ?? model.oss_dir),
      version: optionalString(model.version),
      type: optionalString(model.type),
      attachPoints: readAttachPoints(model, aggregate)
    }
  }
}

function projectPlacement(
  aggregate: MaterialAggregate,
  aggregatesById: Readonly<Record<MaterialId, MaterialAggregate>>,
  sceneObjectIdByMaterialId: Readonly<Record<MaterialId, string>>
): {
  position: Vector3Tuple
  rotation: Vector3Tuple
  attach: {
    parentDeviceId: string | null
    parentLinkName: string | null
    mountPoint: string | null
  }
  placementRef: LabPlacementRef
} {
  const placement = aggregate.placement
  const base = {
    attach: {
      parentDeviceId: null,
      parentLinkName: null,
      mountPoint: null
    },
    placementRef: placementRef(placement, aggregatesById)
  }

  if (placement.kind === 'unplaced' || placement.kind === 'world') {
    const pose = labPoseToPascal(
      placement.kind === 'world' ? placement.pose : IDENTITY_POSE
    )
    return { ...base, ...pose }
  }

  const parentSceneObjectId =
    sceneObjectIdByMaterialId[placement.parentId] ??
    `lab-${placement.parentId}`
  const anchor =
    placement.kind === 'parent'
      ? placement.anchor
      : findSite(aggregate, aggregatesById)?.anchor ?? { kind: 'root' }
  const localPose =
    placement.kind === 'parent'
      ? placement.localPose
      : composePoses(
          findSite(aggregate, aggregatesById)?.poseInAnchor ?? IDENTITY_POSE,
          placement.offsetPose
        )
  const pose =
    anchor.kind === 'link'
      ? labLinkPoseToThree(localPose)
      : labPoseToPascal(localPose)

  return {
    ...base,
    ...pose,
    attach: {
      parentDeviceId: parentSceneObjectId,
      parentLinkName:
        anchor.kind === 'link' ? anchor.linkName : '__root__',
      mountPoint: placement.kind === 'site' ? placement.siteId : null
    }
  }
}

function placementFromSceneNode(
  position: Vector3Tuple,
  rotation: Vector3Tuple,
  aggregate: MaterialAggregate,
  aggregatesById: Readonly<Record<MaterialId, MaterialAggregate>>
): MaterialPlacement {
  const current = aggregate.placement
  if (current.kind === 'unplaced' || current.kind === 'world') {
    return {
      kind: 'world',
      pose: pascalPoseToLab(position, rotation)
    }
  }

  const anchor =
    current.kind === 'parent'
      ? current.anchor
      : findSite(aggregate, aggregatesById)?.anchor ?? { kind: 'root' }
  const localPose =
    anchor.kind === 'link'
      ? threePoseToLabLink(position, rotation)
      : pascalPoseToLab(position, rotation)

  if (current.kind === 'parent') {
    return {
      ...current,
      localPose
    }
  }

  const site = findSite(aggregate, aggregatesById)
  return {
    ...current,
    offsetPose: site
      ? relativePose(localPose, site.poseInAnchor)
      : localPose
  }
}

function placementRef(
  placement: MaterialPlacement,
  aggregatesById: Readonly<Record<MaterialId, MaterialAggregate>>
): LabPlacementRef {
  const parentMaterialId =
    placement.kind === 'parent' || placement.kind === 'site'
      ? placement.parentId
      : null
  const site =
    placement.kind === 'site'
      ? aggregatesById[placement.parentId]?.sites.find(
          (candidate) => candidate.id === placement.siteId
        )
      : undefined
  const anchor: MaterialAnchor =
    placement.kind === 'parent'
      ? placement.anchor
      : site?.anchor ?? { kind: 'root' }

  return {
    kind: placement.kind,
    parentMaterialId,
    siteId: placement.kind === 'site' ? placement.siteId : null,
    anchorKind: anchor.kind,
    anchorLinkName: anchor.kind === 'link' ? anchor.linkName : null
  }
}

function findSite(
  child: MaterialAggregate,
  aggregatesById: Readonly<Record<MaterialId, MaterialAggregate>>
) {
  const placement = child.placement
  if (placement.kind !== 'site') return undefined
  return aggregatesById[placement.parentId]?.sites.find(
    (site) => site.id === placement.siteId
  )
}

function readAttachPoints(
  model: Record<string, unknown>,
  aggregate: MaterialAggregate
): LabAttachPoint[] {
  const points = new Map<string, LabAttachPoint>()
  const rawPoints = Array.isArray(model.attachPoints)
    ? model.attachPoints
    : Array.isArray(model.attach_points)
      ? model.attach_points
      : []

  for (const value of rawPoints) {
    const point = recordValue(value)
    if (!point) continue
    const link = optionalString(point.link)
    if (!link) continue
    points.set(link, {
      link,
      label: optionalString(point.label),
      row: optionalNumber(point.row),
      col: optionalNumber(point.col),
      acceptTypes: stringArray(point.acceptTypes ?? point.accept_types),
      position: vectorTuple(point.position),
      rotation: vectorTuple(point.rotation)
    })
  }

  for (const site of aggregate.sites) {
    if (site.anchor.kind !== 'link') continue
    points.set(site.anchor.linkName, {
      link: site.anchor.linkName,
      label: site.name,
      acceptTypes: [...site.allowedTemplateIds],
      position: [...site.poseInAnchor.positionMm],
      rotation: [...site.poseInAnchor.rotationDegXYZ]
    })
  }

  return [...points.values()]
}

function samePlacement(
  left: MaterialPlacement,
  right: MaterialPlacement
): boolean {
  if (left.kind !== right.kind) return false
  if (left.kind === 'unplaced' && right.kind === 'unplaced') return true
  if (left.kind === 'world' && right.kind === 'world') {
    return samePose(left.pose, right.pose)
  }
  if (left.kind === 'parent' && right.kind === 'parent') {
    return (
      left.parentId === right.parentId &&
      JSON.stringify(left.anchor) === JSON.stringify(right.anchor) &&
      samePose(left.localPose, right.localPose)
    )
  }
  if (left.kind === 'site' && right.kind === 'site') {
    return (
      left.parentId === right.parentId &&
      left.siteId === right.siteId &&
      samePose(left.offsetPose, right.offsetPose)
    )
  }
  return false
}

function samePose(left: LabPose, right: LabPose): boolean {
  return (
    sameTuple(left.positionMm, right.positionMm) &&
    sameTuple(left.rotationDegXYZ, right.rotationDegXYZ)
  )
}

function sameTuple(
  left: readonly number[],
  right: readonly number[]
): boolean {
  return left.every(
    (value, index) => Math.abs(value - right[index]) < 1e-6
  )
}

function readRecord(value: unknown): Record<string, unknown> {
  return recordValue(value) ?? {}
}

function recordValue(
  value: unknown
): Record<string, unknown> | undefined {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function vectorTuple(value: unknown): Vector3Tuple | undefined {
  if (
    Array.isArray(value) &&
    value.length >= 3 &&
    value.slice(0, 3).every((item) => Number.isFinite(Number(item)))
  ) {
    return value.slice(0, 3).map(Number) as Vector3Tuple
  }
  const record = recordValue(value)
  if (!record) return undefined
  const tuple = [record.x, record.y, record.z]
  return tuple.every((item) => Number.isFinite(Number(item)))
    ? tuple.map(Number) as Vector3Tuple
    : undefined
}

function finiteNumber(value: unknown, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function optionalNumber(value: unknown): number | undefined {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function stringValue(value: unknown, fallback = ''): string {
  return value == null ? fallback : String(value)
}

function optionalString(value: unknown): string | undefined {
  return value == null || value === '' ? undefined : String(value)
}

function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value)
    ? value.map(String)
    : undefined
}

function sanitizeRosName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_]/g, '_')
}
