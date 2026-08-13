import { describe, expect, it } from 'vitest'

import { projectMaterialTransferFlowEdges } from './MaterialCanvas'

describe('2D material transfer edges', () => {
  it('connects canonical warehouse nodes and preserves route styling', () => {
    const edges = projectMaterialTransferFlowEdges([{
      id: 'route-1',
      label: '烧杯转运',
      sourceMaterialId: 'source-warehouse',
      targetMaterialId: 'target-warehouse',
      sourceLabel: '源仓',
      targetLabel: 'S0721',
      status: 'planned',
      accent: '#7c3aed',
      pointsMm: [[0, 0, 0], [400, 0, 0]]
    }], [
      { id: 'source-warehouse' },
      { id: 'target-warehouse' }
    ])

    expect(edges[0]).toMatchObject({
      source: 'source-warehouse',
      sourceHandle: 'material-transfer-source',
      target: 'target-warehouse',
      targetHandle: 'material-transfer-target',
      className: 'material-transfer-edge',
      label: '源仓 → S0721',
      ariaLabel: '烧杯转运：源仓 到 S0721',
      style: {
        stroke: '#7c3aed',
        strokeDasharray: '8 6'
      }
    })
  })

  it('drops a route when either canonical warehouse is absent', () => {
    expect(projectMaterialTransferFlowEdges([{
      id: 'route-unresolved',
      label: '不可定位',
      sourceMaterialId: 'source-warehouse',
      targetMaterialId: 'missing-warehouse',
      sourceLabel: '源仓',
      targetLabel: '目标仓',
      status: 'planned',
      accent: '#7c3aed',
      pointsMm: [[0, 0, 0], [400, 0, 0]]
    }], [{ id: 'source-warehouse' }])).toEqual([])
  })
})
