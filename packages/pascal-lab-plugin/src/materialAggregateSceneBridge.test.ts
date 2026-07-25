import type {
  MaterialAggregate,
  MaterialPlacement,
  MaterialSite
} from '@unilab/material/domain'
import { describe, expect, it } from 'vitest'

import {
  materialAggregatesToSceneGraph,
  sceneGraphToMaterialMoves
} from './materialAggregateSceneBridge'
import { isLabDeviceNode } from './schema'

describe('Material Aggregate / Pascal bridge', () => {
  it('projects the instance rendering snapshot without copying the entity', () => {
    const robot = aggregate('robot', {
      config: {
        rendering: {
          kind: 'robot',
          dimensionsMm: [500, 700, 400],
          model: {
            path: '/assets/robot.xacro',
            attachPoints: [{ link: 'tool0' }]
          }
        }
      },
      placement: {
        kind: 'world',
        pose: {
          positionMm: [100, 200, 300],
          rotationDegXYZ: [10, 20, 30]
        }
      }
    })

    const scene = materialAggregatesToSceneGraph([robot])
    const node = scene.nodes['lab-robot']

    expect(isLabDeviceNode(node)).toBe(true)
    if (!isLabDeviceNode(node)) return
    expectTupleCloseTo(node.position, [0.1, 0.3, -0.2])
    expect(node.model).toMatchObject({
      path: '/assets/robot.xacro',
      format: 'xacro'
    })
    expect(node.model.attachPoints.map((point) => point.link)).toEqual([
      'tool0'
    ])
    expect(node).not.toHaveProperty('material')
    expect(node).not.toHaveProperty('config')
    const level = scene.nodes.level_unilab as {
      camera?: {
        position: readonly number[]
        target: readonly number[]
        mode: string
      }
    }
    expect(level.camera?.mode).toBe('perspective')
    expect(level.camera?.position[1]).toBeGreaterThan(1)
    expect(level.camera?.target[0]).toBeCloseTo(0.1, 8)
    expect(level.camera?.target[2]).toBeCloseTo(-0.2, 8)
    expect(sceneGraphToMaterialMoves(scene, [robot])).toEqual([])
  })

  it('turns a world-space Pascal drag into a canonical placement command', () => {
    const robot = aggregate('robot', {
      placement: {
        kind: 'world',
        pose: {
          positionMm: [100, 200, 300],
          rotationDegXYZ: [10, 20, 30]
        }
      }
    })
    const scene = materialAggregatesToSceneGraph([robot])
    const node = scene.nodes['lab-robot']
    if (!isLabDeviceNode(node)) throw new Error('Expected lab device')
    scene.nodes['lab-robot'] = {
      ...node,
      position: [0.2, node.position[1], node.position[2]]
    }

    const [move] = sceneGraphToMaterialMoves(scene, [robot])
    expect(move.materialId).toBe('robot')
    expect(move.placement.kind).toBe('world')
    if (move.placement.kind !== 'world') return
    expectTupleCloseTo(
      move.placement.pose.positionMm,
      [200, 200, 300]
    )
    expectTupleCloseTo(
      move.placement.pose.rotationDegXYZ,
      [10, 20, 30]
    )
  })

  it('composes a link Site for rendering and recovers its offset', () => {
    const site: MaterialSite = {
      id: 'site-tool',
      ownerMaterialId: 'robot',
      key: 'tool',
      name: 'Tool',
      anchor: { kind: 'link', linkName: 'tool0' },
      poseInAnchor: {
        positionMm: [100, 0, 0],
        rotationDegXYZ: [0, 0, 90]
      },
      sizeMm: [30, 30, 30],
      capacity: 1,
      allowedTemplateIds: [],
      occupiedMaterialIds: ['gripper']
    }
    const robot = aggregate('robot', { sites: [site] })
    const gripper = aggregate('gripper', {
      placement: {
        kind: 'site',
        parentId: 'robot',
        siteId: 'site-tool',
        offsetPose: {
          positionMm: [0, 50, 0],
          rotationDegXYZ: [0, 0, 0]
        }
      }
    })

    const scene = materialAggregatesToSceneGraph([robot, gripper])
    const node = scene.nodes['lab-gripper']
    if (!isLabDeviceNode(node)) throw new Error('Expected lab device')

    expectTupleCloseTo(node.position, [0.05, 0, 0])
    expectTupleCloseTo(node.rotation, [0, 0, Math.PI / 2])
    expect(node.attach).toEqual({
      parentDeviceId: 'lab-robot',
      parentLinkName: 'tool0',
      mountPoint: 'site-tool'
    })
    expect(node.placementRef).toMatchObject({
      kind: 'site',
      parentMaterialId: 'robot',
      siteId: 'site-tool',
      anchorKind: 'link',
      anchorLinkName: 'tool0'
    })

    scene.nodes['lab-gripper'] = {
      ...node,
      position: [0.06, 0, 0]
    }
    const [move] = sceneGraphToMaterialMoves(scene, [robot, gripper])
    expect(move.placement.kind).toBe('site')
    if (move.placement.kind !== 'site') return
    expectTupleCloseTo(
      move.placement.offsetPose.positionMm,
      [0, 40, 0]
    )
  })

  it('parents a root-anchored child to the parent scene object', () => {
    const parent = aggregate('table', {
      config: { rendering: { kind: 'table' } }
    })
    const child = aggregate('reader', {
      placement: {
        kind: 'parent',
        parentId: 'table',
        anchor: { kind: 'root' },
        localPose: {
          positionMm: [100, 200, 300],
          rotationDegXYZ: [0, 0, 0]
        }
      }
    })

    const scene = materialAggregatesToSceneGraph([parent, child])
    const node = scene.nodes['lab-reader']
    if (!isLabDeviceNode(node)) throw new Error('Expected lab device')
    expect(node.attach).toEqual({
      parentDeviceId: 'lab-table-table',
      parentLinkName: '__root__',
      mountPoint: null
    })
    expectTupleCloseTo(node.position, [0.1, 0.3, -0.2])
  })
})

function aggregate(
  id: string,
  options: {
    config?: Record<string, unknown>
    placement?: MaterialPlacement
    sites?: readonly MaterialSite[]
  } = {}
): MaterialAggregate {
  return {
    material: {
      id,
      sourceTemplateId: `template-${id}`,
      code: id,
      name: id,
      config: options.config ?? {},
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    },
    placement: options.placement ?? {
      kind: 'world',
      pose: {
        positionMm: [0, 0, 0],
        rotationDegXYZ: [0, 0, 0]
      }
    },
    sites: options.sites ?? [],
    revision: 1
  }
}

function expectTupleCloseTo(
  actual: readonly number[],
  expected: readonly number[]
): void {
  for (let index = 0; index < expected.length; index += 1) {
    expect(actual[index]).toBeCloseTo(expected[index], 8)
  }
}
