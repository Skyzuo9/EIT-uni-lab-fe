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
  getSnapshot: () => Promise<LocalRuntimeSnapshot>
  start: (config: LocalRuntimeLaunchConfig) => Promise<LocalRuntimeSnapshot>
  stop: () => Promise<LocalRuntimeSnapshot>
  openLogs: () => Promise<boolean>
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
