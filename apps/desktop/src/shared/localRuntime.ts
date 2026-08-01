export type LocalRuntimePathKind = 'graph' | 'os' | 'simulator'

export interface LocalRuntimeLaunchConfig {
  graphPath: string
  osProjectPath: string
  simulatorProjectPath: string
  startSimulator: boolean
}

export type LocalRuntimePhase =
  | 'idle'
  | 'validating'
  | 'starting_simulator'
  | 'starting_edge'
  | 'waiting_edge'
  | 'ready'
  | 'stopping'
  | 'failed'

export interface LocalRuntimeSnapshot {
  phase: LocalRuntimePhase
  message: string
  simulatorRunning: boolean
  edgeRunning: boolean
  error?: string
}

export const IDLE_LOCAL_RUNTIME_SNAPSHOT: LocalRuntimeSnapshot = {
  phase: 'idle',
  message: '本地环境未启动',
  simulatorRunning: false,
  edgeRunning: false
}
