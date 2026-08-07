import type {
  WorkflowTracePort,
  WorkflowTraceRecord
} from '../traceRuntime'

export interface WorkflowTraceSummary {
  traceId: string
  name: string
  startedAt: unknown
  latencyMs: number | null
  spanCount: number | null
  status: string
  matchesCurrentRun: boolean
  raw: WorkflowTraceRecord
}

export interface WorkflowSpanSummary {
  spanId: string
  parentId: string | null
  name: string
  startedAt: unknown
  latencyMs: number | null
  status: string
  depth: number
  attributes: ReadonlyArray<readonly [string, string]>
  raw: WorkflowTraceRecord
}
export function workflowTraceSummary(
  trace: WorkflowTraceRecord,
  currentRunId: string | null,
  serverMatchedTraceIds: ReadonlySet<string> = new Set()
): WorkflowTraceSummary | null {
  const traceId = firstString(
    trace.trace_id,
    trace.traceId,
    recordValue(trace.context, 'trace_id')
  )
  if (!traceId) return null
  const embeddedSpans = Array.isArray(trace.spans) ? trace.spans : null
  const firstSpan = embeddedSpans?.find(isRecord)
  const latencyMs = firstNumber(trace.latency_ms, trace.latencyMs) ??
    durationBetween(trace.start_time, trace.end_time)
  return {
    traceId,
    name: firstString(
      trace.root_span_name,
      trace.name,
      recordValue(trace.root_span, 'name'),
      firstSpan?.name
    ) || '未命名 Trace',
    startedAt: trace.start_time ?? trace.startTime ?? firstSpan?.start_time,
    latencyMs,
    spanCount: firstNumber(trace.span_count, trace.spanCount) ??
      embeddedSpans?.length ?? null,
    status: firstString(
      trace.status_code,
      trace.status,
      recordValue(trace.root_span, 'status_code')
    ) || 'UNSET',
    matchesCurrentRun: Boolean(
      currentRunId && (
        serverMatchedTraceIds.has(traceId) ||
        containsIdentifier(trace, currentRunId)
      )
    ),
    raw: trace
  }
}

export async function listWorkflowRunTraces(
  runtime: WorkflowTracePort,
  runId: string,
  maxPages = 10
): Promise<WorkflowTraceRecord[]> {
  const traces: WorkflowTraceRecord[] = []
  let cursor: string | undefined
  for (let page = 0; page < maxPages; page += 1) {
    const result = await runtime.listTraces({
      limit: 1000,
      ...(cursor ? { cursor } : {}),
      sort: 'start_time',
      order: 'desc',
      includeSpans: true,
      sessionIdentifiers: [runId]
    })
    traces.push(...result.traces)
    if (!result.next_cursor) break
    cursor = result.next_cursor
  }
  return traces
}

export function workflowSpanSummaries(
  spans: readonly WorkflowTraceRecord[]
): WorkflowSpanSummary[] {
  const base = spans.map((span, index) => {
    const context = isRecord(span.context) ? span.context : {}
    const spanId = firstString(
      context.span_id,
      span.span_id,
      span.spanId
    ) || `span-${index + 1}`
    return {
      spanId,
      parentId: firstString(
        span.parent_id,
        span.parent_span_id,
        span.parentId
      ) || null,
      name: firstString(span.name, span.span_name) || '未命名 Span',
      startedAt: span.start_time ?? span.startTime,
      latencyMs: firstNumber(span.latency_ms, span.latencyMs) ??
        durationBetween(span.start_time, span.end_time),
      status: firstString(
        span.status_code,
        span.status,
        recordValue(span.status, 'status_code'),
        recordValue(span.status, 'code')
      ) || 'UNSET',
      depth: 0,
      attributes: traceAttributes(span),
      raw: span
    }
  })
  const byId = new Map(base.map((span) => [span.spanId, span]))
  const children = new Map<string, Array<(typeof base)[number]>>()
  const roots: Array<(typeof base)[number]> = []
  for (const span of base) {
    if (
      !span.parentId ||
      span.parentId === span.spanId ||
      !byId.has(span.parentId)
    ) {
      roots.push(span)
      continue
    }
    const siblings = children.get(span.parentId) ?? []
    siblings.push(span)
    children.set(span.parentId, siblings)
  }
  const byStartTime = (
    left: (typeof base)[number],
    right: (typeof base)[number]
  ): number => timestampValue(left.startedAt) - timestampValue(right.startedAt)
  roots.sort(byStartTime)
  children.forEach((siblings) => siblings.sort(byStartTime))

  const ordered: WorkflowSpanSummary[] = []
  const visited = new Set<string>()
  const append = (span: (typeof base)[number], depth: number): void => {
    if (visited.has(span.spanId)) return
    visited.add(span.spanId)
    ordered.push({ ...span, depth: Math.min(6, depth) })
    for (const child of children.get(span.spanId) ?? []) {
      append(child, depth + 1)
    }
  }
  roots.forEach((span) => append(span, 0))
  base.sort(byStartTime).forEach((span) => append(span, 0))
  return ordered
}

