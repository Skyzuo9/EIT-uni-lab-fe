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
import { useCallback, useEffect } from 'react'
import { useServices, type LaboratoryService } from '@unilab/services'
import { useWorkbench } from '../context/WorkbenchContext'

interface UseBackendConnectionResult {
  client: LaboratoryService
  isOnline: boolean
  reconnect: () => Promise<void>
}

// 管理后端连接:根据 baseUrl 创建客户端,在线模式下自动探测连通性
export function useBackendConnection(): UseBackendConnectionResult {
  const { backendEnabled, connection, setConnection } = useWorkbench()
  const client = useServices().laboratory

  const reconnect = useCallback(async () => {
    setConnection('connecting')
    const ok = await client.ping()
    setConnection(ok ? 'connected' : 'error')
  }, [client, setConnection])

  // 进入在线模式或地址变化时自动探测一次
  useEffect(() => {
    if (!backendEnabled) return
    let cancelled = false
    setConnection('connecting')
    client.ping().then((ok) => {
      if (!cancelled) setConnection(ok ? 'connected' : 'error')
    })
    return () => {
      cancelled = true
    }
  }, [backendEnabled, client, setConnection])

  return {
    client,
    isOnline: backendEnabled && connection === 'connected',
    reconnect
  }
}
