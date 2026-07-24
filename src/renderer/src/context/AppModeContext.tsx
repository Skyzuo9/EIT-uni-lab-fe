/**
 * ============================================================
 * AI-GENERATED CODE METADATA
 * ============================================================
 * Model: Claude Opus 4.8
 * Generation Date: 2026-07-22
 * Prompt Summary: 全局模式与连接状态 Context(离线/在线 + 后端地址 + 当前方向)
 * Context: 调试客户端统一外壳共享状态,不引入 Redux
 * Human Review Status: [ ] Pending  [ ] Reviewed  [ ] Approved
 * ============================================================
 */
import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { AppMode, ConnectionStatus, WorkbenchSection } from '../data/lab'

// 默认后端地址(本地运行的 Uni-Lab-OS FastAPI)
const DEFAULT_BASE_URL = 'http://localhost:8002'

interface AppModeState {
  mode: AppMode
  baseUrl: string
  connection: ConnectionStatus
  section: WorkbenchSection
}

interface AppModeContextValue extends AppModeState {
  setMode: (mode: AppMode) => void
  setBaseUrl: (url: string) => void
  setConnection: (status: ConnectionStatus) => void
  setSection: (section: WorkbenchSection) => void
}

const AppModeContext = createContext<AppModeContextValue | null>(null)

interface AppModeProviderProps {
  children: ReactNode
}

// 提供全局模式/连接/当前方向状态
export function AppModeProvider({ children }: AppModeProviderProps): JSX.Element {
  const [mode, setMode] = useState<AppMode>('offline')
  const [baseUrl, setBaseUrl] = useState<string>(DEFAULT_BASE_URL)
  const [connection, setConnection] = useState<ConnectionStatus>('disconnected')
  const [section, setSection] = useState<WorkbenchSection>('device')

  // 切换到离线时,顺带重置连接状态
  const handleSetMode = useCallback((next: AppMode) => {
    setMode(next)
    if (next === 'offline') setConnection('disconnected')
  }, [])

  const value = useMemo<AppModeContextValue>(
    () => ({
      mode,
      baseUrl,
      connection,
      section,
      setMode: handleSetMode,
      setBaseUrl,
      setConnection,
      setSection
    }),
    [mode, baseUrl, connection, section, handleSetMode]
  )

  return <AppModeContext.Provider value={value}>{children}</AppModeContext.Provider>
}

// 读取全局模式状态;必须在 AppModeProvider 内使用
export function useAppMode(): AppModeContextValue {
  const ctx = useContext(AppModeContext)
  if (!ctx) throw new Error('useAppMode 必须在 AppModeProvider 内使用')
  return ctx
}
