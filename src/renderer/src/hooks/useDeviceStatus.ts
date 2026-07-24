/**
 * ============================================================
 * AI-GENERATED CODE METADATA
 * ============================================================
 * Model: Claude Opus 4.8
 * Generation Date: 2026-07-22
 * Prompt Summary: 设备实时状态订阅 hook(在线模式下连接 /ws/device_status)
 * Context: 设备方向实时状态灯,离线不连接,连接状态与更新时间对外暴露
 * Human Review Status: [ ] Pending  [ ] Reviewed  [ ] Approved
 * ============================================================
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppMode } from '../context/AppModeContext'
import { connectDeviceStatus } from '../services/labSocket'
import type { DeviceStatus } from '../data/lab'

interface UseDeviceStatusResult {
  // 以 deviceId 为键的实时状态表
  statusMap: Map<string, DeviceStatus>
  // WebSocket 是否已建立
  connected: boolean
  // 最近一次收到推送的时间戳(ms),无推送为 null
  lastUpdate: number | null
}

// 订阅设备实时状态:仅在线模式连接 /ws/device_status,离线返回空表
export function useDeviceStatus(): UseDeviceStatusResult {
  const { mode, baseUrl, connection } = useAppMode()
  const [statusMap, setStatusMap] = useState<Map<string, DeviceStatus>>(new Map())
  const [connected, setConnected] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<number | null>(null)

  // 用 ref 保存最新状态表,避免每条推送都重建订阅
  const mapRef = useRef<Map<string, DeviceStatus>>(new Map())

  const canConnect = mode === 'online' && connection === 'connected'

  useEffect(() => {
    if (!canConnect) {
      mapRef.current = new Map()
      setStatusMap(new Map())
      setConnected(false)
      setLastUpdate(null)
      return
    }

    const close = connectDeviceStatus(baseUrl, {
      onOpen: () => setConnected(true),
      onClose: () => setConnected(false),
      onDeviceStatus: (statuses) => {
        const next = new Map(mapRef.current)
        statuses.forEach((item) => next.set(item.deviceId, item))
        mapRef.current = next
        setStatusMap(next)
        setLastUpdate(Date.now())
      }
    })

    return () => {
      close()
      setConnected(false)
    }
  }, [canConnect, baseUrl])

  return useMemo(
    () => ({ statusMap, connected, lastUpdate }),
    [statusMap, connected, lastUpdate]
  )
}

// 在状态表中按设备的多种标识(uuid/deviceKey/nodeName)查找状态
export function findDeviceStatus(
  statusMap: Map<string, DeviceStatus>,
  keys: Array<string | null | undefined>
): DeviceStatus | null {
  for (const key of keys) {
    if (key && statusMap.has(key)) return statusMap.get(key) ?? null
  }
  return null
}
