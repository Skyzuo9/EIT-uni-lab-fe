import { randomUUID } from 'node:crypto'
import { dialog, type BrowserWindow } from 'electron'
import {
  requiresDeviceCardActionConfirmation,
  validateDeviceCardActionParams
} from '@unilab/device-card-host'
import type {
  DeviceCardActionContract,
  DeviceCardActionRun,
  DeviceCardRuntimeSnapshot
} from '@unilab/device-card-sdk'

import type { RuntimeCardRecord } from './deviceCardRuntimeValidation'
import { isPlainRecord } from './deviceCardRuntimeValidation'

interface ActionRuntimeSession {
  record: RuntimeCardRecord
  context: DeviceCardRuntimeSnapshot
  actions: Map<string, DeviceCardActionContract>
}

/**
 * 校验设备卡 Action 请求并将合格的 Live 请求交给主 Renderer。
 *
 * @safety manifest、当前 OS JSON Schema、Live 绑定和风险确认全部通过后才分发。
 */
export async function dispatchDeviceCardAction(options: {
  session: ActionRuntimeSession
  payload: { action?: unknown; params?: unknown }
  window: BrowserWindow
  registerPending: (
    requestId: string,
    resolve: (run: DeviceCardActionRun) => void
  ) => void
}): Promise<DeviceCardActionRun> {
  const { session, payload, window, registerPending } = options
  const action = typeof payload?.action === 'string' ? payload.action : ''
  const requestId = randomUUID()
  if (payload?.params !== undefined && !isPlainRecord(payload.params)) {
    return rejected(requestId, action, 'Action 参数必须是 JSON 对象。')
  }
  const params = (payload?.params ?? {}) as Record<string, unknown>
  if (!session.record.metadata.manifest.permissions.actions.includes(action)) {
    return rejected(requestId, action, 'Action 未在卡片 manifest 中授权。')
  }
  if (JSON.stringify(params).length > 64 * 1024) {
    return rejected(requestId, action, 'Action 参数超过 64 KiB。')
  }
  const actionContract = session.actions.get(action)
  if (actionContract) {
    const validation = validateDeviceCardActionParams(
      actionContract.inputSchema,
      params
    )
    if (!validation.valid) {
      return rejected(
        requestId,
        action,
        `Action 参数不符合当前 OS JSON Schema：${validation.errors.join('；')}`
      )
    }
  }
  if (session.context.mode === 'mock') {
    return { requestId, action, status: 'DONE', result: { mock: true } }
  }
  const deviceId = session.context.device.deviceId
  if (!deviceId) {
    return rejected(requestId, action, 'Live 卡片没有绑定设备实例。')
  }
  if (!actionContract) {
    return rejected(
      requestId,
      action,
      '当前设备没有找到该动作的运行信息，请刷新设备后重试。'
    )
  }
  if (!await confirmDeviceCardAction(window, deviceId, actionContract, params)) {
    return {
      requestId,
      action,
      status: 'CANCELLED',
      error: '用户取消了危险设备 Action。'
    }
  }
  window.webContents.send('device-cards:actionRequest', {
    requestId,
    deviceId,
    action,
    params
  })
  return new Promise<DeviceCardActionRun>((resolve) => {
    registerPending(requestId, resolve)
  })
}

function rejected(
  requestId: string,
  action: string,
  error: string
): DeviceCardActionRun {
  return { requestId, action, status: 'REJECTED', error }
}

async function confirmDeviceCardAction(
  window: BrowserWindow,
  deviceId: string,
  contract: DeviceCardActionContract,
  params: Record<string, unknown>
): Promise<boolean> {
  if (!requiresDeviceCardActionConfirmation(contract.riskLevel)) return true
  const emergency = contract.riskLevel === 'emergency'
  const result = await dialog.showMessageBox(window, {
    type: emergency ? 'error' : 'warning',
    title: emergency ? '确认紧急设备 Action' : '确认危险设备 Action',
    message: `${contract.label}（${contract.action}）`,
    detail: [
      `目标设备：${deviceId}`,
      `Edge 风险等级：${contract.riskLevel}`,
      `参数：${JSON.stringify(params).slice(0, 2_000)}`,
      '卡片代码不能降低该风险等级。只有确认现场安全后才可继续。'
    ].join('\n'),
    buttons: [emergency ? '确认并执行紧急 Action' : '确认并执行', '取消'],
    defaultId: 1,
    cancelId: 1,
    noLink: true
  })
  return result.response === 0
}
