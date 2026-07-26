import type {
  LabPose,
  MaterialAggregate,
  MaterialId,
  MaterialSite
} from '../types'
import { resolveMaterialWorldPose } from '../react-flow/projection'
import { readMaterial2DVisual } from '../react-flow/visual'

export const OBLIQUE_ANGLE_DEG = 45
export const OBLIQUE_DEPTH_SCALE = 0.5

const ANGLE_RAD = (OBLIQUE_ANGLE_DEG * Math.PI) / 180
const DEPTH_X = Math.cos(ANGLE_RAD) * OBLIQUE_DEPTH_SCALE
const DEPTH_Y = Math.sin(ANGLE_RAD) * OBLIQUE_DEPTH_SCALE

export type ObliquePoint = readonly [number, number]
export type ObliqueWorldPoint = readonly [number, number, number]
export type MaterialObliqueRenderStyle =
  | 'solid'
  | 'labware'
  | 'stack'

export interface MaterialObliqueShelf {
  key: string
  heightMm: number
  occupied: boolean
  siteKey?: string
  label?: string
}

export interface MaterialObliqueObject {
  materialId: MaterialId
  code: string
  name: string
  kind: string
  physical: boolean
  pose: LabPose
  widthMm: number
  depthMm: number
  heightMm: number
  renderStyle: MaterialObliqueRenderStyle
  worldCorners: readonly ObliqueWorldPoint[]
  base: readonly ObliquePoint[]
  top: readonly ObliquePoint[]
  topTransform: readonly [number, number, number, number, number, number]
  sites: readonly MaterialSite[]
  shelves: readonly MaterialObliqueShelf[]
  sortDepth: number
}

export interface MaterialObliqueScene {
  objects: readonly MaterialObliqueObject[]
  bounds: {
    minX: number
    minY: number
    width: number
    height: number
  }
}

/**
 * Cabinet oblique projection: X/Z front faces retain true scale while the
 * receding floor-plane Y axis runs at 45° with half depth.
 */
export function projectObliquePoint(
  point: ObliqueWorldPoint
): ObliquePoint {
  return [
    point[0] + point[1] * DEPTH_X,
    -point[2] - point[1] * DEPTH_Y
  ]
}

export function buildMaterialObliqueScene(
  aggregates: readonly MaterialAggregate[]
): MaterialObliqueScene {
  const aggregatesById = Object.fromEntries(
    aggregates.map((aggregate) => [aggregate.material.id, aggregate])
  )
  const objects = aggregates
    .map((aggregate) =>
      materialToObliqueObject(aggregate, aggregatesById)
    )
    .sort(
      (left, right) =>
        right.sortDepth - left.sortDepth ||
        left.pose.positionMm[2] - right.pose.positionMm[2] ||
        left.materialId.localeCompare(right.materialId)
    )
  const points = objects.flatMap((object) => [
    ...object.base,
    ...object.top
  ])
  if (points.length === 0) {
    return {
      objects,
      bounds: { minX: -500, minY: -350, width: 1000, height: 700 }
    }
  }

  const xs = points.map((point) => point[0])
  const ys = points.map((point) => point[1])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const contentWidth = Math.max(maxX - minX, 120)
  const contentHeight = Math.max(maxY - minY, 120)
  const padding = Math.max(Math.max(contentWidth, contentHeight) * 0.12, 55)

  return {
    objects,
    bounds: {
      minX: minX - padding,
      minY: minY - padding,
      width: contentWidth + padding * 2,
      height: contentHeight + padding * 2
    }
  }
}

