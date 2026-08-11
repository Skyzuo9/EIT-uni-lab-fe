import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildMaterialGraphIndex } from './rules'
import {
  buildMaterialTree,
  filterMaterialTree,
  initialMaterialTreeOpen
} from './MaterialTreeSidebar'
import { materialAggregate } from './testFixtures'

describe('buildMaterialTree', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('starts closed on a mobile viewport and open on a desktop viewport', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('720px')
    }))
    expect(initialMaterialTreeOpen()).toBe(false)

    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    expect(initialMaterialTreeOpen()).toBe(true)
  })

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
    const deckEntry = tree[1].children[0]
    expect(deckEntry.kind).toBe('material')
    if (deckEntry.kind !== 'material') return
    expect(deckEntry.aggregate.material.name).toBe('PRCXI_Deck')
    const wellEntry = deckEntry.children[0]
    expect(wellEntry.kind).toBe('material')
    if (wellEntry.kind !== 'material') return
    expect(
      wellEntry.aggregate.material.component
    ).toEqual({
      kind: 'well',
      key: 'A1',
      managedByParent: true
    })
  })

  it('interleaves occupied Materials and empty Site rows in Site order', () => {
    const occupied = materialAggregate('occupied', {
      placement: {
        kind: 'site',
        parentId: 'warehouse',
        siteId: 'site-02',
        offsetPose: {
          positionMm: [0, 0, 0],
          rotationDegXYZ: [0, 0, 0]
        }
      }
    })
    occupied.material.name = '样品瓶'
    const warehouse = materialAggregate('warehouse', {
      sites: [
        site('site-02', 'L1B1', ['occupied']),
        site('site-01', 'L1A1', [])
      ]
    })

    const aggregatesById = { warehouse, occupied }
    const tree = buildMaterialTree(
      aggregatesById,
      buildMaterialGraphIndex(aggregatesById).childrenByParentId
    )

    expect(tree[0].children.map((entry) => entry.kind)).toEqual([
      'material',
      'empty-site'
    ])
    const occupiedEntry = tree[0].children[0]
    const emptyEntry = tree[0].children[1]
    expect(occupiedEntry.kind).toBe('material')
    expect(emptyEntry.kind).toBe('empty-site')
    if (occupiedEntry.kind !== 'material' || emptyEntry.kind !== 'empty-site') {
      return
    }
    expect(occupiedEntry.aggregate.material.name).toBe('样品瓶')
    expect(occupiedEntry.occupyingSite?.name).toBe('L1B1')
    expect(emptyEntry.site.name).toBe('L1A1')
  })

  it('按物料字段与库位名称检索，并保留命中项的祖先路径', () => {
    /** 构造仓库、样品和空库位，验证两类目录命中。 */
    const sample = materialAggregate('sample-a', {
      placement: {
        kind: 'site',
        parentId: 'warehouse',
        siteId: 'site-02',
        offsetPose: {
          positionMm: [0, 0, 0],
          rotationDegXYZ: [0, 0, 0]
        }
      }
    })
    sample.material.name = '甲醇样品'
    sample.material.code = 'MEOH-01'
    const warehouse = materialAggregate('warehouse', {
      sites: [
        site('site-02', 'L1B1', ['sample-a']),
        site('site-01', 'L1A1', [])
      ]
    })
    const aggregatesById = { warehouse, 'sample-a': sample }
    const tree = buildMaterialTree(
      aggregatesById,
      buildMaterialGraphIndex(aggregatesById).childrenByParentId
    )

    const byMaterial = filterMaterialTree(tree, 'meoh')
    expect(byMaterial).toHaveLength(1)
    expect(byMaterial[0].children).toHaveLength(1)
    expect(byMaterial[0].children[0].kind).toBe('material')

    const bySite = filterMaterialTree(tree, 'L1A1')
    expect(bySite).toHaveLength(1)
    expect(bySite[0].children).toHaveLength(1)
    expect(bySite[0].children[0].kind).toBe('empty-site')
  })
})

function site(
  id: string,
  name: string,
  occupiedMaterialIds: readonly string[]
) {
  return {
    id,
    ownerMaterialId: 'warehouse',
    key: name,
    name,
    anchor: { kind: 'root' as const },
    poseInAnchor: {
      positionMm: [0, 0, 0] as const,
      rotationDegXYZ: [0, 0, 0] as const
    },
    sizeMm: [10, 10, 10] as const,
    capacity: 1,
    allowedTemplateIds: [],
    occupiedMaterialIds
  }
}
