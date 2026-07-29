import type {
  LabPose,
  MaterialAggregate,
  MaterialId
} from '../../types'
import { resolveMaterialWorldPose } from '../../react-flow/projection'
import { readMaterial2DVisual } from '../../react-flow/visual'
import type {
  LabMapBounds,
  LabMapDocument,
  LabMapMaterialObject,
  LabMapPoint,
  LabMapPolygon,
  LabMapScene
} from './types'

const MISSING_GEOMETRY_MARKER_MM = 180

export function buildLabMapScene(
  map: LabMapDocument,
  aggregates: readonly MaterialAggregate[]
): LabMapScene {
  const aggregatesById = Object.fromEntries(
    aggregates.map((aggregate) => [
      aggregate.material.id,
      aggregate
    ])
  )
  const objects = aggregates
    .filter((aggregate) =>
      isSpatiallyPlaced(
        aggregate.material.id,
        aggregatesById
      )
    )
    .map((aggregate) =>
      materialToMapObject(map, aggregate, aggregatesById)
    )
    .sort(
      (left, right) =>
        right.sortY - left.sortY ||
        left.materialId.localeCompare(right.materialId)
    )

  const points = [
    ...map.boundary,
    ...map.zones.flatMap((zone) => zone.polygon),
    ...map.obstacles.flatMap((obstacle) => obstacle.polygon),
    ...objects.flatMap((object) => object.footprint)
  ].map(worldToMapPoint)

  return {
    map,
    objects,
    bounds: fitBounds(points)
  }
}

export function worldToMapPoint(
  point: LabMapPoint
): LabMapPoint {
  return [point[0], -point[1]]
}

export function polygonPoints(
  polygon: LabMapPolygon
): string {
  return polygon
    .map(worldToMapPoint)
    .map(([x, y]) => `${x},${y}`)
    .join(' ')
}

function materialToMapObject(
  map: LabMapDocument,
  aggregate: MaterialAggregate,
  aggregatesById: Readonly<
    Record<MaterialId, MaterialAggregate>
  >
): LabMapMaterialObject {
  const sourcePose = resolveMaterialWorldPose(
    aggregate.material.id,
    aggregatesById
  )
  const pose = placePoseInMaterialFrame(
    sourcePose,
    map.materialFrame.originMm,
    map.materialFrame.rotationDeg
  )
  const visual = readMaterial2DVisual(aggregate)
  const footprintMm = visual.physical
    ? visual.footprintMm
    : [
        MISSING_GEOMETRY_MARKER_MM,
        MISSING_GEOMETRY_MARKER_MM
      ] as const
  const yaw = pose.rotationDegXYZ[2] * Math.PI / 180
  const cosine = Math.cos(yaw)
  const sine = Math.sin(yaw)
  const [width, depth] = footprintMm
  const [originX, originY] = pose.positionMm
  const footprint = [
    [0, 0],
    [width, 0],
    [width, depth],
    [0, depth]
  ].map(
    ([x, y]): LabMapPoint => [
      originX + x * cosine - y * sine,
      originY + x * sine + y * cosine
    ]
  )

  return {
    materialId: aggregate.material.id,
    code: aggregate.material.code,
    name: aggregate.material.name,
    kind: visual.kind,
    sourcePose,
    pose,
    footprintMm,
    heightMm: visual.heightMm,
    geometryStatus: visual.physical
      ? 'authoritative'
      : 'missing',
    footprint,
    sortY:
      footprint.reduce((total, point) => total + point[1], 0) /
      footprint.length
  }
}

function placePoseInMaterialFrame(
  pose: LabPose,
  originMm: LabMapPoint,
  rotationDeg: number
): LabPose {
  const rotation = rotationDeg * Math.PI / 180
  const cosine = Math.cos(rotation)
  const sine = Math.sin(rotation)
  const [x, y, z] = pose.positionMm
  return {
    positionMm: [
      originMm[0] + x * cosine - y * sine,
      originMm[1] + x * sine + y * cosine,
      z
    ],
    rotationDegXYZ: [
      pose.rotationDegXYZ[0],
      pose.rotationDegXYZ[1],
      pose.rotationDegXYZ[2] + rotationDeg
    ]
  }
}

function isSpatiallyPlaced(
  materialId: MaterialId,
  aggregatesById: Readonly<
    Record<MaterialId, MaterialAggregate>
  >,
  visiting: ReadonlySet<MaterialId> = new Set()
): boolean {
  if (visiting.has(materialId)) return false
  const aggregate = aggregatesById[materialId]
  if (!aggregate) return false
  if (aggregate.placement.kind === 'unplaced') return false
  if (aggregate.placement.kind === 'world') return true
  const next = new Set(visiting)
  next.add(materialId)
  return isSpatiallyPlaced(
    aggregate.placement.parentId,
    aggregatesById,
    next
  )
}

function fitBounds(
  points: readonly LabMapPoint[]
): LabMapBounds {
  if (points.length === 0) {
    return {
      minX: -1000,
      minY: -1000,
      width: 2000,
      height: 2000
    }
  }
  const xs = points.map(([x]) => x)
  const ys = points.map(([, y]) => y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const contentWidth = Math.max(maxX - minX, 1000)
  const contentHeight = Math.max(maxY - minY, 1000)
  const padding = Math.max(
    Math.max(contentWidth, contentHeight) * 0.08,
    400
  )
  return {
    minX: minX - padding,
    minY: minY - padding,
    width: contentWidth + padding * 2,
    height: contentHeight + padding * 2
  }
}
