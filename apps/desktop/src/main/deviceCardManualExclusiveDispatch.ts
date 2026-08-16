import type { BrowserWindow } from 'electron'
import type {
  DeviceCardHostManualExclusiveRequest,
  DeviceCardHostManualExclusiveResult,
  DeviceCardManualExclusiveOperation,
  DeviceCardRuntimeSnapshot
} from '@unilab/device-card-sdk'

export function dispatchDeviceCardManualExclusive(input: {
  context: DeviceCardRuntimeSnapshot
  uiFeatures: readonly string[]
  operation: unknown
  window: BrowserWindow
  registerPending: (
    requestId: string,
    resolve: (result: DeviceCardHostManualExclusiveResult) => void
  ) => void
}): Promise<DeviceCardHostManualExclusiveResult> {
  if (input.context.mode !== 'live' || !input.context.device.deviceId) {
    return Promise.resolve(failure('', '手动独占只允许已绑定的 Live 卡片调用。'))
  }
  if (!input.uiFeatures.includes('manual-exclusive')) {
    return Promise.resolve(failure('', '卡片未声明 manual-exclusive UI Feature。'))
  }
  if (!isOperation(input.operation)) {
    return Promise.resolve(failure('', '手动独占操作无效。'))
  }
  const request: DeviceCardHostManualExclusiveRequest = {
    requestId: crypto.randomUUID(),
    deviceId: input.context.device.deviceId,
    operation: input.operation
  }
  return new Promise(resolve => {
    input.registerPending(request.requestId, resolve)
    input.window.webContents.send(
      'device-cards:manualExclusiveRequest',
      request
    )
  })
}

function isOperation(value: unknown): value is DeviceCardManualExclusiveOperation {
  return value === 'read' || value === 'acquire' || value === 'release'
}

function failure(
  requestId: string,
  error: string
): DeviceCardHostManualExclusiveResult {
  return { requestId, ok: false, error }
}
