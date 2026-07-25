import { describe, expect, it } from 'vitest'

import {
  assertCanAttach,
  assertValidMaterialGraph,
  buildMaterialGraphIndex,
  MaterialRuleError
} from './rules'
import { materialAggregate } from './testFixtures'

describe('material graph rules', () => {
  it('builds derived child and Site indexes', () => {
    const parent = materialAggregate('parent', {
      sites: [
        {
          id: 'site-1',
          ownerMaterialId: 'parent',
          key: 'deck',
          name: 'Deck',
          anchor: { kind: 'root' },
          poseInAnchor: {
            positionMm: [0, 0, 0],
            rotationDegXYZ: [0, 0, 0]
          },
          sizeMm: [100, 100, 10],
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
          positionMm: [0, 0, 0],
          rotationDegXYZ: [0, 0, 0]
        }
      }
    })

    expect(
      buildMaterialGraphIndex({ parent, child })
    ).toEqual({
      childrenByParentId: { parent: ['child'] },
      siteOwnerById: { 'site-1': 'parent' }
    })
  })

  it('rejects parent cycles', () => {
    const first = materialAggregate('first', {
      placement: {
        kind: 'parent',
        parentId: 'second',
        anchor: { kind: 'root' },
        localPose: {
          positionMm: [0, 0, 0],
          rotationDegXYZ: [0, 0, 0]
        }
      }
    })
    const second = materialAggregate('second', {
      placement: {
        kind: 'parent',
        parentId: 'first',
        anchor: { kind: 'root' },
        localPose: {
          positionMm: [0, 0, 0],
          rotationDegXYZ: [0, 0, 0]
        }
      }
    })

    expect(() =>
      assertValidMaterialGraph({ first, second })
    ).toThrow(MaterialRuleError)
  })

  it('enforces Site capacity and template allowlists', () => {
    const parent = materialAggregate('parent', {
      sites: [
        {
          id: 'site-1',
          ownerMaterialId: 'parent',
          key: 'deck',
          name: 'Deck',
          anchor: { kind: 'root' },
          poseInAnchor: {
            positionMm: [0, 0, 0],
            rotationDegXYZ: [0, 0, 0]
          },
          sizeMm: [100, 100, 10],
          capacity: 1,
          allowedTemplateIds: ['allowed-template'],
          occupiedMaterialIds: []
        }
      ]
    })
    const child = materialAggregate('child', {
      templateId: 'other-template'
    })

    expect(() =>
      assertCanAttach(parent, child, 'site-1')
    ).toThrowError(
      expect.objectContaining({ code: 'MATERIAL_TEMPLATE_NOT_ALLOWED' })
    )
  })
})
