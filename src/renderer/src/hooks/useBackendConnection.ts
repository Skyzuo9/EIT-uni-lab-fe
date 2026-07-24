/**
 * ============================================================
 * AI-GENERATED CODE METADATA
 * ============================================================
 * Model: Claude Opus 4.8
 * Generation Date: 2026-07-22
 * Prompt Summary: 后端连接管理 hook(健康探测 + REST 客户端实例)
 * Context: 在线模式下探测 Uni-Lab-OS 连通性并更新全局连接状态
 * Human Review Status: [ ] Pending  [ ] Reviewed  [ ] Approved
 * ============================================================
 */
import { useCallback, useEffect, useMemo } from 'react'
import { useAppMode } from '../context/AppModeContext'
import { createLabClient } from '../services/labClient'
import type { LabClient } from '../services/labClient'

interface UseBackendConnectionResult {
  client: LabClient
  isOnline: boolean
  reconnect: () => Promise<void>
}

// 管理后端连接:根据 baseUrl 创建客户端,在线模式下自动探测连通性
export function useBackendConnection(): UseBackendConnectionResult {
  const { mode, baseUrl, connection, setConnection } = useAppMode()

  const client = useMemo(() => createLabClient(baseUrl), [baseUrl])

  const reconnect = useCallback(async () => {
    setConnection('connecting')
    const ok = await client.ping()
    setConnection(ok ? 'connected' : 'error')
  }, [client, setConnection])

  // 进入在线模式或地址变化时自动探测一次
  useEffect(() => {
    if (mode !== 'online') return
    let cancelled = false
    setConnection('connecting')
    client.ping().then((ok) => {
      if (!cancelled) setConnection(ok ? 'connected' : 'error')
    })
    return () => {
      cancelled = true
    }
  }, [mode, client, setConnection])

  return {
    client,
    isOnline: mode === 'online' && connection === 'connected',
    reconnect
  }
}
