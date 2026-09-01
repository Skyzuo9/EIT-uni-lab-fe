import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  activateSceneRuntimeScope,
  clearSpatialJointStateFrame,
  getJointStateFrame,
  publishJointStateFrame,
  publishSpatialJointStateFrame,
  replaceJointStateSnapshot,
  subscribeJointStateFrame,
  type JointStateFrameInput
} from './index'

const digest = 'a'.repeat(64)

function frame(overrides: Partial<JointStateFrameInput> = {}): JointStateFrameInput {
  return {
    materialId: 'material-robot',
    deviceId: 'robot',
    topologyDigest: digest,
    bootId: 'boot-1',
    sequence: 1,
    acceptedRef: 'sha256:frame-1',
    observedAt: 1000,
    staleAfterSeconds: 1,
    stale: false,
    jointStates: { robot_joint_1: 0.25 },
    source: 'live',
    ...overrides
  }
}

describe('场景运行时（SceneRuntime）关节帧', () => {
  beforeEach(() => activateSceneRuntimeScope(`test-${crypto.randomUUID()}`))

  it('按 bootId 和 sequence 接受同代际最新帧', () => {
    publishJointStateFrame(frame({ sequence: 2, acceptedRef: 'sha256:2' }))
    publishJointStateFrame(frame({ sequence: 1, acceptedRef: 'sha256:1' }))
    expect(getJointStateFrame('material-robot')?.sequence).toBe(2)
  })

  it('跨 bootId 只按 observedAt 接受更新代际', () => {
    publishJointStateFrame(frame({ bootId: 'boot-2', observedAt: 2000 }))
    publishJointStateFrame(frame({ bootId: 'boot-3', observedAt: 1500 }))
    expect(getJointStateFrame('material-robot')?.bootId).toBe('boot-2')
  })

  it('同 acceptedRef 只允许 fresh 到 stale 的转换', () => {
    publishJointStateFrame(frame())
    publishJointStateFrame(frame({ stale: true }))
    publishJointStateFrame(frame({ stale: false }))
    expect(getJointStateFrame('material-robot')?.stale).toBe(true)
  })

  it('SSE 快照替换清除缺失机械臂', () => {
    publishJointStateFrame(frame())
    replaceJointStateSnapshot([frame({ materialId: 'material-other' })])
    expect(getJointStateFrame('material-robot')).toBeNull()
    expect(getJointStateFrame('material-other')).not.toBeNull()
  })

  it('Shadow 覆盖实时姿态，清除后恢复最新实时帧', () => {
    publishJointStateFrame(frame({ jointStates: { robot_joint_1: 0.25 } }))
    publishSpatialJointStateFrame(frame({
      acceptedRef: 'shadow:frame-8',
      jointStates: { robot_joint_1: 1.25 },
      source: 'shadow'
    }))
    expect(getJointStateFrame('material-robot')).toMatchObject({
      source: 'shadow',
      jointStates: { robot_joint_1: 1.25 }
    })

    clearSpatialJointStateFrame('material-robot')
    expect(getJointStateFrame('material-robot')).toMatchObject({
      source: 'live',
      jointStates: { robot_joint_1: 0.25 }
    })
  })

  it('Shadow seek 允许向前和向后替换帧', () => {
    publishSpatialJointStateFrame(frame({
      acceptedRef: 'shadow:frame-20',
      sequence: 20,
      source: 'shadow'
    }))
    publishSpatialJointStateFrame(frame({
      acceptedRef: 'shadow:frame-5',
      sequence: 5,
      source: 'shadow'
    }))
    expect(getJointStateFrame('material-robot')?.acceptedRef).toBe('shadow:frame-5')
  })

  it('只通知目标物料订阅者并在 scope 切换时清除', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeJointStateFrame('material-robot', listener)
    publishJointStateFrame(frame())
    expect(listener).toHaveBeenCalledOnce()
    activateSceneRuntimeScope('another|http://127.0.0.1')
    expect(listener).toHaveBeenCalledTimes(2)
    expect(getJointStateFrame('material-robot')).toBeNull()
    unsubscribe()
  })

  it('验证拓扑摘要、帧身份和关节数值', () => {
    expect(() => publishJointStateFrame(frame({ topologyDigest: 'bad' })))
      .toThrow('SHA-256')
    expect(() => publishJointStateFrame(frame({ jointStates: { joint_1: NaN } })))
      .toThrow('无效名称或数值')
  })
})
