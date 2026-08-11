import { useCallback, useState } from 'react'
import { type DeviceAction, useServices } from '@unilab/services'

import type { ManagedDevice } from '../../data/deviceCatalog'
import type {
  UnlockIntent,
  UnlockOperation
} from './DevicePanelSupport'

/**
 * 管理人工解锁确认、服务调用与结果复核。
 *
 * @param refresh 解锁完成后重新读取设备目录的回调。
 * @returns 解锁意图、操作状态和确认命令。
 * @safety 只有带当前 Job 标识的动作才能形成解锁意图，最终仍由 OS 校验。
 */
export function useDeviceUnlock(refresh: () => Promise<void>) {
  const services = useServices()
  const [unlockIntent, setUnlockIntent] = useState<UnlockIntent | null>(null)
  const [unlockOperation, setUnlockOperation] =
    useState<UnlockOperation | null>(null)

  const requestUnlock = useCallback(
    (device: ManagedDevice, action: DeviceAction) => {
      if (!action.currentJobId) return
      setUnlockOperation(null)
      setUnlockIntent({
        deviceId: device.id,
        deviceName: device.displayName,
        actionName: action.actionName,
        actionRef: action.actionRef,
        actionLabel: action.displayName,
        expectedJobId: action.currentJobId
      })
    },
    []
  )

  const confirmUnlock = useCallback(async () => {
    const intent = unlockIntent
    if (!intent) return
    setUnlockOperation({
      actionRef: intent.actionRef,
      state: 'pending',
      message: '正在请求 OS 取消当前动作并释放锁…'
    })
    try {
      const result = await services.laboratory.forceUnlockDeviceAction({
        deviceId: intent.deviceId,
        actionName: intent.actionName,
        expectedJobId: intent.expectedJobId
      })
      setUnlockIntent(null)
      setUnlockOperation({
        actionRef: intent.actionRef,
        state: 'success',
        message: result.status === 'already_unlocked'
          ? '该动作锁已由 OS 释放，正在复核最新目录状态。'
          : `OS 已释放 ${result.releasedJobIds.length} 个关联 Job，正在复核最新目录状态。`
      })
      await refresh()
    } catch (error) {
      setUnlockOperation({
        actionRef: intent.actionRef,
        state: 'error',
        message: error instanceof Error
          ? error.message
          : '设备解锁失败，请刷新状态后重试'
      })
    }
  }, [refresh, services.laboratory, unlockIntent])

  const dismissUnlock = useCallback(() => {
    if (unlockOperation?.state !== 'pending') setUnlockIntent(null)
  }, [unlockOperation?.state])

  return {
    confirmUnlock,
    dismissUnlock,
    requestUnlock,
    unlockIntent,
    unlockOperation
  }
}
