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
import { useWorkbench } from '../context/WorkbenchContext'
import { useBackendConnection } from './useBackendConnection'
import type { OnlineDevice } from '../data/lab'

interface UseDevicesResult {
  devices: OnlineDevice[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

// 离线模式下的示例设备,便于无后端时预览界面
const OFFLINE_DEVICES: OnlineDevice[] = [
  {
    deviceKey: 'liquid_handler.ot2',
    namespace: '/lab',
    machineName: 'OT-2 液体工作站',
    uuid: 'lh_ot2_01',
    nodeName: 'ot2_node'
  },
  {
    deviceKey: 'syringepump.runze',
    namespace: '/lab',
    machineName: '润泽注射泵 SY03B',
    uuid: 'pump_runze_01',
    nodeName: 'pump_node'
  },
  {
    deviceKey: 'heaterstirrer.virtual',
    namespace: '/lab',
    machineName: '加热搅拌器(虚拟)',
    uuid: 'hs_virtual_01',
    nodeName: 'hs_node'
  }
]

// 获取设备列表:在线拉取,离线回退示例数据
export function useDevices(): UseDevicesResult {
  const { backendEnabled } = useWorkbench()
  const { client, isOnline } = useBackendConnection()
  const [devices, setDevices] = useState<OnlineDevice[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!backendEnabled) {
      setDevices(OFFLINE_DEVICES)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const list = await client.getOnlineDevices()
      setDevices(list)
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取设备列表失败')
      setDevices([])
    } finally {
      setLoading(false)
    }
  }, [backendEnabled, client])

  // 模式或连接状态变化时刷新
  useEffect(() => {
    if (!backendEnabled || isOnline) void refresh()
  }, [backendEnabled, isOnline, refresh])

  return { devices, loading, error, refresh }
}
