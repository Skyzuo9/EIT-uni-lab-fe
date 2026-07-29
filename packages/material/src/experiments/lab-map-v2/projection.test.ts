import { describe, expect, it } from 'vitest'

import { materialAggregate } from '../../testFixtures'
import { DEMO_LAB_MAP_V2 } from './fixture'
import {
  buildLabMapScene,
  worldToMapPoint
} from './projection'

describe('experimental lab map projection', () => {
  it('keeps business coordinates in millimetres and flips Y only for SVG', () => {
    expect(worldToMapPoint([1200, 800])).toEqual([1200, -800])
  })

  it('projects placed materials without changing the source aggregate', () => {
    const aggregate = materialAggregate('station', {
      placement: {
        kind: 'world',
        pose: {
          positionMm: [1200, 1600, 0],
          rotationDegXYZ: [0, 0, 90]
        }
      },
      config: {
        rendering: {
          kind: 'workstation',
          footprintMm: [1000, 600],
          dimensionsMm: [1000, 900, 600]
        }
      }
    })
    const scene = buildLabMapScene(
      DEMO_LAB_MAP_V2,
      [aggregate]
    )

    expect(scene.objects).toHaveLength(1)
    expect(scene.objects[0]).toMatchObject({
      materialId: 'station',
      footprintMm: [1000, 600],
      geometryStatus: 'authoritative',
      sourcePose: {
        positionMm: [1200, 1600, 0]
      },
      pose: {
        positionMm: [3200, 6800, 0],
        rotationDegXYZ: [0, 0, 90]
      }
    })
    expect(aggregate.placement).toMatchObject({
      kind: 'world',
      pose: { positionMm: [1200, 1600, 0] }
    })
  })

  it('excludes unplaced trees and marks missing geometry explicitly', () => {
    const unplaced = materialAggregate('unplaced', {
      placement: { kind: 'unplaced' }
    })
    const child = materialAggregate('child', {
      placement: {
        kind: 'parent',
        parentId: 'unplaced',
        anchor: { kind: 'root' },
        localPose: {
          positionMm: [100, 100, 0],
          rotationDegXYZ: [0, 0, 0]
        }
      }
    })
    const marker = materialAggregate('marker', {
      placement: {
        kind: 'world',
        pose: {
          positionMm: [500, 500, 0],
          rotationDegXYZ: [0, 0, 0]
        }
      }
    })
    const scene = buildLabMapScene(
      DEMO_LAB_MAP_V2,
      [unplaced, child, marker]
    )

    expect(scene.objects.map((object) => object.materialId))
      .toEqual(['marker'])
    expect(scene.objects[0]?.geometryStatus).toBe('missing')
  })

  it('rotates the OS world frame without mutating its relative pose', () => {
    const aggregate = materialAggregate('rotated-station', {
      placement: {
        kind: 'world',
        pose: {
          positionMm: [1000, 0, 40],
          rotationDegXYZ: [0, 0, 15]
        }
      }
    })
    const scene = buildLabMapScene(
      {
        ...DEMO_LAB_MAP_V2,
        materialFrame: {
          originMm: [2000, 3000],
          rotationDeg: 90
        }
      },
      [aggregate]
    )

    expect(scene.objects[0]?.pose.positionMm[0]).toBeCloseTo(2000)
    expect(scene.objects[0]?.pose.positionMm[1]).toBeCloseTo(4000)
    expect(scene.objects[0]?.pose.rotationDegXYZ[2]).toBe(105)
    expect(scene.objects[0]?.sourcePose.positionMm).toEqual([1000, 0, 40])
  })
})
