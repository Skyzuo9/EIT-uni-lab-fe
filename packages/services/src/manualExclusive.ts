import type { CapabilityStatus } from './capabilities'
import { assertCapability, ServiceError } from './errors'
import { requestData, type HttpClient } from './http'

export type ManualExclusiveState = 'idle' | 'busy' | 'exclusive'

export interface ManualExclusiveSnapshot {
  localDeviceId: string
  state: ManualExclusiveState
  exclusive: boolean
}

export interface ManualExclusiveService {
  read: (localDeviceId: string) => Promise<ManualExclusiveSnapshot>
  acquire: (localDeviceId: string) => Promise<ManualExclusiveSnapshot>
  release: (localDeviceId: string) => Promise<ManualExclusiveSnapshot>
}

/** 创建本地手动独占（Exclusive）的 exact HTTP 适配器。 */
export function createManualExclusiveService(
  http: HttpClient,
  capability: CapabilityStatus
): ManualExclusiveService {
  const request = async (
    localDeviceId: string,
    method: 'GET' | 'PUT' | 'DELETE'
  ): Promise<ManualExclusiveSnapshot> => {
    assertCapability(capability, 'devices.manualExclusive')
    const normalized = localDeviceId.trim()
    if (!normalized) {
      throw new ServiceError({
        code: 'INVALID_DEVICE_ID',
        message: '本地设备身份不能为空',
        retryable: false
      })
    }
    const data = await requestData<unknown>(
      http,
      `/api/v1/devices/${encodeURIComponent(normalized)}/exclusive`,
      { method }
    )
    return parseSnapshot(data)
  }
  return {
    read: (deviceId) => request(deviceId, 'GET'),
    acquire: (deviceId) => request(deviceId, 'PUT'),
    release: (deviceId) => request(deviceId, 'DELETE')
  }
}

function parseSnapshot(value: unknown): ManualExclusiveSnapshot {
  const keys = ['local_device_id', 'state', 'exclusive']
  if (!isRecord(value) || Object.keys(value).length !== keys.length ||
      !keys.every(key => Object.prototype.hasOwnProperty.call(value, key)) ||
      typeof value.local_device_id !== 'string' ||
      !['idle', 'busy', 'exclusive'].includes(String(value.state)) ||
      typeof value.exclusive !== 'boolean' ||
      value.exclusive !== (value.state === 'exclusive')) {
    throw new ServiceError({
      code: 'INVALID_API_RESPONSE',
      message: '手动独占（Exclusive）响应合同无效',
      retryable: false
    })
  }
  return {
    localDeviceId: value.local_device_id,
    state: value.state as ManualExclusiveState,
    exclusive: value.exclusive
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
