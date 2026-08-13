import { useCallback, useEffect, useState } from 'react'
import {
  type WorkflowActionCatalogSnapshot,
  useServices
} from '@unilab/services'

import { useWorkbench } from '../../context/WorkbenchContext'

/**
 * 读取并跟随当前 Edge Profile 的设备动作目录。
 *
 * @param enabled 当前 Profile 是否声明设备单动作任务能力。
 * @returns 动作目录、加载状态、错误与显式刷新命令。
 */
export function useDeviceActionCatalog(enabled: boolean) {
  const { backend, connection } = useWorkbench()
  const services = useServices()
  const [catalog, setCatalog] =
    useState<WorkflowActionCatalogSnapshot | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!enabled || connection !== 'connected') return
    setLoading(true)
    setError(null)
    try {
      const next = await services.workflow.getWorkflowActionCatalog(signal)
      if (signal?.aborted) return
      setCatalog(next)
    } catch (reason) {
      if (signal?.aborted) return
      setCatalog(null)
      setError(reason instanceof Error ? reason.message : '无法读取设备动作信息')
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [connection, enabled, services.workflow])

  useEffect(() => {
    if (!enabled || connection !== 'connected') {
      setCatalog(null)
      setError(null)
      setLoading(false)
      return
    }
    const controller = new AbortController()
    void refresh(controller.signal)
    return () => controller.abort()
  }, [backend.apiUrl, backend.id, connection, enabled, refresh])

  return { catalog, error, loading, refresh }
}
