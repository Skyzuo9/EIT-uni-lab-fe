/** [AI] Model: Claude Opus 4.8 | 2026-07-24 | 应用根:登录门禁 + 统一外壳 + 模式 Provider */
import { AppModeProvider } from './context/AppModeContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import AppShell from './components/AppShell'
import LoginScreen from './components/auth/LoginScreen'

export default function App(): JSX.Element {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  )
}

// 根据登录态决定渲染登录界面还是主外壳
function AuthGate(): JSX.Element {
  const { isReady, isLogged } = useAuth()

  // 会话读取完成前避免闪烁
  if (!isReady) {
    return <div className="app-loading">加载中…</div>
  }

  if (!isLogged) {
    return <LoginScreen />
  }

  return (
    <AppModeProvider>
      <AppShell />
    </AppModeProvider>
  )
}
