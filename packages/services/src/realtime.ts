import type { BackendConfig } from './backends'
import type { DeviceStatus } from './laboratory'
import {
  createHttpRequestTrace,
  finishHttpRequestTrace,
  reportHttpRequestTrace,
  type HttpRequestTraceReporter
} from './http'

export interface DeviceJointStateFrame {
  materialId: string
  deviceId: string
  topologyDigest: string
  bootId: string
  sequence: number
  acceptedRef: string
  observedAt: number
  staleAfterSeconds: number
  stale: boolean
  jointStates: Readonly<Record<string, number>>
}

export interface DeviceStatusHandlers {
  onDeviceStatus: (statuses: DeviceStatus[]) => void
  /** 兼容订阅入口；新消费者优先使用独立关节状态（JointState）订阅。 */
  onJointState?: (frame: DeviceJointStateFrame) => void
  onOpen?: () => void
  onClose?: () => void
  onError?: (error: string) => void
}

export interface JointStateHandlers {
  onJointState: (frame: DeviceJointStateFrame) => void
  onSnapshot?: (frames: readonly DeviceJointStateFrame[]) => void
  onOpen?: () => void
  onClose?: () => void
  onError?: (error: string) => void
}

interface DeviceTelemetryEvent {
  material_uuid: string
  local_device_id: string
  telemetry_type: 'device_properties' | 'joint_state'
  boot_id: string
  sequence: number
  accepted_ref: string
  observed_at: string
  stale_after_s: number | null
  stale: boolean
  data: Record<string, unknown>
}

interface DeviceTelemetryHandlers {
  onSnapshot: (items: DeviceTelemetryEvent[]) => void
  onChanged: (item: DeviceTelemetryEvent) => void
  onOpen?: () => void
  onClose?: () => void
  onError?: (error: string) => void
}

/**
 * 把旧实时地址或 HTTP 根地址规范成统一设备遥测（DeviceTelemetry）SSE。
 * 旧 `/api/v1/ws/device_status` 与 `/api/v1/edge/ws` 只参与地址迁移，绝不回退。
 */
export function toDeviceTelemetryUrl(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/^ws:/u, 'http:')
    .replace(/^wss:/u, 'https:')
  const url = new URL(normalized)
  const legacySuffixes = [
    '/api/v1/ws/device_status',
    '/api/v1/edge/ws',
    '/ws/device_status'
  ]
  for (const suffix of legacySuffixes) {
    if (url.pathname.endsWith(suffix)) {
      url.pathname = `${url.pathname.slice(0, -suffix.length)}/api/v1/device-telemetry/events`
      url.search = ''
      url.hash = ''
      return url.toString()
    }
  }
  if (!url.pathname.endsWith('/api/v1/device-telemetry/events')) {
    const basePath = url.pathname.replace(/\/+$/u, '')
    url.pathname = basePath.endsWith('/api/v1')
      ? `${basePath}/device-telemetry/events`
      : `${basePath}/api/v1/device-telemetry/events`
  }
  url.search = ''
  url.hash = ''
  return url.toString()
}

/** 建立先快照后更新的设备遥测（DeviceTelemetry）SSE。 */
export function connectDeviceTelemetry(
  baseUrl: string,
  handlers: DeviceTelemetryHandlers,
  traceRequest?: HttpRequestTraceReporter
): () => void {
  const streamUrl = toDeviceTelemetryUrl(baseUrl)
  const trace = createHttpRequestTrace(streamUrl, 'GET', 'sse')
  const tracedUrl = new URL(streamUrl)
  tracedUrl.searchParams.set('traceparent', trace.traceparent)
  const source = new EventSource(tracedUrl.toString())
  let opened = false
  let traceReported = false
  const onOpen = (): void => {
    opened = true
    reportHttpRequestTrace(traceRequest, finishHttpRequestTrace(trace, 'open', 200))
    traceReported = true
    handlers.onOpen?.()
  }
  const onSnapshot = (event: Event): void => {
    const payload = parseJsonEvent(event)
    if (!isExactRecord(payload, ['items']) || !Array.isArray(payload.items)) {
      handlers.onError?.('设备遥测快照合同无效')
      return
    }
    const items = payload.items.map(parseTelemetryEvent)
    if (items.some(item => item === null)) {
      handlers.onError?.('设备遥测快照合同无效')
      return
    }
    handlers.onSnapshot(items as DeviceTelemetryEvent[])
  }
  const onChanged = (event: Event): void => {
    const item = parseTelemetryEvent(parseJsonEvent(event))
    if (!item) {
      handlers.onError?.('设备遥测更新合同无效')
      return
    }
    handlers.onChanged(item)
  }
  const onError = (): void => {
    if (!traceReported) {
      reportHttpRequestTrace(traceRequest, finishHttpRequestTrace(trace, 'error'))
      traceReported = true
    }
    handlers.onError?.('设备遥测 SSE 连接出错')
    if (opened && source.readyState === EventSource.CLOSED) {
      opened = false
      handlers.onClose?.()
    }
  }
  source.addEventListener('open', onOpen)
  source.addEventListener('device.telemetry.snapshot', onSnapshot)
  source.addEventListener('device.telemetry.changed', onChanged)
  source.addEventListener('error', onError)
  return () => {
    source.removeEventListener('open', onOpen)
    source.removeEventListener('device.telemetry.snapshot', onSnapshot)
    source.removeEventListener('device.telemetry.changed', onChanged)
    source.removeEventListener('error', onError)
    source.close()
  }
}

