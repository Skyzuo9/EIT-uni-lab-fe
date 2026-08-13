import { describe, expect, it } from 'vitest'

import {
  labLinkPoseToThree,
  labPoseToPascal,
  pascalPoseToLab,
  threePoseToLabLink
} from './units'

describe('Pascal lab unit conversion', () => {
  it('round-trips canonical Lab poses through the Pascal basis', () => {
    const pose = {
      positionMm: [1200, -450, 900] as const,
      rotationDegXYZ: [18, -27, 133] as const
    }
    const pascal = labPoseToPascal(pose)
    expectTupleCloseTo(pascal.position, [1.2, 0.9, 0.45])

    const roundTrip = pascalPoseToLab(
      pascal.position,
      pascal.rotation
    )
    expectTupleCloseTo(roundTrip.positionMm, pose.positionMm)
    expectTupleCloseTo(
      roundTrip.rotationDegXYZ,
      pose.rotationDegXYZ
    )
  })

  it('does not change axes beneath a native URDF link', () => {
    const pose = {
      positionMm: [100, 200, 300] as const,
      rotationDegXYZ: [10, 20, 30] as const
    }
    const three = labLinkPoseToThree(pose)

    expect(three.position).toEqual([0.1, 0.2, 0.3])
    const roundTrip = threePoseToLabLink(
      three.position,
      three.rotation
    )
    expectTupleCloseTo(roundTrip.positionMm, pose.positionMm)
    expectTupleCloseTo(
      roundTrip.rotationDegXYZ,
      pose.rotationDegXYZ
    )
  })
})

function expectTupleCloseTo(
  actual: readonly number[],
  expected: readonly number[]
): void {
  for (let index = 0; index < expected.length; index += 1) {
    expect(actual[index]).toBeCloseTo(expected[index], 8)
  }
}
