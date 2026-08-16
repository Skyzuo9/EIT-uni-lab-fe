import { describe, expect, it } from 'vitest'

import type {
  DeviceCatalogItem,
  DeviceJointStateFrame
} from '@unilab/services'

import {
  buildDeviceCardRuntimeState,
  shouldSubscribeDeviceStatus,
  shouldSubscribeJointState
} from './workbench-device-card'

describe('通用设备卡片运行时状态', () => {
  it('把关节状态 SSE 完整帧投影到独立 jointState 键', () => {
    const device: DeviceCatalogItem = {
      actions: [],
      deviceId: 'robot',
      deviceKey: 'robot',
      deviceTypeId: 'robot',
      label: 'pTLC Robot',
      materialUuid: 'material-robot',
      namespace: 'ptlc',
      online: true
    }
    const frame: DeviceJointStateFrame = {
      acceptedRef: 'edge:robot',
      bootId: 'boot-a',
      deviceId: 'robot',
      jointStates: { robot_cr5_joint_1: 0.5 },
      materialId: 'material-robot',
      observedAt: 123,
      sequence: 9,
      stale: false,
      staleAfterSeconds: 2,
      topologyDigest: 'digest-a'
    }

    expect(buildDeviceCardRuntimeState(device, null, frame)).toMatchObject({
      jointState: {
        jointStates: { robot_cr5_joint_1: 0.5 },
        sequence: 9,
        stale: false
      },
      online: true
    })
  })

  it('分别按设备属性与关节状态能力建立订阅', () => {
    const capabilities = {
      devices: { subscribeStatus: false },
      realtime: { subscribeJointState: true }
    } as unknown as Parameters<typeof shouldSubscribeJointState>[0]

    expect(shouldSubscribeDeviceStatus(capabilities)).toBe(false)
    expect(shouldSubscribeJointState(capabilities)).toBe(true)
  })
})
