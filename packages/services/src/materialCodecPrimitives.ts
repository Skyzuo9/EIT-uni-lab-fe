import type { LabPose, MaterialSite } from '@unilab/material'

import { ServiceError } from './errors'

export function siteKind(value: unknown): MaterialSite['kind'] {
  return value === 'site' ||
    value === 'deck-slot' ||
    value === 'well' ||
    value === 'tip-spot'
    ? value
    : undefined
}

export function siteVisualState(
  value: unknown
): NonNullable<MaterialSite['visual']>['state'] {
  return value === 'occupied' ||
    value === 'filled' ||
    value === 'tip-present'
    ? value
    : 'empty'
}

export function parsePose(value: unknown, field: string): LabPose {
  const raw = recordValue(value)
  return {
    positionMm: parseTuple(raw.positionMm, `${field}.positionMm`),
    rotationDegXYZ: parseTuple(
      raw.rotationDegXYZ,
      `${field}.rotationDegXYZ`
    )
  }
}

export function parseTuple(
  value: unknown,
  field: string
): readonly [number, number, number] {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    value.some((entry) => !Number.isFinite(Number(entry)))
  ) {
    throw invalidGraph(`${field} must contain three finite numbers`)
  }
  return [Number(value[0]), Number(value[1]), Number(value[2])]
}

export function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((entry) => String(entry))
    : []
}

export function requiredString(value: unknown, field: string): string {
  const result = optionalString(value)?.trim()
  if (!result) throw invalidGraph(`${field} is required`)
  return result
}

export function recordValue(value: unknown): Record<string, unknown> {
  if (isRecord(value)) return value
  throw invalidGraph('Material graph field must be an object')
}

export function invalidGraph(message: string): ServiceError {
  return new ServiceError({
    code: 'INVALID_MATERIAL_GRAPH_RESPONSE',
    message,
    retryable: false
  })
}

export function stringValue(value: unknown): string {
  return value == null ? '' : String(value)
}

export function optionalString(value: unknown): string | undefined {
  return value == null ? undefined : String(value)
}

export function finiteNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function createIdempotencyKey(): string {
  return globalThis.crypto?.randomUUID?.() ??
    `material-create-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

