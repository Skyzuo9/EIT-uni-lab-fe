import { describe, expect, it } from 'vitest'

import type { MaterialAggregate } from '../types'
import {
  buildMaterialObliqueScene,
  projectObliquePoint
} from './projection'

describe('oblique material projection', () => {
  it('uses a generic 45 degree half-depth cabinet projection', () => {
    const [x, y] = projectObliquePoint([100, 200, 300])

    expect(x).toBeCloseTo(170.710678, 6)
    expect(y).toBeCloseTo(-370.710678, 6)
  })

  it('fits bounds from geometry and keeps the plan as an affine top plane', () => {
    const scene = buildMaterialObliqueScene([
      aggregate('plate', [100, 200, 30])
    ])
    const object = scene.objects[0]

    expect(object?.widthMm).toBe(127.76)
    expect(object?.depthMm).toBe(85.48)
    expect(object?.heightMm).toBe(14.4)
    expect(object?.topTransform).toHaveLength(6)
    for (const point of [...(object?.base ?? []), ...(object?.top ?? [])]) {
      expect(point[0]).toBeGreaterThanOrEqual(scene.bounds.minX)
      expect(point[0]).toBeLessThanOrEqual(
        scene.bounds.minX + scene.bounds.width
      )
      expect(point[1]).toBeGreaterThanOrEqual(scene.bounds.minY)
      expect(point[1]).toBeLessThanOrEqual(
        scene.bounds.minY + scene.bounds.height
      )
    }
  })
})

function aggregate(
  id: string,
  positionMm: readonly [number, number, number]
): MaterialAggregate {
  return {
    material: {
      id,
      sourceTemplateId: `template-${id}`,
      code: id,
      name: id,
      config: {
        rendering: {
          kind: 'plate',
          dimensionsMm: [127.76, 14.4, 85.48]
        }
      },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    },
    placement: {
      kind: 'world',
      pose: {
        positionMm,
        rotationDegXYZ: [0, 0, 0]
      }
    },
    sites: [],
    revision: 1
  }
}
