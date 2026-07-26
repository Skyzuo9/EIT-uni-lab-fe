import type {
  MaterialAggregate,
  MaterialSite,
  Vector3Tuple
} from '../types'

export const MATERIAL_PHYSICAL_SCALE = 0.7

export interface Material2DVisual {
  kind: string
  footprintMm: readonly [number, number]
  physical: boolean
}

export function readMaterial2DVisual(
  aggregate: MaterialAggregate
): Material2DVisual {
  const config = recordValue(aggregate.material.config)
  const rendering = recordValue(config.rendering)
  const dimensions = tuple(rendering.dimensionsMm)
  const footprint = pair(rendering.footprintMm)
  const kind = stringValue(
    rendering.kind ?? rendering.type ?? config.type,
    'custom'
  )
    .replaceAll('_', '-')
    .toLowerCase()
  const width = positive(
    footprint?.[0] ?? dimensions?.[0],
    180
  )
  const height = positive(
    footprint?.[1] ?? dimensions?.[2],
    120
  )
  const physical =
    footprint != null ||
    dimensions != null ||
    [
      'carrier',
      'deck',
      'liquid-handler',
      'plate',
      'tip-rack',
      'tiprack',
      'trash'
    ].some((token) => kind.includes(token))

  return {
    kind,
    footprintMm: [width, height],
    physical
  }
}

export function materialNodeSize(
  aggregate: MaterialAggregate,
  physicalLayout: boolean
): { width: number; height: number } {
  const visual = readMaterial2DVisual(aggregate)
  if (!physicalLayout || !visual.physical) {
    return { width: 128, height: 66 }
  }
  return {
    width: Math.max(visual.footprintMm[0] * MATERIAL_PHYSICAL_SCALE, 28),
    height: Math.max(visual.footprintMm[1] * MATERIAL_PHYSICAL_SCALE, 28)
  }
}

export function materialSiteStyle(
  site: MaterialSite,
  footprintMm: readonly [number, number]
): {
  left: string
  top: string
  width: string
  height: string
} {
  const width = Math.max(site.sizeMm[0], 0.5)
  const height = Math.max(site.sizeMm[1], 0.5)
  const left = site.poseInAnchor.positionMm[0]
  const top =
    footprintMm[1] -
    site.poseInAnchor.positionMm[1] -
    height

  return {
    left: percent(left, footprintMm[0]),
    top: percent(top, footprintMm[1]),
    width: percent(width, footprintMm[0]),
    height: percent(height, footprintMm[1])
  }
}

function percent(value: number, total: number): string {
  return `${(value / Math.max(total, 1)) * 100}%`
}

function pair(value: unknown): readonly [number, number] | undefined {
  return Array.isArray(value) &&
    value.length >= 2 &&
    value.slice(0, 2).every((item) => Number.isFinite(Number(item)))
    ? [Number(value[0]), Number(value[1])]
    : undefined
}

function tuple(value: unknown): Vector3Tuple | undefined {
  return Array.isArray(value) &&
    value.length >= 3 &&
    value.slice(0, 3).every((item) => Number.isFinite(Number(item)))
    ? [
        Number(value[0]),
        Number(value[1]),
        Number(value[2])
      ]
    : undefined
}

function recordValue(value: unknown): Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function stringValue(value: unknown, fallback: string): string {
  return value == null || value === '' ? fallback : String(value)
}

function positive(value: unknown, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}
