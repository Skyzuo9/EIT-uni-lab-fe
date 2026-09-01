import { describe, expect, it } from 'vitest'

import {
  parseKinematicPreviewCatalog,
  parseKinematicPreviewDescriptor,
  projectKinematicPreviewScene
} from './descriptor'

const digest = 'a'.repeat(64)

function fixture(): Record<string, unknown> {
  return {
    schema: 'lab.kinematic_preview/v1',
    device_id: 'robot',
    material_uuid: 'a1000000-0000-4000-8000-000000000001',
    display_name: 'Dobot CR5',
    source_digest: digest,
    source_release: {
      archive_name: 'DOBOT_6Axis_ROS2_V4-pinned.zip',
      archive_sha256: digest,
      repository: 'https://github.com/Dobot-Arm/DOBOT_6Axis_ROS2_V4',
      exact_ref: '37730d08b08c74061ae10d4fa5565b4c4c914885',
      urdf_member: 'dobot_rviz/urdf/cr5_robot.urdf',
      urdf_sha256: digest,
      archive_read_only: true
    },
    model: {
      path: '/api/v1/kinematic-models/robot.urdf',
      format: 'urdf',
      position: [0, 0, 0],
      rotation: [0, 0, 0]
    },
    kinematics: {
      device_id: 'robot',
      topology_digest: digest,
      qualified_joint_names: ['robot_joint_1', 'robot_joint_2'],
      stale_after_s: 1
    },
    capability: {
      grade: 'kinematic-preview',
      display: true,
      stable_picking: true,
      motion_preview: true,
      hardware_execution: false,
      spatial_interlock_enforced: false,
      reason: 'preview only'
    },
    workflows: [{ id: 'inspection_sweep', label: '检查位往返', step_count: 4 }]
  }
}

describe('robot SourceRelease kinematic-preview descriptor', () => {
  it('parses a two-robot catalog for Workbench switching', () => {
    const cr5 = fixture()
    const fr5 = fixture()
    fr5.device_id = 'fairino_fr5'
    fr5.material_uuid = 'a1000000-0000-4000-8000-000000000002'
    fr5.display_name = 'FAIRINO FR5'
    ;(fr5.model as Record<string, unknown>).path =
      '/api/v1/kinematic-models/fairino_fr5.urdf'
    const kinematics = fr5.kinematics as Record<string, unknown>
    kinematics.device_id = 'fairino_fr5'
    kinematics.qualified_joint_names = ['fairino_fr5_joint_1']
    const catalog = parseKinematicPreviewCatalog({
      schema: 'lab.kinematic_preview_catalog/v0',
      robots: [cr5, fr5]
    })
    expect(catalog.robots.map(robot => robot.deviceId)).toEqual([
      'robot', 'fairino_fr5'
    ])
  })

  it('projects the digest-locked provider model and exact joint contract', () => {
    const descriptor = parseKinematicPreviewDescriptor(fixture())
    expect(descriptor.model.path).toBe(
      '/__unilab_backend/api/v1/kinematic-models/robot.urdf'
    )
    expect(descriptor.kinematics.qualifiedJointNames).toEqual([
      'robot_joint_1', 'robot_joint_2'
    ])
    const scene = projectKinematicPreviewScene(descriptor)
    const node = scene.nodes['kinematic-preview-robot'] as Record<string, unknown>
    expect(node.materialNodeId).toBe(descriptor.materialUuid)
    expect(node.kinematics).toEqual(descriptor.kinematics)
  })

  it('fails closed when the descriptor grants hardware execution', () => {
    const value = fixture()
    ;(value.capability as Record<string, unknown>).hardware_execution = true
    expect(() => parseKinematicPreviewDescriptor(value)).toThrow(
      '授予了执行/空间互锁资格'
    )
  })

  it('rejects models outside the OS kinematic model endpoint', () => {
    const value = fixture()
    ;(value.model as Record<string, unknown>).path = '/fixtures/robot.urdf'
    expect(() => parseKinematicPreviewDescriptor(value)).toThrow(
      '必须来自 OS kinematic-models 接口'
    )
  })

  it('rejects unqualified joint names', () => {
    const value = fixture()
    ;(value.kinematics as Record<string, unknown>).qualified_joint_names = [
      'joint_1'
    ]
    expect(() => parseKinematicPreviewDescriptor(value)).toThrow(
      '限定关节名'
    )
  })

  it('rejects a writable or digest-mismatched SourceRelease', () => {
    const value = fixture()
    ;(value.source_release as Record<string, unknown>).archive_read_only = false
    expect(() => parseKinematicPreviewDescriptor(value)).toThrow(
      '与 source_digest 一致的只读 ZIP'
    )
  })
})
