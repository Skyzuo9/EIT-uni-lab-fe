/**
 * ============================================================
 * AI-GENERATED CODE METADATA
 * ============================================================
 * Model: Claude Opus 4.8
 * Generation Date: 2026-07-22
 * Prompt Summary: Uni-Lab-OS WebSocket 客户端封装(设备状态订阅)
 * Context: 订阅 ws://host/ws/device_status,1Hz 广播设备运行时状态
 * Human Review Status: [ ] Pending  [ ] Reviewed  [ ] Approved
 * ============================================================
 */
import type { DeviceStatus } from '../data/lab'

interface DeviceStatusMessage {
  type: string
  data: {
    device_status?: Record<string, Record<string, unknown>>
    device_status_timestamps?: Record<string, number>
  }
}

interface SocketHandlers {
  onDeviceStatus: (statuses: DeviceStatus[]) => void
  onOpen?: () => void
  onClose?: () => void
  onError?: (error: string) => void
}

// 将 http(s) 基址转为 ws(s) 的 /ws/device_status 地址
function toDeviceStatusUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/$/, '')
  const wsBase = trimmed.replace(/^http/, 'ws')
  return `${wsBase}/ws/device_status`
}

// 建立设备状态订阅连接,返回关闭函数
export function connectDeviceStatus(baseUrl: string, handlers: SocketHandlers): () => void {
  let closedByCaller = false
  const socket = new WebSocket(toDeviceStatusUrl(baseUrl))

  socket.onopen = () => handlers.onOpen?.()

  socket.onmessage = (event) => {
    const parsed = parseMessage(event.data)
    if (!parsed || parsed.type !== 'device_status') return
    handlers.onDeviceStatus(mapStatuses(parsed.data))
  }

  socket.onerror = () => handlers.onError?.('设备状态 WebSocket 连接出错')

  socket.onclose = () => {
    if (!closedByCaller) handlers.onClose?.()
  }

  return () => {
    closedByCaller = true
    socket.close()
  }
}

// 解析消息文本为结构体;失败返回 null
function parseMessage(raw: unknown): DeviceStatusMessage | null {
  if (typeof raw !== 'string') return null
  try {
    const obj = JSON.parse(raw)
    if (obj && typeof obj === 'object') return obj as DeviceStatusMessage
    return null
  } catch {
    return null
  }
}

// 将推送的 device_status 字典拍平为数组
function mapStatuses(data: DeviceStatusMessage['data']): DeviceStatus[] {
  const statusMap = data.device_status ?? {}
  const timestamps = data.device_status_timestamps ?? {}
  return Object.entries(statusMap).map(([deviceId, status]) => ({
    deviceId,
    status,
    timestamp: Number(timestamps[deviceId] ?? 0)
  }))
}
