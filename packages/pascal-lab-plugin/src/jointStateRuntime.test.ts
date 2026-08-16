import { describe, expect, it, vi } from 'vitest'
import { Object3D } from 'three'

import {
  applyJointStateToUrdfWithDiagnostics,
  captureInitialJointState,
  resetJointStateUrdf,
  resolveUrdfJointValues
} from './jointStateRuntime'

function robot(joints: string[]): Object3D {
  const object = new Object3D() as Object3D & {
    joints: Record<string, { jointValue: number[] }>
    setJointValues: ReturnType<typeof vi.fn>
  }
  object.joints = Object.fromEntries(joints.map(name => [name, { jointValue: [0] }]))
  object.setJointValues = vi.fn((values: Record<string, number>) => {
    for (const [name, value] of Object.entries(values)) object.joints[name]!.jointValue = [value]
    return true
  })
  return object
}

describe('Pascal 关节状态（JointState）命令式投影', () => {
  it('只接受完整限定 joint 名', () => {
    const object = robot(['robot_joint_1', 'robot_joint_2'])
    expect(resolveUrdfJointValues(object, { robot_joint_1: 1, joint_2: 2 }))
      .toEqual({ robot_joint_1: 1 })
  })

  it('局部后缀即使唯一也关闭式拒绝', () => {
    const object = robot(['a_joint_1', 'b_joint_1'])
    const result = applyJointStateToUrdfWithDiagnostics(object, { joint_1: 1 })
    expect(result).toMatchObject({
      applied: false,
      missingCount: 1,
      suffixCount: 0
    })
  })

  it('可恢复模型初始姿态', () => {
    const object = robot(['robot_joint_1']) as Object3D & {
      joints: Record<string, { jointValue: number[] }>
    }
    captureInitialJointState(object)
    applyJointStateToUrdfWithDiagnostics(object, { robot_joint_1: 1 })
    expect(object.joints.robot_joint_1?.jointValue).toEqual([1])
    resetJointStateUrdf(object)
    expect(object.joints.robot_joint_1?.jointValue).toEqual([0])
  })
})
