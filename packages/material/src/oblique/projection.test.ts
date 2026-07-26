import { describe, expect, it } from 'vitest'

import type {
  MaterialAggregate,
  MaterialSite
} from '../types'
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

  it('renders plate data as labware and infers only empty visual shelves for a site-less hotel', () => {
    const scene = buildMaterialObliqueScene([
      aggregate('plate', [0, 0, 0]),
      aggregate('hotel', [500, 0, 0], {
        kind: 'hotel',
        dimensionsMm: [200, 700, 660]
      })
    ])
    const plate = scene.objects.find(
      (object) => object.materialId === 'plate'
    )
    const hotel = scene.objects.find(
      (object) => object.materialId === 'hotel'
    )

    expect(plate?.renderStyle).toBe('labware')
    expect(hotel?.renderStyle).toBe('stack')
    expect(hotel?.shelves).toHaveLength(11)
    expect(hotel?.shelves.every((shelf) => !shelf.occupied)).toBe(true)
  })

  it('uses authoritative stack sites and occupancy when they exist', () => {
    const scene = buildMaterialObliqueScene([
      aggregate('hotel', [0, 0, 0], {
        kind: 'hotel',
        dimensionsMm: [200, 700, 660],
        sites: [
          stackSite('slot-1', 120, false),
          stackSite('slot-2', 240, true)
        ]
      })
    ])
    const shelves = scene.objects[0]?.shelves

    expect(shelves).toHaveLength(2)
    expect(shelves?.map((shelf) => shelf.heightMm)).toEqual([120, 240])
    expect(shelves?.map((shelf) => shelf.occupied)).toEqual([
      false,
      true
    ])
    expect(shelves?.map((shelf) => shelf.label)).toEqual([
      'slot-1',
      'slot-2'
    ])
    expect(shelves?.map((shelf) => shelf.siteKey)).toEqual([
      'slot-1',
      'slot-2'
    ])
  })
})

function aggregate(
  id: string,
  positionMm: readonly [number, number, number],
  options: {
    kind?: string
    dimensionsMm?: readonly [number, number, number]
    sites?: readonly MaterialSite[]
  } = {}
): MaterialAggregate {
  const kind = options.kind ?? 'plate'
  const dimensionsMm = options.dimensionsMm ?? [127.76, 14.4, 85.48]
  return {
    material: {
      id,
      sourceTemplateId: `template-${id}`,
      code: id,
      name: id,
      config: {
        rendering: {
          kind,
          dimensionsMm
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
    sites: options.sites ?? [],
    revision: 1
  }
}

function stackSite(
  key: string,
  heightMm: number,
  occupied: boolean
): MaterialSite {
  return {
    id: `site-${key}`,
    ownerMaterialId: 'hotel',
    key,
    name: `Shelf ${key}`,
    anchor: { kind: 'root' },
    poseInAnchor: {
      positionMm: [0, 0, heightMm],
      rotationDegXYZ: [0, 0, 0]
    },
    sizeMm: [120, 80, 10],
    capacity: 1,
    allowedTemplateIds: [],
    occupiedMaterialIds: occupied ? ['plate-1'] : [],
    kind: 'site',
    shape: 'rectangle',
    visible: true,
    visual: {
      state: occupied ? 'occupied' : 'empty',
      fillFraction: 0
    }
  }
}
