/** [AI] Model: Claude Opus 4.8 | 2026-07-24 | 应用根:登录门禁 + 统一外壳 + 模式 Provider */
import { useCallback, type ReactNode } from 'react'
import { ServicesProvider } from '@unilab/services'
import {
  WorkbenchProvider,
  useWorkbench
} from './context/WorkbenchContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import { LabInteractionProvider } from './integrations/lab-workbench/LabInteractionProvider'
import { MaterialRuntimeProvider } from './integrations/lab-workbench/MaterialRuntimeProvider'
import AppShell from './components/AppShell'
import LoginScreen from './components/auth/LoginScreen'

export default function App(): React.JSX.Element {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  )
}

// 根据登录态决定渲染登录界面还是主外壳
function AuthGate(): React.JSX.Element {
  const { isReady, isLogged } = useAuth()

  // 会话读取完成前避免闪烁
  if (!isReady) {
    return <div className="flex h-full w-full items-center justify-center text-[13px] text-[#6b7280]">加载中…</div>
  }

  if (!isLogged) {
    return <LoginScreen />
  }

  return (
    <WorkbenchProvider>
      <ActiveServices>
        <MaterialRuntimeProvider>
          <ActiveInteraction>
            <AppShell />
          </ActiveInteraction>
        </MaterialRuntimeProvider>
      </ActiveServices>
    </WorkbenchProvider>
  )
}

function ActiveInteraction({
  children
}: {
  children: ReactNode
}): React.JSX.Element {
  const { backend } = useWorkbench()
  return (
    <LabInteractionProvider
      key={[
        backend.id,
        backend.apiUrl,
        backend.realtimeUrl,
        backend.workspaceMode
      ].join(':')}
    >
      {children}
    </LabInteractionProvider>
  )
}

function ActiveServices({ children }: { children: ReactNode }): React.JSX.Element {
  const { backend } = useWorkbench()
  const { session } = useAuth()
  const getAccessToken = useCallback(() => session?.token ?? null, [session?.token])

  return (
    <ServicesProvider backend={backend} getAccessToken={getAccessToken}>
      {children}
    </ServicesProvider>
  )
}
