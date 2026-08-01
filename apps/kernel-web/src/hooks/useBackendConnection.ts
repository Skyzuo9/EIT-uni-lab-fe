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

const HEALTH_CHECK_INTERVAL_MS = 3_000

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

  // 保持健康探测，避免 Edge 断开后界面仍停留在已连接状态。
  useEffect(() => {
    if (!backendEnabled) return
    let cancelled = false
    let hasConnected = false
    let timer: ReturnType<typeof globalThis.setTimeout> | null = null

    const scheduleNextProbe = (): void => {
      if (cancelled) return
      timer = globalThis.setTimeout(() => {
        void probe()
      }, HEALTH_CHECK_INTERVAL_MS)
    }

    const probe = async (): Promise<void> => {
      const ok = await client.ping()
      if (cancelled) return
      if (ok) {
        hasConnected = true
        setConnection('connected')
      } else {
        setConnection(hasConnected ? 'disconnected' : 'error')
      }
      scheduleNextProbe()
    }

    setConnection('connecting')
    void probe()
    return () => {
      cancelled = true
      if (timer != null) globalThis.clearTimeout(timer)
    }
  }, [backendEnabled, client, setConnection])

  return {
    client,
    isOnline: backendEnabled && connection === 'connected',
    reconnect
  }
}
