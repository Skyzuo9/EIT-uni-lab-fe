import type { MaterialId } from '../types'
import { shouldShowMaterialLabelByDefault } from '../labelPresentation'
import type { MaterialObliqueObject } from './projection'
import { clamp, tagAnchor } from './obliqueGeometry'

export interface ObliqueCamera {
  centerX: number
  centerY: number
  zoom: number
}

export interface ObliqueViewBox {
  minX: number
  minY: number
  width: number
  height: number
}

export interface ViewportSize {
  width: number
  height: number
}

export const MIN_CAMERA_ZOOM = 1
export const MAX_CAMERA_ZOOM = 6
export const DEFAULT_VIEWPORT: ViewportSize = { width: 1600, height: 900 }

export function fitCamera(
  bounds: MaterialObliqueSceneBounds
): ObliqueCamera {
  return {
    centerX: bounds.minX + bounds.width / 2,
    centerY: bounds.minY + bounds.height / 2,
    zoom: MIN_CAMERA_ZOOM
  }
}

export type MaterialObliqueSceneBounds = {
  minX: number
  minY: number
  width: number
  height: number
}

export function fittedViewBox(
  bounds: MaterialObliqueSceneBounds,
  viewport: ViewportSize
): ObliqueViewBox {
  const viewportRatio =
    viewport.width > 0 && viewport.height > 0
      ? viewport.width / viewport.height
      : DEFAULT_VIEWPORT.width / DEFAULT_VIEWPORT.height
  const contentRatio = bounds.width / bounds.height
  const width =
    viewportRatio >= contentRatio
      ? bounds.height * viewportRatio
      : bounds.width
  const height =
    viewportRatio >= contentRatio
      ? bounds.height
      : bounds.width / viewportRatio
  return {
    minX: bounds.minX - (width - bounds.width) / 2,
    minY: bounds.minY - (height - bounds.height) / 2,
    width,
    height
  }
}

export function cameraViewBox(
  bounds: MaterialObliqueSceneBounds,
  viewport: ViewportSize,
  camera: ObliqueCamera
): ObliqueViewBox {
  const fitted = fittedViewBox(bounds, viewport)
  const width = fitted.width / camera.zoom
  const height = fitted.height / camera.zoom
  const sceneCenterX = bounds.minX + bounds.width / 2
  const sceneCenterY = bounds.minY + bounds.height / 2
  const centerX =
    width >= bounds.width
      ? sceneCenterX
      : clamp(
          camera.centerX,
          bounds.minX + width / 2,
          bounds.minX + bounds.width - width / 2
        )
  const centerY =
    height >= bounds.height
      ? sceneCenterY
      : clamp(
          camera.centerY,
          bounds.minY + height / 2,
          bounds.minY + bounds.height - height / 2
        )
  return {
    minX: centerX - width / 2,
    minY: centerY - height / 2,
    width,
    height
  }
}

export function focusCamera(
  sceneBounds: MaterialObliqueSceneBounds,
  viewport: ViewportSize,
  object: MaterialObliqueObject
): ObliqueCamera {
  const points = [...object.base, ...object.top]
  const xs = points.map((point) => point[0])
  const ys = points.map((point) => point[1])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const objectWidth = Math.max(maxX - minX, sceneBounds.width * 0.03)
  const objectHeight = Math.max(
    maxY - minY,
    sceneBounds.height * 0.06
  )
  const fitted = fittedViewBox(sceneBounds, viewport)
  const zoom = clamp(
    Math.min(
      fitted.width / (objectWidth * 2.6),
      fitted.height / (objectHeight * 2.6)
    ),
    1.6,
    4.5
  )
  return {
    centerX: minX + (maxX - minX) / 2,
    centerY: minY + (maxY - minY) / 2,
    zoom
  }
}

export function selectLandmarkIds(
  objects: readonly MaterialObliqueObject[],
  limit: number
): ReadonlySet<MaterialId> {
  const landmarks = objects
    .filter(
      (object) =>
        shouldShowMaterialLabelByDefault(object.kind) &&
        !['host', 'plc', 'deck'].some((token) =>
          object.kind.toLowerCase().includes(token)
        )
    )
    .sort(
      (left, right) =>
        landmarkScore(right) - landmarkScore(left) ||
        left.materialId.localeCompare(right.materialId)
    )
    .slice(0, limit)
    .map((object) => object.materialId)
  return new Set(landmarks)
}

function landmarkScore(object: MaterialObliqueObject): number {
  const fidelityWeight =
    object.fidelity === 'declared'
      ? 2_000_000
      : object.fidelity === 'inferred'
        ? 1_000_000
        : 0
  return (
    fidelityWeight +
    object.widthMm * object.depthMm +
    object.heightMm * 100
  )
}

export function landmarkLabelOffsets(
  objects: readonly MaterialObliqueObject[],
  landmarkIds: ReadonlySet<MaterialId>
): ReadonlyMap<MaterialId, number> {
  const landmarks = objects
    .filter((object) => landmarkIds.has(object.materialId))
    .map((object) => ({
      id: object.materialId,
      anchorX: tagAnchor(object.top)[0]
    }))
    .sort((left, right) => left.anchorX - right.anchorX)
  const offsets = new Map<MaterialId, number>()
  let previousX = Number.NEGATIVE_INFINITY
  let lane = 0
  const sceneXs = objects.flatMap((object) =>
    object.top.map((point) => point[0])
  )
  const collisionDistance =
    sceneXs.length > 0
      ? Math.max(
          (Math.max(...sceneXs) - Math.min(...sceneXs)) / 18,
          180
        )
      : 240
  for (const landmark of landmarks) {
    lane =
      landmark.anchorX - previousX < collisionDistance
        ? (lane + 1) % 3
        : 0
    offsets.set(landmark.id, lane * -86)
    previousX = landmark.anchorX
  }
  return offsets
}

export function formatMm(value: number): string {
  return new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits: 1
  }).format(value)
}
