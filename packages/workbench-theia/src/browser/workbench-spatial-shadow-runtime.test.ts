import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import type { MaterialAggregate } from '@unilab/material'
import { parseSpatialShadowSnapshot } from '@unilab/spatial-diagnostics'
import { describe, expect, it } from 'vitest'

import {
  alignSpatialShadowRobotBase,
  resolveSpatialShadowRobotBinding
} from './workbench-spatial-shadow-runtime'

const topologyDigest = '4d06af12ab8bbd0730a023e0c3c84f4e359436aedf49c67681de13ee71e91b53'

function robotAggregate(id = 'material-robot'): MaterialAggregate {
  return {
    material: {
      id,
      sourceTemplateId: 'template-robot',
      code: 'UNILAB-GRAPH-robot',
      name: 'CR5 机械臂',
      config: {
        sourceIdentity: 'robot',
        rendering: {
          model: { path: '/api/v1/kinematic-models/robot.urdf' },
          kinematics: {
            device_id: 'robot',
            topology_digest: topologyDigest,
            qualified_joint_names: [
              'robot_cr5_joint_1',
              'robot_cr5_joint_2',
              'robot_cr5_joint_3',
              'robot_cr5_joint_4',
              'robot_cr5_joint_5',
              'robot_cr5_joint_6'
            ],
            stale_after_s: 1
          }
        }
      },
      createdAt: '2026-08-31T00:00:00Z',
      updatedAt: '2026-08-31T00:00:00Z'
    },
    placement: {
      kind: 'world',
      pose: {
        positionMm: [-231.431141, -1.677236, 178.497255],
        rotationDegXYZ: [0, 0, 0]
      }
    },
    sites: [],
    revision: 1
  }
}

describe('Workbench spatial Shadow CR5 runtime projection', () => {
  it('binds the unique current OS aggregate with six exact qualified joints', () => {
    expect(resolveSpatialShadowRobotBinding([robotAggregate()])).toMatchObject({
      materialId: 'material-robot',
      deviceId: 'robot',
      topologyDigest,
      qualifiedJointNames: [
        'robot_cr5_joint_1',
        'robot_cr5_joint_2',
        'robot_cr5_joint_3',
        'robot_cr5_joint_4',
        'robot_cr5_joint_5',
        'robot_cr5_joint_6'
      ]
    })
  })

  it('fails closed for zero or multiple matching CR5 aggregates', () => {
    expect(resolveSpatialShadowRobotBinding([])).toBeNull()
    expect(resolveSpatialShadowRobotBinding([
      robotAggregate('robot-a'),
      robotAggregate('robot-b')
    ])).toBeNull()
  })

  it('aligns the read-only CR5 root from reference rail slot 4 to snapshot slot 5', () => {
    const snapshotUrl = new URL(
      '../../../../../pTLC_platformUI/.unilab/spatial-shadow/current.v0.json',
      import.meta.url
    )
    const snapshot = parseSpatialShadowSnapshot(
      readFileSync(fileURLToPath(snapshotUrl), 'utf8')
    )
    const [aligned] = alignSpatialShadowRobotBase(
      [robotAggregate()],
      'material-robot',
      snapshot
    )

    expect(aligned.placement.kind).toBe('world')
    if (aligned.placement.kind !== 'world') return
    expect(aligned.placement.pose.positionMm).toEqual([
      expect.closeTo(-331.431147, 5),
      expect.closeTo(-1.677236, 5),
      expect.closeTo(178.497249, 5)
    ])
  })
})
