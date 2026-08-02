export interface WorkflowTraceListQuery {
  limit?: number
  cursor?: string
  startTime?: string
  endTime?: string
  sort?: 'start_time' | 'latency_ms'
  order?: 'asc' | 'desc'
  includeSpans?: boolean
  sessionIdentifiers?: string[]
}

export interface WorkflowTraceDetailQuery {
  limit?: number
  cursor?: string
}

export type WorkflowTraceRecord = Record<string, unknown>

export interface WorkflowTraceListResult {
  project_name: string
  traces: WorkflowTraceRecord[]
  next_cursor: string | null
}

export interface WorkflowTraceDetailResult {
  project_name: string
  trace_id: string
  spans: WorkflowTraceRecord[]
  next_cursor: string | null
}

/**
 * Electron injects this port from its preload observability API. The workflow
 * feature stays independent of Electron and does not request Uni-Lab-OS
 * directly.
 */
export interface WorkflowTracePort {
  listTraces: (
    query?: WorkflowTraceListQuery
  ) => Promise<WorkflowTraceListResult>
  getTrace: (
    traceId: string,
    query?: WorkflowTraceDetailQuery
  ) => Promise<WorkflowTraceDetailResult>
}
