export type ManagedRuntimeInstallationPhase =
  | 'unavailable'
  | 'external'
  | 'not-installed'
  | 'installing'
  | 'ready'
  | 'failed'

export interface ManagedRuntimeInstallationSnapshot {
  phase: ManagedRuntimeInstallationPhase
  bundled: boolean
  managed: boolean
  runtimeVersion: string | null
  platform: string | null
  environmentPath: string | null
  error: string | null
}

export interface DesktopManagedRuntimeApi {
  getSnapshot: () => Promise<ManagedRuntimeInstallationSnapshot>
  install: () => Promise<ManagedRuntimeInstallationSnapshot>
  onSnapshot: (
    listener: (snapshot: ManagedRuntimeInstallationSnapshot) => void
  ) => () => void
}

export const UNAVAILABLE_MANAGED_RUNTIME: ManagedRuntimeInstallationSnapshot = {
  phase: 'unavailable',
  bundled: false,
  managed: false,
  runtimeVersion: null,
  platform: null,
  environmentPath: null,
  error: null
}

export function desktopManagedRuntimeApi(): DesktopManagedRuntimeApi | null {
  return (globalThis as typeof globalThis & {
    api?: { managedRuntime?: DesktopManagedRuntimeApi }
  }).api?.managedRuntime ?? null
}
