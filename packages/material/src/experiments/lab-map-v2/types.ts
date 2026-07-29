import type {
  LabPose,
  MaterialId
} from '../../types'

export type LabMapPoint = readonly [number, number]
export type LabMapPolygon = readonly LabMapPoint[]

export interface LabMapCoordinateSystem {
  unit: 'mm'
  axes: 'x-right-y-up-z-up'
  originMm: LabMapPoint
}

/**
 * Places the OS Material Graph world frame inside the laboratory map. The
 * relative poses remain OS-owned; this manually calibrated transform only
 * describes where that workcell frame sits in the spatial map.
 */
export interface LabMapMaterialFrame {
  originMm: LabMapPoint
  rotationDeg: number
}

export interface LabMapWall {
  id: string
  startMm: LabMapPoint
  endMm: LabMapPoint
  thicknessMm: number
}

export interface LabMapOpening {
  id: string
  kind: 'door' | 'window' | 'passage'
  startMm: LabMapPoint
  endMm: LabMapPoint
}

export interface LabMapObstacle {
  id: string
  name: string
  polygon: LabMapPolygon
}

export interface LabMapZone {
  id: string
  name: string
  kind:
    | 'automation'
    | 'manual'
    | 'storage'
    | 'service'
    | 'restricted'
  polygon: LabMapPolygon
  color: string
}

export interface LabMapUtility {
  id: string
  name: string
  kind: 'power' | 'network' | 'gas' | 'water' | 'drain'
  positionMm: LabMapPoint
}

export interface LabMapDocument {
  schemaVersion: 1
  id: string
  name: string
  revision: number
  coordinateSystem: LabMapCoordinateSystem
  materialFrame: LabMapMaterialFrame
  boundary: LabMapPolygon
  walls: readonly LabMapWall[]
  openings: readonly LabMapOpening[]
  obstacles: readonly LabMapObstacle[]
  zones: readonly LabMapZone[]
  utilities: readonly LabMapUtility[]
  source:
    | { kind: 'manual' }
    | { kind: 'floorplan'; fileName: string }
    | {
        kind: 'scan'
        provider: string
        capturedAt: string
      }
}

export interface LabMapBounds {
  minX: number
  minY: number
  width: number
  height: number
}

export interface LabMapMaterialObject {
  materialId: MaterialId
  code: string
  name: string
  kind: string
  sourcePose: LabPose
  pose: LabPose
  footprintMm: readonly [number, number]
  heightMm: number
  geometryStatus: 'authoritative' | 'missing'
  footprint: LabMapPolygon
  sortY: number
}

export interface LabMapScene {
  bounds: LabMapBounds
  map: LabMapDocument
  objects: readonly LabMapMaterialObject[]
}
