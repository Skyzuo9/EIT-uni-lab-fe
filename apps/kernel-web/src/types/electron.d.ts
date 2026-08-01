import type { AuthSession } from './auth'

interface OpenedFile {
  path: string
  content: string
}

interface SavedFile {
  path: string
}

interface SaveFilePayload {
  path: string | null
  content: string
  defaultName?: string
}

interface OpenFilePayload {
  accept?: 'json' | 'python'
}

export type LocalRuntimePathKind =
  | 'graph'
  | 'os'
  | 'szlab'
  | 'environment'
  | 'simulator'

export interface LocalRuntimeLaunchConfig {
  graphPath: string
  osProjectPath: string
  szlabProjectPath: string
  environmentPath: string
  simulatorProjectPath: string
  startSimulator: boolean
}

export type LocalRuntimeProcessKind = 'simulator' | 'bridge' | 'edge'

export type LocalRuntimePhase =
  | 'idle'
  | 'validating'
  | 'starting_simulator'
  | 'waiting_simulator'
  | 'starting_bridge'
  | 'waiting_bridge'
  | 'starting_edge'
  | 'waiting_edge'
  | 'ready'
  | 'stopping'
  | 'failed'

export interface LocalRuntimeSnapshot {
  phase: LocalRuntimePhase
  message: string
  simulatorRunning: boolean
  bridgeRunning: boolean
  edgeRunning: boolean
  failedProcess?: LocalRuntimeProcessKind
  error?: string
}

export interface DesktopRuntimeApi {
  selectPath: (kind: LocalRuntimePathKind) => Promise<string | null>
  getDefaultEnvironmentPath: () => Promise<string | null>
  getSnapshot: () => Promise<LocalRuntimeSnapshot>
  start: (config: LocalRuntimeLaunchConfig) => Promise<LocalRuntimeSnapshot>
  stop: () => Promise<LocalRuntimeSnapshot>
  openLogs: () => Promise<boolean>
  onSnapshot: (
    listener: (snapshot: LocalRuntimeSnapshot) => void
  ) => () => void
}

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

export interface TraceListResult {
  project_name: string
  traces: Record<string, unknown>[]
  next_cursor: string | null
}

export interface TraceDetailResult {
  project_name: string
  trace_id: string
  spans: Record<string, unknown>[]
  next_cursor: string | null
}

export interface DesktopObservabilityApi {
  getStatus: () => Promise<ObservabilityStatus>
  listTraces: (query?: TraceListQuery) => Promise<TraceListResult>
  getTrace: (
    traceId: string,
    query?: TraceDetailQuery
  ) => Promise<TraceDetailResult>
}

interface DesktopApi {
  getVersion: () => Promise<string>
  auth: {
    getSession: () => Promise<AuthSession | null>
    login: () => Promise<AuthSession | null>
    logout: () => Promise<boolean>
  }
  file?: {
    open: (payload?: OpenFilePayload) => Promise<OpenedFile | null>
    save: (payload: SaveFilePayload) => Promise<SavedFile | null>
  }
  runtime?: DesktopRuntimeApi
  observability?: DesktopObservabilityApi
}

declare global {
  interface Window {
    api?: DesktopApi
  }
}

export {}
