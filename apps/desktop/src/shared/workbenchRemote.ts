export type WorkbenchRemoteAccessPhase =
  | 'unavailable'
  | 'idle'
  | 'starting'
  | 'ready'
  | 'stopping'
  | 'failed'

export interface WorkbenchRemoteAccessSnapshot {
  phase: WorkbenchRemoteAccessPhase
  origin: string | null
  accessUrl: string | null
  pid: number | null
  generation: string | null
  expiresAt: number | null
  error: string | null
}

export interface WorkbenchRemoteAccessController {
  getSnapshot: () => WorkbenchRemoteAccessSnapshot
    | Promise<WorkbenchRemoteAccessSnapshot>
  start: () => Promise<WorkbenchRemoteAccessSnapshot>
  stop: () => Promise<WorkbenchRemoteAccessSnapshot>
  close: () => Promise<WorkbenchRemoteAccessSnapshot>
}

export interface DesktopWorkbenchRemoteApi {
  getSnapshot: () => Promise<WorkbenchRemoteAccessSnapshot>
  start: () => Promise<WorkbenchRemoteAccessSnapshot>
  stop: () => Promise<WorkbenchRemoteAccessSnapshot>
}

export const UNAVAILABLE_WORKBENCH_REMOTE_ACCESS:
WorkbenchRemoteAccessSnapshot = Object.freeze({
  phase: 'unavailable',
  origin: null,
  accessUrl: null,
  pid: null,
  generation: null,
  expiresAt: null,
  error: null
})
