import type { LabPose, MaterialId, MaterialSite } from '../types'
import type { MaterialShapePrimitive, MaterialShapeSpec } from './shapeSpec'

export type ObliquePoint = readonly [number, number]
export type ObliqueWorldPoint = readonly [number, number, number]
/**
 * 只有两种画法：外形声明命中就按声明画（`spec`），否则退回实心包围盒
 * （`solid`）。具体长什么样由设备包的 shape manifest 决定。
 */
export type MaterialObliqueRenderStyle = 'solid' | 'spec'
export type MaterialObliqueFidelity =
  | 'declared'
  | 'envelope'
  | 'inferred'

/** 命中的外形声明与它展开出的本地 mm 图元。 */
export interface MaterialObliqueShape {
  id: string
  bundle: string
  primitives: readonly MaterialShapePrimitive[]
  shadow: MaterialShapeSpec['shadow']
}

export interface MaterialObliqueShelf {
  key: string
  heightMm: number
  occupied: boolean
  siteKey?: string
  label?: string
}

/** Slot plane of an open rack: every site sitting on the same shelf board. */
export interface MaterialObliqueLevel {
  key: string
  zMm: number
  sites: readonly MaterialSite[]
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
  fidelity: MaterialObliqueFidelity
  worldCorners: readonly ObliqueWorldPoint[]
  base: readonly ObliquePoint[]
  top: readonly ObliquePoint[]
  topTransform: readonly [number, number, number, number, number, number]
  logicalMount: boolean
  sites: readonly MaterialSite[]
  siteBounds: readonly MaterialSite[]
  shelves: readonly MaterialObliqueShelf[]
  levels: readonly MaterialObliqueLevel[]
  shape?: MaterialObliqueShape
  /** 0 = 地面，1 = 实体设备与物料，2 = 逻辑挂载点覆盖层。 */
  sortLayer: number
  sortDepth: number
}

export interface MaterialObliqueScene {
  objects: readonly MaterialObliqueObject[]
  diagnostics: {
    declaredShapeCount: number
    envelopeApproximationCount: number
    inferredStructureCount: number
    invalidObjectCount: number
  }
  bounds: {
    minX: number
    minY: number
    width: number
    height: number
  }
}
