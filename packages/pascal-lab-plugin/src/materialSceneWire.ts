import type { Vector3Tuple } from './units'

export function readRecord(value: unknown): Record<string, unknown> {
  return recordValue(value) ?? {}
}

export function recordValue(
  value: unknown
): Record<string, unknown> | undefined {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

export function vectorTuple(value: unknown): Vector3Tuple | undefined {
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

export function pairTuple(value: unknown): readonly [number, number] | undefined {
  return Array.isArray(value) &&
    value.length >= 2 &&
    value.slice(0, 2).every((item) => Number.isFinite(Number(item)))
    ? [Number(value[0]), Number(value[1])]
    : undefined
}

export function finiteNumber(value: unknown, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function optionalNumber(value: unknown): number | undefined {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function stringValue(value: unknown, fallback = ''): string {
  return value == null ? fallback : String(value)
}

export function optionalString(value: unknown): string | undefined {
  return value == null || value === '' ? undefined : String(value)
}

export function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value)
    ? value.map(String)
    : undefined
}

export function sanitizeRosName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_]/g, '_')
}

