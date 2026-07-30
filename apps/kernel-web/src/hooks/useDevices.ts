/**
 * ============================================================
 * AI-GENERATED CODE METADATA
 * ============================================================
 * Model: Claude Opus 4.8
 * Generation Date: 2026-07-22
 * Prompt Summary: 设备列表数据 hook(在线拉取 online-devices,离线用示例)
 * Context: 设备方向 MVP,处理 loading/error/empty
 * Human Review Status: [ ] Pending  [ ] Reviewed  [ ] Approved
 * ============================================================
 */
import { useCallback, useEffect, useState } from 'react'
import { useServices } from '@unilab/services'
import { useWorkbench } from '../context/WorkbenchContext'
import {
  mergeWithDefaultDevices,
  type ManagedDevice
} from '../data/defaultDevices'

interface UseDevicesResult {
  devices: ManagedDevice[]
  loading: boolean
  error: string | null
  lastUpdated: number | null
  refresh: () => Promise<void>
}

// 默认模板只负责占位展示；状态、动作与执行能力始终来自 Edge。
export function useDevices(): UseDevicesResult {
  const { backendEnabled, connection } = useWorkbench()
  const services = useServices()
  const client = services.laboratory
  const canListOnlineDevices = services.capabilities.devices.listOnline
  const isOnline = backendEnabled && connection === 'connected'
  const [devices, setDevices] = useState<ManagedDevice[]>(() =>
    mergeWithDefaultDevices([])
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)

  const refresh = useCallback(async () => {
    if (!backendEnabled) {
      setDevices(mergeWithDefaultDevices([]))
      setError(null)
      setLastUpdated(null)
      return
    }
    if (!canListOnlineDevices) {
      setDevices(mergeWithDefaultDevices([]))
      setError(
        services.getCapabilityStatus('devices.listOnline').reason
          ?? '当前服务不支持设备目录'
      )
      setLastUpdated(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const list = await client.getOnlineDevices()
      setDevices(mergeWithDefaultDevices(list))
      setLastUpdated(Date.now())
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取设备列表失败')
      setDevices(mergeWithDefaultDevices([]))
    } finally {
      setLoading(false)
    }
  }, [backendEnabled, canListOnlineDevices, client, services])

  // Edge 连通后立即刷新，并低频同步设备上线与动作忙闲变化。
  useEffect(() => {
    if (!isOnline) {
      if (connection === 'error' || connection === 'disconnected') {
        setDevices(mergeWithDefaultDevices([]))
        setLastUpdated(null)
      }
      return
    }
    void refresh()
    const timer = globalThis.setInterval(() => {
      void refresh()
    }, 5_000)
    return () => globalThis.clearInterval(timer)
  }, [connection, isOnline, refresh])

  return { devices, loading, error, lastUpdated, refresh }
}
