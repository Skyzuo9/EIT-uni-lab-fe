export type WorkbenchRemoteAccessPhase =
  | 'unavailable'
  | 'idle'
  | 'starting'
  | 'ready'
  | 'stopping'
  | 'failed'

type MaybeText = string | null
type MaybeNumber = number | null

export interface WorkbenchRemoteAccessSnapshot {
  phase: WorkbenchRemoteAccessPhase
  origin: MaybeText
  accessUrl: MaybeText
  pid: MaybeNumber
  generation: MaybeText
  expiresAt: MaybeNumber
  error: MaybeText
}

type DesktopWorkbenchRemoteOperation =
  () => Promise<WorkbenchRemoteAccessSnapshot>

export interface DesktopWorkbenchRemoteApi {
  getSnapshot: DesktopWorkbenchRemoteOperation
  start: DesktopWorkbenchRemoteOperation
  stop: DesktopWorkbenchRemoteOperation
}

/** Returns the privileged local Electron bridge; remote browsers receive none. */
export function desktopWorkbenchRemoteApi(): DesktopWorkbenchRemoteApi | null {
  if (typeof window === 'undefined') return null
  const candidate = (window as unknown as {
    api?: { workbenchRemote?: DesktopWorkbenchRemoteApi }
  }).api?.workbenchRemote
  return candidate ?? null
}
