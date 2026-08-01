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

export const IDLE_LOCAL_RUNTIME_SNAPSHOT: LocalRuntimeSnapshot = {
  phase: 'idle',
  message: '本地调试环境未启动',
  simulatorRunning: false,
  bridgeRunning: false,
  edgeRunning: false
}
