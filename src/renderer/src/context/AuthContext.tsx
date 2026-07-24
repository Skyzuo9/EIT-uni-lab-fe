/**
 * ============================================================
 * AI-GENERATED CODE METADATA
 * ============================================================
 * Model: Claude Opus 4.8
 * Generation Date: 2026-07-24
 * Prompt Summary: 渲染进程登录状态 Context(读取会话/发起 OAuth/登出),对接主进程 auth IPC
 * Context: 与 web AuthContext 定位一致——全局提供登录态与登录方法
 * Human Review Status: [ ] Pending  [ ] Reviewed  [ ] Approved
 * ============================================================
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { AuthSession } from '../types/auth'

interface AuthContextValue {
  session: AuthSession | null
  isLogged: boolean
  isReady: boolean
  isLoggingIn: boolean
  error: string | null
  login: () => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

interface AuthProviderProps {
  children: ReactNode
}

// 全局登录态 Provider:启动时读取本地会话,提供登录/登出方法
export function AuthProvider({ children }: AuthProviderProps): JSX.Element {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 启动时读取本地已保存会话
  useEffect(() => {
    let mounted = true
    void (async () => {
      try {
        const saved = await window.api.auth.getSession()
        if (mounted) setSession(saved)
      } catch {
        if (mounted) setSession(null)
      } finally {
        if (mounted) setIsReady(true)
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  const login = useCallback(async () => {
    setIsLoggingIn(true)
    setError(null)
    try {
      const result = await window.api.auth.login()
      if (result) {
        setSession(result)
      } else {
        setError('登录已取消')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败,请重试')
    } finally {
      setIsLoggingIn(false)
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      await window.api.auth.logout()
    } finally {
      setSession(null)
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isLogged: Boolean(session?.token),
      isReady,
      isLoggingIn,
      error,
      login,
      logout
    }),
    [session, isReady, isLoggingIn, error, login, logout]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// 读取全局登录态;必须在 AuthProvider 内使用
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth 必须在 AuthProvider 内使用')
  return ctx
}
