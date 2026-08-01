export const DEFAULT_OBSERVABILITY_BASE_URL =
  'http://127.0.0.1:18003/api/v1/observability'

export type ObservabilityState =
  | 'disabled'
  | 'stopped'
  | 'starting'
  | 'ready'
  | 'degraded'

export interface ObservabilityStatus {
  enabled: boolean
  state: ObservabilityState
  provider: 'phoenix'
  storage: 'sqlite'
  project_name: string
  managed_process: boolean
  last_error: string | null
}

export interface TraceListQuery {
  limit?: number
  cursor?: string
  startTime?: string
  endTime?: string
  sort?: 'start_time' | 'latency_ms'
  order?: 'asc' | 'desc'
  includeSpans?: boolean
  sessionIdentifiers?: string[]
}

export interface TraceDetailQuery {
  limit?: number
  cursor?: string
}

export type TraceRecord = Record<string, unknown>

export interface TraceListResult {
  project_name: string
  traces: TraceRecord[]
  next_cursor: string | null
}

export interface TraceDetailResult {
  project_name: string
  trace_id: string
  spans: TraceRecord[]
  next_cursor: string | null
}