export interface RealtimeService {
  subscribeDeviceStatus: (handlers: DeviceStatusHandlers) => () => void
  subscribeJointState: (handlers: JointStateHandlers) => () => void
  dispose: () => void
}

/**
 * 创建单连接实时服务：通用设备卡片和 Pascal 共用一个 SSE，并从内存 latest
 * 给迟到订阅者重放。正式后端（Backend）能力未声明时由上层能力门禁关闭。
 */
export function createRealtimeService(
  backend: BackendConfig,
  _traceRequest?: HttpRequestTraceReporter
): RealtimeService {
  const statusSubscribers = new Set<DeviceStatusHandlers>()
  const jointSubscribers = new Set<JointStateHandlers>()
  const statuses = new Map<string, DeviceStatus>()
  const jointFrames = new Map<string, DeviceJointStateFrame>()
  const baseUrl = backend.realtimeUrl || backend.apiUrl
  let closeConnection: (() => void) | null = null
  let connected = false

  const broadcastStatuses = (): void => {
    const snapshot = [...statuses.values()]
    for (const subscriber of statusSubscribers) {
      subscriber.onDeviceStatus(snapshot)
    }
  }
  const publishEvent = (event: DeviceTelemetryEvent): void => {
    if (event.telemetry_type === 'device_properties') {
      const status = mapDeviceStatus(event)
      if (!status) return
      statuses.set(status.deviceId, status)
      broadcastStatuses()
      return
    }
    const frame = mapJointState(event)
    if (!frame) return
    jointFrames.set(frame.materialId, frame)
    for (const subscriber of statusSubscribers) subscriber.onJointState?.(frame)
    for (const subscriber of jointSubscribers) subscriber.onJointState(frame)
  }
  const ensureConnection = (): void => {
    if (closeConnection || statusSubscribers.size + jointSubscribers.size === 0) return
    closeConnection = connectDeviceTelemetry(baseUrl, {
      onOpen: () => {
        connected = true
        for (const subscriber of statusSubscribers) subscriber.onOpen?.()
        for (const subscriber of jointSubscribers) subscriber.onOpen?.()
      },
      onClose: () => {
        connected = false
        for (const subscriber of statusSubscribers) subscriber.onClose?.()
        for (const subscriber of jointSubscribers) subscriber.onClose?.()
      },
      onError: (error) => {
        for (const subscriber of statusSubscribers) subscriber.onError?.(error)
        for (const subscriber of jointSubscribers) subscriber.onError?.(error)
      },
      onSnapshot: (items) => {
        statuses.clear()
        jointFrames.clear()
        for (const item of items) {
          if (item.telemetry_type === 'device_properties') {
            const status = mapDeviceStatus(item)
            if (status) statuses.set(status.deviceId, status)
          } else {
            const frame = mapJointState(item)
            if (frame) jointFrames.set(frame.materialId, frame)
          }
        }
        broadcastStatuses()
        const frameSnapshot = [...jointFrames.values()]
        for (const frame of frameSnapshot) {
          for (const subscriber of statusSubscribers) subscriber.onJointState?.(frame)
        }
        for (const subscriber of jointSubscribers) {
          if (subscriber.onSnapshot) subscriber.onSnapshot(frameSnapshot)
          else for (const frame of frameSnapshot) subscriber.onJointState(frame)
        }
      },
      onChanged: publishEvent
    }, backend.serverKind === 'edge' ? _traceRequest : undefined)
  }
  const releaseConnectionIfUnused = (): void => {
    if (statusSubscribers.size + jointSubscribers.size > 0) return
    closeConnection?.()
    closeConnection = null
    connected = false
    statuses.clear()
    jointFrames.clear()
  }

  return {
    subscribeDeviceStatus: (handlers) => {
      statusSubscribers.add(handlers)
      if (connected) handlers.onOpen?.()
      if (statuses.size > 0) handlers.onDeviceStatus([...statuses.values()])
      for (const frame of jointFrames.values()) handlers.onJointState?.(frame)
      ensureConnection()
      return () => {
        statusSubscribers.delete(handlers)
        releaseConnectionIfUnused()
      }
    },
    subscribeJointState: (handlers) => {
      jointSubscribers.add(handlers)
      if (connected) handlers.onOpen?.()
      const snapshot = [...jointFrames.values()]
      if (handlers.onSnapshot) handlers.onSnapshot(snapshot)
      else for (const frame of snapshot) handlers.onJointState(frame)
      ensureConnection()
      return () => {
        jointSubscribers.delete(handlers)
        releaseConnectionIfUnused()
      }
    },
    dispose: () => {
      closeConnection?.()
      closeConnection = null
      connected = false
      statusSubscribers.clear()
      jointSubscribers.clear()
      statuses.clear()
      jointFrames.clear()
    }
  }
}

