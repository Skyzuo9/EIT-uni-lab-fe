import { describe, expect, it } from 'vitest'

import {
  composePoses,
  poseToMatrix,
  relativePose,
  transformPoint
} from './geometry'

describe('material geometry', () => {
  it('uses right-handed Z-up millimetre transforms', () => {
    const matrix = poseToMatrix({
      positionMm: [100, 200, 300],
      rotationDegXYZ: [0, 0, 90]
    })

    expect(transformPoint(matrix, [10, 0, 0])).toEqual([
      100,
      210,
      300
    ])
  })

  it('round-trips a child pose through parent composition', () => {
    const parent = {
      positionMm: [100, 200, 0] as const,
      rotationDegXYZ: [0, 0, 90] as const
    }
    const child = {
      positionMm: [20, 5, 0] as const,
      rotationDegXYZ: [0, 0, -20] as const
    }

    const world = composePoses(parent, child)
    const restored = relativePose(world, parent)

    expect(restored.positionMm[0]).toBeCloseTo(20)
    expect(restored.positionMm[1]).toBeCloseTo(5)
    expect(restored.rotationDegXYZ[2]).toBeCloseTo(-20)
  })
})
