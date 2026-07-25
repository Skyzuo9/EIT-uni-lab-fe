import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode
} from 'react'
import {
  DEFAULT_BACKENDS,
  getDefaultBackend,
  type BackendConfig
} from '@unilab/services'

import type {
  ConnectionStatus,
  WorkbenchSection
} from '../data/lab'

interface WorkbenchContextValue {
  backend: BackendConfig
  backendEnabled: boolean
  connection: ConnectionStatus
  section: WorkbenchSection
  availableBackends: readonly BackendConfig[]
  selectBackend: (backendId: string) => void
  updateBackend: (patch: Partial<BackendConfig>) => void
  setBackendEnabled: (enabled: boolean) => void
  setConnection: (status: ConnectionStatus) => void
  setSection: (section: WorkbenchSection) => void
}

const WorkbenchContext = createContext<WorkbenchContextValue | null>(null)

export function WorkbenchProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [backend, setBackend] = useState<BackendConfig>(() =>
    getDefaultBackend('local-python')
  )
  const [backendEnabled, setBackendEnabledState] = useState(false)
  const [connection, setConnection] =
    useState<ConnectionStatus>('disconnected')
  const [section, setSection] = useState<WorkbenchSection>('device')

  const selectBackend = useCallback((backendId: string) => {
    setBackend(getDefaultBackend(backendId))
    setConnection('disconnected')
  }, [])

  const updateBackend = useCallback((patch: Partial<BackendConfig>) => {
    setBackend((current) => ({ ...current, ...patch }))
    setConnection('disconnected')
  }, [])

  const setBackendEnabled = useCallback((enabled: boolean) => {
    setBackendEnabledState(enabled)
    if (!enabled) setConnection('disconnected')
  }, [])

  const value = useMemo<WorkbenchContextValue>(
    () => ({
      backend,
      backendEnabled,
      connection,
      section,
      availableBackends: DEFAULT_BACKENDS,
      selectBackend,
      updateBackend,
      setBackendEnabled,
      setConnection,
      setSection
    }),
    [
      backend,
      backendEnabled,
      connection,
      section,
      selectBackend,
      updateBackend,
      setBackendEnabled
    ]
  )

  return (
    <WorkbenchContext.Provider value={value}>
      {children}
    </WorkbenchContext.Provider>
  )
}

export function useWorkbench(): WorkbenchContextValue {
  const contextValue = useContext(WorkbenchContext)
  if (!contextValue) {
    throw new Error('useWorkbench must be used within WorkbenchProvider')
  }
  return contextValue
}
