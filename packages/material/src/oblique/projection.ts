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
  worldCorners: readonly ObliqueWorldPoint[]
  base: readonly ObliquePoint[]
  top: readonly ObliquePoint[]
  topTransform: readonly [number, number, number, number, number, number]
  sites: readonly MaterialSite[]
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
    worldCorners,
    base,
    top,
    topTransform: topPlaneTransform(pose, heightMm),
    sites: aggregate.sites.filter((site) => site.visible !== false),
    sortDepth:
      worldCorners.reduce((total, point) => total + point[1], 0) /
      worldCorners.length
  }
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