function parseTelemetryEvent(value: unknown): DeviceTelemetryEvent | null {
  const keys = [
    'material_uuid', 'local_device_id', 'telemetry_type', 'boot_id',
    'sequence', 'accepted_ref', 'observed_at', 'stale_after_s', 'stale', 'data'
  ] as const
  if (!isExactRecord(value, keys)) return null
  if (!boundedText(value.material_uuid, 200) || !boundedText(value.local_device_id, 200)) return null
  if (value.telemetry_type !== 'device_properties' && value.telemetry_type !== 'joint_state') return null
  if (!boundedText(value.boot_id, 128) || !boundedText(value.accepted_ref, 80)) return null
  if (!positiveInteger(value.sequence) || !timestamp(value.observed_at)) return null
  if (typeof value.stale !== 'boolean' || !isRecord(value.data)) return null
  if (value.telemetry_type === 'device_properties' && value.stale_after_s !== null) return null
  if (value.telemetry_type === 'joint_state' && !finiteNumber(value.stale_after_s)) return null
  return value as unknown as DeviceTelemetryEvent
}

function mapDeviceStatus(event: DeviceTelemetryEvent): DeviceStatus | null {
  if (!isExactRecord(event.data, ['properties', 'property_observed_at'])) return null
  if (!isRecord(event.data.properties) || !isRecord(event.data.property_observed_at)) return null
  const names = Object.keys(event.data.properties)
  if (names.length === 0 || names.length > 512 ||
      !sameKeys(event.data.properties, event.data.property_observed_at)) return null
  for (const name of names) {
    const value = event.data.properties[name]
    if (!name || !isScalar(value) || !timestamp(event.data.property_observed_at[name])) return null
  }
  return {
    deviceId: event.local_device_id,
    status: { ...event.data.properties },
    timestamp: Date.parse(event.observed_at)
  }
}

function mapJointState(event: DeviceTelemetryEvent): DeviceJointStateFrame | null {
  if (!isExactRecord(event.data, ['topology_digest', 'joint_states'])) return null
  if (typeof event.data.topology_digest !== 'string' ||
      !/^[0-9a-f]{64}$/u.test(event.data.topology_digest) ||
      !isRecord(event.data.joint_states)) return null
  const entries = Object.entries(event.data.joint_states)
  if (entries.length === 0 || entries.length > 512) return null
  const jointStates: Record<string, number> = {}
  for (const [name, value] of entries) {
    if (!name || name.length > 255 || !finiteNumber(value)) return null
    jointStates[name] = value
  }
  return Object.freeze({
    materialId: event.material_uuid,
    deviceId: event.local_device_id,
    topologyDigest: event.data.topology_digest,
    bootId: event.boot_id,
    sequence: event.sequence,
    acceptedRef: event.accepted_ref,
    observedAt: Date.parse(event.observed_at),
    staleAfterSeconds: event.stale_after_s as number,
    stale: event.stale,
    jointStates: Object.freeze(jointStates)
  })
}

function parseJsonEvent(event: Event): unknown {
  if (!(event instanceof MessageEvent) || typeof event.data !== 'string') return null
  try { return JSON.parse(event.data) as unknown } catch { return null }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isExactRecord<const K extends readonly string[]>(
  value: unknown,
  keys: K
): value is Record<K[number], unknown> {
  return isRecord(value) && Object.keys(value).length === keys.length &&
    keys.every(key => Object.prototype.hasOwnProperty.call(value, key))
}

function boundedText(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum
}

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function timestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function isScalar(value: unknown): boolean {
  return typeof value === 'string' || typeof value === 'boolean' || finiteNumber(value)
}

function sameKeys(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
  const leftKeys = Object.keys(left).sort()
  const rightKeys = Object.keys(right).sort()
  return leftKeys.length === rightKeys.length && leftKeys.every((key, index) => key === rightKeys[index])
}
