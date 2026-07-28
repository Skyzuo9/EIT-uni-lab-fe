import { describe, expect, it } from 'vitest'

import { buildMaterialGraphIndex } from './rules'
import { buildMaterialTree } from './MaterialTreeSidebar'
import { materialAggregate } from './testFixtures'

describe('buildMaterialTree', () => {
  it('derives the Cloud-style directory tree from the aggregate graph', () => {
    const host = materialAggregate('host', {
      placement: {
        kind: 'world',
        pose: {
          positionMm: [0, 0, 0],
          rotationDegXYZ: [0, 0, 0]
        }
      }
    })
    host.material.name = 'host_node'
    const device = materialAggregate('device', {
      placement: {
        kind: 'world',
        pose: {
          positionMm: [200, 0, 0],
          rotationDegXYZ: [0, 0, 0]
        }
      }
    })
    device.material.name = 'PRCXI'
    const deck = materialAggregate('deck', {
      placement: {
        kind: 'parent',
        parentId: 'device',
        anchor: { kind: 'root' },
        localPose: {
          positionMm: [0, 0, 0],
          rotationDegXYZ: [0, 0, 0]
        }
      }
    })
    deck.material.name = 'PRCXI_Deck'
    const well = materialAggregate('well-a1', {
      placement: {
        kind: 'parent',
        parentId: 'deck',
        anchor: { kind: 'root' },
        localPose: {
          positionMm: [0, 0, 0],
          rotationDegXYZ: [0, 0, 0]
        }
      },
      component: {
        kind: 'well',
        key: 'A1',
        managedByParent: true
      }
    })

    const aggregatesById = {
      host,
      device,
      deck,
      'well-a1': well
    }
    const tree = buildMaterialTree(
      aggregatesById,
      buildMaterialGraphIndex(aggregatesById).childrenByParentId
    )

    expect(tree.map((entry) => entry.aggregate.material.name)).toEqual([
      'host_node',
      'PRCXI'
    ])
    expect(tree[1].children[0].aggregate.material.name).toBe('PRCXI_Deck')
    expect(
      tree[1].children[0].children[0].aggregate.material.component
    ).toEqual({
      kind: 'well',
      key: 'A1',
      managedByParent: true
    })
  })
})
