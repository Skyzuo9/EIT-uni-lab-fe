/**
 * ============================================================
 * AI-GENERATED CODE METADATA
 * ============================================================
 * Model: Claude Opus 4.8
 * Generation Date: 2026-07-22
 * Prompt Summary: 设备列表数据 hook(仅展示 Edge 上报设备)
 * Context: 设备方向 MVP,处理 loading/error/empty
 * Human Review Status: [ ] Pending  [ ] Reviewed  [ ] Approved
 * ============================================================
 */
import { useCallback, useEffect, useState } from 'react'
import { useServices } from '@unilab/services'
import { useWorkbench } from '../context/WorkbenchContext'
import {
  presentEdgeDevices,
  type ManagedDevice
} from '../data/deviceCatalog'

interface UseDevicesResult {
  devices: ManagedDevice[]
  loading: boolean
  error: string | null
  lastUpdated: number | null
  refresh: () => Promise<void>
}

export function useDevices(): UseDevicesResult {
  const {
    backendEnabled,
    connection,
    recoveryRevision,
    reportCapabilityHealth
  } = useWorkbench()
  const services = useServices()
  const client = services.laboratory
  const canListActions = services.capabilities.devices.listActions
  const isOnline = backendEnabled && connection === 'connected'
  const [devices, setDevices] = useState<ManagedDevice[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)

  useEffect(() => {
    if (!backendEnabled || connection !== 'connected') {
      reportCapabilityHealth('devices', {
        status: 'idle',
        summary: '等待后端连接'
      })
      return
    }
    if (loading) {
      reportCapabilityHealth('devices', {
        status: 'loading',
        summary: '正在读取设备目录'
      })
      return
    }
    if (error) {
      reportCapabilityHealth('devices', {
        status: 'error',
        summary: '设备目录尚未就绪',
        technicalDetail: error
      })
      return
    }
    reportCapabilityHealth('devices', {
      status: 'ready',
      summary: `${devices.length} 台设备`
    })
  }, [
    backendEnabled,
    connection,
    devices.length,
    error,
    loading,
    reportCapabilityHealth
  ])

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!backendEnabled) {
      setDevices([])
      setError(null)
      setLastUpdated(null)
      return
    }
    if (!canListActions) {
      setDevices([])
      setError(
        services.getCapabilityStatus('devices.listActions').reason
          ?? '当前服务不支持 Action 目录'
      )
      setLastUpdated(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const list = await client.getOnlineDevices(signal)
      if (signal?.aborted) return
      setDevices(presentEdgeDevices(list))
      setLastUpdated(Date.now())
    } catch (err) {
      if (signal?.aborted) return
      setError(err instanceof Error ? err.message : '获取设备列表失败')
      setDevices([])
    } finally {
      setLoading(false)
    }
  }, [backendEnabled, canListActions, client, services])

  // 后端连通或恢复代次变化时补读一次目录；实时变化必须由公开订阅触发，禁止轮询。
  useEffect(() => {
    if (!isOnline) {
      if (connection === 'error' || connection === 'disconnected') {
        setDevices([])
        setLastUpdated(null)
      }
      return
    }
    const controller = new AbortController()
    void refresh(controller.signal)
    return () => {
      controller.abort()
    }
  }, [connection, isOnline, recoveryRevision, refresh])

  return { devices, loading, error, lastUpdated, refresh }
}
