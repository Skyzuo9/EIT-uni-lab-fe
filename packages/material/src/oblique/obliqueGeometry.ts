import type { MaterialObliqueObject, ObliquePoint } from './projection'

export function applyAffinePoint(
  transform: readonly [number, number, number, number, number, number],
  x: number,
  y: number
): ObliquePoint {
  const [a, b, c, d, e, f] = transform
  return [a * x + c * y + e, b * x + d * y + f]
}

export type Affine = readonly [number, number, number, number, number, number]

/** 回转轮廓的一圈，已解算成本地 mm。 */
export interface LatheRing {
  zMm: number
  radiusMm: number
}

/**
 * Silhouette of a turned solid: front arc of the lowest ring, the right-hand
 * extreme of every ring going up, rear arc of the highest ring, then the
 * left-hand extremes coming back down.
 */
export function latheOutline(options: {
  object: MaterialObliqueObject
  rings: readonly LatheRing[]
  centerX: number
  centerY: number
  startAngle: number
  sweep: 1 | -1
}): ObliquePoint[] {
  const { object, rings, centerX, centerY, startAngle, sweep } = options
  if (rings.length === 0) return []

  const transformFor = (ring: LatheRing): Affine =>
    planeTransform(object, ring.zMm)
  const rightAngle = startAngle + sweep * Math.PI
  const middle = rings.slice(1, -1)
  const bottom = rings[0]
  const top = rings[rings.length - 1]

  return [
    ...arcPoints(
      transformFor(bottom),
      centerX,
      centerY,
      bottom.radiusMm,
      startAngle,
      rightAngle,
      30
    ),
    ...middle.map((ring) =>
      circlePoint(
        transformFor(ring),
        centerX,
        centerY,
        ring.radiusMm,
        rightAngle
      )
    ),
    ...arcPoints(
      transformFor(top),
      centerX,
      centerY,
      top.radiusMm,
      rightAngle,
      startAngle + sweep * 2 * Math.PI,
      30
    ),
    ...[...middle].reverse().map((ring) =>
      circlePoint(
        transformFor(ring),
        centerX,
        centerY,
        ring.radiusMm,
        startAngle
      )
    )
  ]
}

/** Plane transform at an arbitrary local height, derived from the top plane. */
export function planeTransform(
  object: MaterialObliqueObject,
  heightMm: number
): Affine {
  const [a, b, c, d, e, f] = object.topTransform
  return [a, b, c, d, e, f + (object.heightMm - heightMm)]
}

/** Rotational direction that walks the rim across the viewer-facing side. */
export function frontSweepSign(transform: Affine): 1 | -1 {
  const [a, b, c, d] = transform
  const leftAngle = Math.atan2(c, a) + Math.PI
  const frontAngle = Math.atan2(d, b)
  return Math.cos(leftAngle + Math.PI / 2 - frontAngle) >= 0 ? 1 : -1
}

export function circlePoint(
  transform: Affine,
  cx: number,
  cy: number,
  r: number,
  angle: number
): ObliquePoint {
  return applyAffinePoint(
    transform,
    cx + r * Math.cos(angle),
    cy + r * Math.sin(angle)
  )
}

export function arcPoints(
  transform: Affine,
  cx: number,
  cy: number,
  r: number,
  from: number,
  to: number,
  samples = 24
): ObliquePoint[] {
  const step = (to - from) / samples
  return Array.from({ length: samples + 1 }, (_, index) =>
    circlePoint(transform, cx, cy, r, from + step * index)
  )
}

export function ribAngles(
  startAngle: number,
  sweep: 1 | -1,
  count: number
): number[] {
  const safeCount = Math.max(Math.round(count), 0)
  return Array.from(
    { length: safeCount },
    (_, index) =>
      startAngle + sweep * Math.PI * ((index + 1) / (safeCount + 1))
  )
}

export function spoutOutline(
  transform: Affine,
  cx: number,
  cy: number,
  r: number,
  heightMm: number
): ObliquePoint[] {
  const [a, b, c, d] = transform
  const frontAngle = Math.atan2(d, b)
  const rightAngle = Math.atan2(c, a)
  const axis = frontAngle + (rightAngle - frontAngle) * 0.35
  const spread = 0.42
  const lift = heightMm * 0.035
  const tip = circlePoint(transform, cx, cy, r * 1.24, axis)
  return [
    circlePoint(transform, cx, cy, r, axis - spread),
    [tip[0], tip[1] - lift],
    circlePoint(transform, cx, cy, r, axis + spread)
  ]
}

export function planeAtHeight(
  base: readonly ObliquePoint[],
  heightMm: number
): ObliquePoint[] {
  return base.map(([x, y]) => [x, y - heightMm])
}

export function elevatePoint(
  point: ObliquePoint | undefined,
  heightMm: number
): ObliquePoint | undefined {
  return point ? [point[0], point[1] - heightMm] : undefined
}

export function dropPoint(
  point: ObliquePoint | undefined,
  distance: number
): ObliquePoint | undefined {
  return point ? [point[0], point[1] + distance] : undefined
}

export function insetPlane(
  plane: readonly ObliquePoint[],
  ratio: number
): ObliquePoint[] {
  if (plane.length === 0) return []
  const center: ObliquePoint = [
    plane.reduce((total, point) => total + point[0], 0) / plane.length,
    plane.reduce((total, point) => total + point[1], 0) / plane.length
  ]
  return plane.map(([x, y]) => [
    x + (center[0] - x) * ratio,
    y + (center[1] - y) * ratio
  ])
}

export function midpoint(
  left: ObliquePoint,
  right: ObliquePoint
): ObliquePoint {
  return [
    (left[0] + right[0]) / 2,
    (left[1] + right[1]) / 2
  ]
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}

/**
 * 把旋转角度规范到 [-180, 180) 区间，避免长时间交互后数值无界增长。
 * @param rotationDeg 任意角度值。
 * @returns 规范化后的角度。
 */
export function normalizeRotation(rotationDeg: number): number {
  return ((rotationDeg + 180) % 360 + 360) % 360 - 180
}

export function tagAnchor(points: readonly ObliquePoint[]): ObliquePoint {
  return [
    points.reduce((total, point) => total + point[0], 0) / points.length,
    Math.min(...points.map((point) => point[1])) - 18
  ]
}

export function pointsAttr(points: readonly (ObliquePoint | undefined)[]): string {
  return points
    .filter((point): point is ObliquePoint => point != null)
    .map((point) => point.join(','))
    .join(' ')
}

export function materialKindClass(kind: string): string {
  const normalized = kind.replaceAll('_', '-').toLowerCase()
  if (
    normalized.includes('hotel') ||
    normalized.includes('stack')
  ) {
    return 'stack'
  }
  if (normalized.includes('trash')) return 'trash'
  if (normalized.includes('deck')) return 'deck'
  if (
    normalized.includes('beaker') ||
    normalized.includes('vial') ||
    normalized.includes('bottle') ||
    normalized.includes('reagent')
  ) {
    return 'vessel'
  }
  if (
    normalized.includes('plate') ||
    normalized.includes('tip-rack') ||
    normalized.includes('tiprack')
  ) {
    return 'labware'
  }
  return 'equipment'
}