function materialToObliqueObject(
  aggregate: MaterialAggregate,
  aggregatesById: Readonly<Record<MaterialId, MaterialAggregate>>
): MaterialObliqueObject {
  const visual = readMaterial2DVisual(aggregate)
  const pose = resolveMaterialWorldPose(
    aggregate.material.id,
    aggregatesById
  )
  const [widthMm, depthMm] = visual.footprintMm
  const heightMm = visual.heightMm
  const renderStyle = obliqueRenderStyle(visual.kind)
  const yawRad = (pose.rotationDegXYZ[2] * Math.PI) / 180
  const cosine = Math.cos(yawRad)
  const sine = Math.sin(yawRad)
  const origin = pose.positionMm
  const localCorners = [
    [0, 0],
    [widthMm, 0],
    [widthMm, depthMm],
    [0, depthMm]
  ] as const
  const worldCorners = localCorners.map(
    ([x, y]): ObliqueWorldPoint => [
      origin[0] + x * cosine - y * sine,
      origin[1] + x * sine + y * cosine,
      origin[2]
    ]
  )
  const base = worldCorners.map(projectObliquePoint)
  const top = worldCorners.map(
    ([x, y, z]) => projectObliquePoint([x, y, z + heightMm])
  )

  return {
    materialId: aggregate.material.id,
    code: aggregate.material.code,
    name: aggregate.material.name,
    kind: visual.kind,
    physical: visual.physical,
    pose,
    widthMm,
    depthMm,
    heightMm,
    renderStyle,
    worldCorners,
    base,
    top,
    topTransform: topPlaneTransform(pose, heightMm),
    sites: aggregate.sites.filter((site) => site.visible !== false),
    shelves: buildStackShelves(aggregate, heightMm, renderStyle),
    sortDepth:
      worldCorners.reduce((total, point) => total + point[1], 0) /
      worldCorners.length
  }
}

function obliqueRenderStyle(
  kind: string
): MaterialObliqueRenderStyle {
  const normalized = normalizeKind(kind)
  if (
    normalized.includes('hotel') ||
    normalized.includes('stacker') ||
    normalized.includes('plate-stack') ||
    normalized.includes('labware-stack') ||
    normalized.includes('storage-tower')
  ) {
    return 'stack'
  }
  if (
    normalized.includes('plate') ||
    normalized.includes('tip-rack') ||
    normalized.includes('tiprack') ||
    normalized.includes('labware')
  ) {
    return 'labware'
  }
  return 'solid'
}

function buildStackShelves(
  aggregate: MaterialAggregate,
  heightMm: number,
  renderStyle: MaterialObliqueRenderStyle
): MaterialObliqueShelf[] {
  if (renderStyle !== 'stack') return []

  const siteShelves = aggregate.sites
    .filter(
      (site) =>
        site.visible !== false &&
        site.kind !== 'well' &&
        site.kind !== 'tip-spot'
    )
    .map((site) => ({
      key: site.id,
      heightMm: clamp(
        site.poseInAnchor.positionMm[2],
        heightMm * 0.06,
        heightMm * 0.94
      ),
      occupied:
        site.occupiedMaterialIds.length > 0 ||
        site.visual?.state === 'occupied' ||
        site.visual?.state === 'filled' ||
        site.visual?.state === 'tip-present',
      siteKey: site.key,
      label: site.key || site.name
    }))
    .sort((left, right) => left.heightMm - right.heightMm)
  if (siteShelves.length > 0) return siteShelves

  // Some edge models currently expose only the stack's physical envelope.
  // In that case shelves are an unoccupied visual scale inferred from height;
  // no material occupancy is invented.
  const count = Math.round(clamp(heightMm / 65, 4, 12))
  const lower = heightMm * 0.1
  const upper = heightMm * 0.9
  const step = count > 1 ? (upper - lower) / (count - 1) : 0
  return Array.from({ length: count }, (_, index) => ({
    key: `inferred-shelf-${index + 1}`,
    heightMm: lower + step * index,
    occupied: false
  }))
}

function normalizeKind(kind: string): string {
  return kind.replaceAll('_', '-').toLowerCase()
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}

function topPlaneTransform(
  pose: LabPose,
  heightMm: number
): readonly [number, number, number, number, number, number] {
  const yawRad = (pose.rotationDegXYZ[2] * Math.PI) / 180
  const cosine = Math.cos(yawRad)
  const sine = Math.sin(yawRad)
  const [x, y, z] = pose.positionMm

  return [
    cosine + sine * DEPTH_X,
    -sine * DEPTH_Y,
    -sine + cosine * DEPTH_X,
    -cosine * DEPTH_Y,
    x + y * DEPTH_X,
    -(z + heightMm) - y * DEPTH_Y
  ]
}
