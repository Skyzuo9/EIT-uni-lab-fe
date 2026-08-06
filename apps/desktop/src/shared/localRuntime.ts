export type LocalRuntimePathKind =
  | 'graph'
  | 'os'
  | 'szlab'
  | 'environment'
  | 'simulator'
  | 'edgeExecutable'
  | 'edgeWorkingDirectory'

export type LocalRuntimeEdgeCommandMode = 'generated' | 'custom'

export interface LocalRuntimeEnvironmentVariable {
  name: string
  value: string
}

export interface LocalRuntimeCustomEdgeCommand {
  executable: string
  workingDirectory: string
  args: string[]
  environment: LocalRuntimeEnvironmentVariable[]
}

export interface LocalRuntimeCommandPreview {
  executable: string
  args: string[]
  cwd: string
}

export interface LocalRuntimeLaunchConfig {
  graphPath: string
  osProjectPath: string
  szlabProjectPath: string
  environmentPath: string
  simulatorProjectPath: string
  edgeCommandMode: LocalRuntimeEdgeCommandMode
  customEdgeCommand: LocalRuntimeCustomEdgeCommand
}

export type LocalRuntimeMode = 'managed' | 'development'

export interface LocalRuntimeModeInfo {
  mode: LocalRuntimeMode
  label: string
  runtimeVersion: string | null
  defaultLaunchConfig?: LocalRuntimeLaunchConfig
}

export type LocalRuntimeAcceptanceStatus =
  | 'unverified'
  | 'verified'
  | 'failed'

export interface LocalRuntimeAcceptanceResult {
  status: LocalRuntimeAcceptanceStatus
  message: string
  checkedAt: number | null
  descriptorPath: string | null
  packageName: string | null
  packageVersion: string | null
}

export interface DevicePackageTrustInfo {
  workspacePath: string
  contentHash: string
  signatureStatus: 'valid' | 'invalid' | 'unsigned'
  signerFingerprint: string | null
  trusted: boolean
  confirmationRequired: boolean
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

export interface LocalRuntimeLogCursor {
  fileId: string
  offset: number
}

export interface LocalRuntimeLogQuery {
  kind: LocalRuntimeProcessKind
  cursor: LocalRuntimeLogCursor | null
}

export interface LocalRuntimeLogBatch extends LocalRuntimeLogEntry {
  readAt: number
  cursor: LocalRuntimeLogCursor | null
  reset: boolean
}

export interface LocalRuntimeOpenLogResult {
  opened: boolean
  error?: string
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
  | 'validating_acceptance'
  | 'cleaning_acceptance'
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
  acceptance?: LocalRuntimeAcceptanceResult
  failedProcess?: LocalRuntimeProcessKind
  error?: string
}

export const IDLE_LOCAL_RUNTIME_SNAPSHOT: LocalRuntimeSnapshot = {
  phase: 'idle',
  message: 'PLC-Sim 与领域侧 Edge 均未启动',
  simulatorRunning: false,
  bridgeRunning: false,
  edgeRunning: false,
  acceptance: {
    status: 'unverified',
    message: '尚未运行设备包验收。',
    checkedAt: null,
    descriptorPath: null,
    packageName: null,
    packageVersion: null
  }
}
