import { describe, expect, it } from 'vitest'

import {
  pascalPoseToTopLevel,
  positionMmToThree,
  positionThreeToMm,
  topLevelPoseToPascal
} from './units'

describe('Pascal lab unit conversion', () => {
  it('round-trips ROS Z-up millimeters and Three Y-up meters', () => {
    expect(positionMmToThree([1200, -450, 900])).toEqual([
      1.2,
      0.9,
      -0.45
    ])
    expect(positionThreeToMm([1.2, 0.9, -0.45])).toEqual([
      1200,
      -450,
      900
    ])
  })

  it('preserves the Cloud top-level orientation convention', () => {
    const backendPosition: [number, number, number] = [100, 200, 300]
    const backendRotation: [number, number, number] = [0.1, 0.2, 0.3]
    const pascal = topLevelPoseToPascal(
      backendPosition,
      backendRotation
    )

    expect(pascal.position).toEqual([-0.1, 0.3, -0.2])
    const roundTrip = pascalPoseToTopLevel(
      pascal.position,
      pascal.rotation
    )
    expect(roundTrip.position).toEqual(backendPosition)
    expect(roundTrip.rotation[0]).toBeCloseTo(backendRotation[0])
    expect(roundTrip.rotation[1]).toBeCloseTo(backendRotation[1])
    expect(roundTrip.rotation[2]).toBeCloseTo(backendRotation[2])
  })
})
