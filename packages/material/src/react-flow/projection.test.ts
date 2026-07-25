import { describe, expect, it } from 'vitest'

import { materialAggregate } from '../testFixtures'
import type { MaterialAggregate } from '../types'
import {
  flowPositionToPlacement,
  MATERIAL_FLOW_SCALE,
  projectMaterialFlowNodes,
  resolveMaterialWorldPose
} from './projection'

describe('Material React Flow projection', () => {
  it('keeps entity data in the Store and projects only the Material ID', () => {
    const aggregate = materialAggregate('material-1', {
      placement: {
        kind: 'world',
        pose: {
          positionMm: [120, 40, 10],
          rotationDegXYZ: [0, 0, 30]
        }
      }
    })

    const [node] = projectMaterialFlowNodes({
      aggregatesById: { 'material-1': aggregate }
    })

    expect(node.data).toEqual({ materialId: 'material-1' })
    expect(Object.keys(node.data)).toEqual(['materialId'])
    expect(node.position).toEqual({
      x: 120 * MATERIAL_FLOW_SCALE,
      y: -40 * MATERIAL_FLOW_SCALE
    })
  })

  it('projects a rotated parent without asking React Flow to inherit rotation', () => {
    const parent = materialAggregate('parent', {
      placement: {
        kind: 'world',
        pose: {
          positionMm: [200, 100, 0],
          rotationDegXYZ: [0, 0, 90]
        }
      }
    })
    const child = materialAggregate('child', {
      placement: {
        kind: 'parent',
        parentId: 'parent',
        anchor: { kind: 'root' },
        localPose: {
          positionMm: [100, 0, 0],
          rotationDegXYZ: [0, 0, 0]
        }
      }
    })

    const nodes = projectMaterialFlowNodes({
      aggregatesById: { child, parent }
    })

    expect(nodes.map((node) => node.id)).toEqual(['parent', 'child'])
    expect(nodes[1]).toMatchObject({
      id: 'child',
      parentId: 'parent',
      position: { x: 0, y: -100 * MATERIAL_FLOW_SCALE }
    })
    expect(resolveMaterialWorldPose('child', { child, parent }).positionMm)
      .toEqual([200, 200, 0])
  })

  it('converts a dragged screen position back to the parent local frame', () => {
    const parent = materialAggregate('parent', {
      placement: {
        kind: 'world',
        pose: {
          positionMm: [200, 100, 0],
          rotationDegXYZ: [0, 0, 90]
        }
      }
    })
    const child = materialAggregate('child', {
      placement: {
        kind: 'parent',
        parentId: 'parent',
        anchor: { kind: 'root' },
        localPose: {
          positionMm: [100, 0, 0],
          rotationDegXYZ: [0, 0, 15]
        }
      }
    })

    const placement = flowPositionToPlacement({
      materialId: 'child',
      flowPosition: { x: 100 * MATERIAL_FLOW_SCALE, y: 0 },
      aggregatesById: { child, parent }
    })

    expect(placement.kind).toBe('parent')
    if (placement.kind !== 'parent') return
    expectTupleCloseTo(placement.localPose.positionMm, [0, -100, 0])
    expect(placement.localPose.rotationDegXYZ).toEqual([0, 0, 15])
  })

  it('composes a Site pose and child offset, including Site rotation', () => {
    const parent = materialAggregate('parent', {
      placement: {
        kind: 'world',
        pose: {
          positionMm: [10, 20, 30],
          rotationDegXYZ: [0, 0, 0]
        }
      },
      sites: [
        {
          id: 'site-1',
          ownerMaterialId: 'parent',
          key: 'gripper',
          name: 'Gripper',
          anchor: { kind: 'root' },
          poseInAnchor: {
            positionMm: [100, 0, 0],
            rotationDegXYZ: [0, 0, 90]
          },
          sizeMm: [20, 20, 20],
          capacity: 1,
          allowedTemplateIds: [],
          occupiedMaterialIds: ['child']
        }
      ]
    })
    const child = materialAggregate('child', {
      placement: {
        kind: 'site',
        parentId: 'parent',
        siteId: 'site-1',
        offsetPose: {
          positionMm: [10, 0, 0],
          rotationDegXYZ: [0, 0, 0]
        }
      }
    })

    const pose = resolveMaterialWorldPose('child', { child, parent })
    const childNode = projectMaterialFlowNodes({
      aggregatesById: { child, parent }
    }).find((node) => node.id === 'child')

    expectTupleCloseTo(pose.positionMm, [110, 30, 30])
    expect(childNode).toMatchObject({
      parentId: 'parent',
      position: {
        x: 100 * MATERIAL_FLOW_SCALE,
        y: -10 * MATERIAL_FLOW_SCALE
      }
    })
  })

  it('uses a drag preview without mutating or copying an aggregate', () => {
    const aggregate = materialAggregate('material-1')
    const aggregates: Record<string, MaterialAggregate> = {
      'material-1': aggregate
    }

    const [node] = projectMaterialFlowNodes({
      aggregatesById: aggregates,
      dragPreviewByMaterialId: {
        'material-1': {
          positionMm: [80, 20, 0],
          rotationDegXYZ: [0, 0, 0]
        }
      }
    })

    expect(node.position).toEqual({
      x: 80 * MATERIAL_FLOW_SCALE,
      y: -20 * MATERIAL_FLOW_SCALE
    })
    expect(aggregate.placement).toEqual({
      kind: 'world',
      pose: {
        positionMm: [0, 0, 0],
        rotationDegXYZ: [0, 0, 0]
      }
    })
  })

  it('uses a collision-free world layout for a read-only review', () => {
    const parent = materialAggregate('parent')
    const child = materialAggregate('child', {
      placement: {
        kind: 'parent',
        parentId: 'parent',
        anchor: { kind: 'root' },
        localPose: {
          positionMm: [0, 0, 0],
          rotationDegXYZ: [0, 0, 0]
        }
      }
    })

    const nodes = projectMaterialFlowNodes({
      aggregatesById: { child, parent },
      reviewLayout: true
    })

    expect(nodes.every((node) => node.parentId === undefined)).toBe(true)
    expect(nodes[0].position).not.toEqual(nodes[1].position)
  })
})

function expectTupleCloseTo(
  actual: readonly number[],
  expected: readonly number[]
): void {
  expect(actual).toHaveLength(expected.length)
  for (let index = 0; index < expected.length; index += 1) {
    expect(actual[index]).toBeCloseTo(expected[index], 8)
  }
}
