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
}

export type LocalRuntimeProcessKind = 'simulator' | 'bridge' | 'edge'

export interface LocalRuntimeLogEntry {
  kind: LocalRuntimeProcessKind
  content: string
  available: boolean
  truncated: boolean
}

export interface LocalRuntimeLogsSnapshot {
  readAt: number
  entries: LocalRuntimeLogEntry[]
}

export type LocalRuntimePhase =
  | 'idle'
  | 'validating_simulator'
  | 'starting_simulator'
  | 'waiting_simulator'
  | 'simulator_ready'
  | 'validating_edge'
  | 'starting_bridge'
  | 'waiting_bridge'
  | 'starting_edge'
  | 'waiting_edge'
  | 'ready'
  | 'stopping_simulator'
  | 'stopping_edge'
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
  startSimulator: (
    config: LocalRuntimeLaunchConfig
  ) => Promise<LocalRuntimeSnapshot>
  stopSimulator: () => Promise<LocalRuntimeSnapshot>
  startEdge: (config: LocalRuntimeLaunchConfig) => Promise<LocalRuntimeSnapshot>
  stopEdge: () => Promise<LocalRuntimeSnapshot>
  readLogs: () => Promise<LocalRuntimeLogsSnapshot>
  onSnapshot: (
    listener: (snapshot: LocalRuntimeSnapshot) => void
  ) => () => void
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
}

declare global {
  interface Window {
    api?: DesktopApi
  }
}

export {}