export function traceMatchesWorkflowRun(
  trace: WorkflowTraceRecord,
  runId: string
): boolean {
  return containsIdentifier(trace, runId)
}

export function traceAttributes(
  span: WorkflowTraceRecord
): ReadonlyArray<readonly [string, string]> {
  const attributes = isRecord(span.attributes)
    ? span.attributes
    : isRecord(span.span_attributes)
      ? span.span_attributes
      : {}
  return Object.entries(attributes)
    .map(([key, value]) => [key, displayValue(value)] as const)
    .sort(([left], [right]) => left.localeCompare(right))
}

export function mergeTraceRecords(
  ...collections: readonly WorkflowTraceRecord[][]
): WorkflowTraceRecord[] {
  const merged = new Map<string, WorkflowTraceRecord>()
  let anonymousIndex = 0
  for (const collection of collections) {
    for (const trace of collection) {
      const traceId = traceIdFor(trace)
      merged.set(traceId || `anonymous-${anonymousIndex++}`, trace)
    }
  }
  return [...merged.values()]
}

export function traceIdFor(trace: WorkflowTraceRecord): string {
  return firstString(
    trace.trace_id,
    trace.traceId,
    recordValue(trace.context, 'trace_id')
  )
}

export function containsIdentifier(value: unknown, target: string): boolean {
  const seen = new Set<object>()
  const normalizedTarget = normalizeIdentifier(target)
  const visit = (candidate: unknown, depth: number): boolean => {
    if (depth > 8) return false
    if (typeof candidate === 'string') {
      return normalizeIdentifier(candidate) === normalizedTarget
    }
    if (!candidate || typeof candidate !== 'object') return false
    if (seen.has(candidate)) return false
    seen.add(candidate)
    if (Array.isArray(candidate)) {
      return candidate.some((item) => visit(item, depth + 1))
    }
    return Object.values(candidate).some((item) => visit(item, depth + 1))
  }
  return visit(value, 0)
}

export function normalizeIdentifier(value: string): string {
  const compact = value.trim().toLowerCase().replaceAll('-', '')
  return /^[a-f0-9]{32}$/.test(compact) ? compact : value.trim()
}

export function displayValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export function durationBetween(start: unknown, end: unknown): number | null {
  const startValue = timestampValue(start)
  const endValue = timestampValue(end)
  if (!startValue || !endValue || endValue < startValue) return null
  return endValue - startValue
}

export function timestampValue(value: unknown): number {
  if (typeof value === 'number') {
    return value < 10_000_000_000 ? value * 1000 : value
  }
  if (typeof value !== 'string') return 0
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function formatTimestamp(value: unknown, includeDate = false): string {
  const timestamp = timestampValue(value)
  if (!timestamp) return '时间未知'
  return new Intl.DateTimeFormat('zh-CN', {
    ...(includeDate
      ? { year: 'numeric', month: '2-digit', day: '2-digit' }
      : {}),
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    hour12: false
  }).format(timestamp)
}

export function formatDuration(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '耗时未知'
  if (value < 1) return `${Math.round(value * 1000)} μs`
  if (value < 1000) return `${value.toFixed(value < 10 ? 2 : 1)} ms`
  return `${(value / 1000).toFixed(value < 10_000 ? 2 : 1)} s`
}

export function statusTone(status: string): 'success' | 'error' | 'neutral' {
  const normalized = status.toUpperCase()
  if (normalized.includes('ERROR') || normalized.includes('FAIL')) {
    return 'error'
  }
  if (normalized === 'OK' || normalized.includes('SUCCESS')) {
    return 'success'
  }
  return 'neutral'
}

export function statusLabel(status: string): string {
  const tone = statusTone(status)
  if (tone === 'success') return '正常'
  if (tone === 'error') return '异常'
  return '未标记'
}

export function shortId(value: string): string {
  return value.length > 12
    ? `${value.slice(0, 8)}…${value.slice(-4)}`
    : value
}

export function firstString(...values: unknown[]): string {
  return values.find(
    (value): value is string => typeof value === 'string' && value.length > 0
  ) ?? ''
}

export function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return null
}

export function recordValue(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined
}

export function isRecord(value: unknown): value is WorkflowTraceRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
