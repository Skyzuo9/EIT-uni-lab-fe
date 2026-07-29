import type { LabMapDocument } from './types'

/**
 * Explicit experiment fixture. It is not an OS laboratory projection and is
 * never written into the Material Graph.
 */
export const DEMO_LAB_MAP_V2: LabMapDocument = {
  schemaVersion: 1,
  id: 'demo-lab-map-v2',
  name: '自动化实验室概念图',
  revision: 1,
  coordinateSystem: {
    unit: 'mm',
    axes: 'x-right-y-up-z-up',
    originMm: [0, 0]
  },
  materialFrame: {
    originMm: [2000, 5200],
    rotationDeg: 0
  },
  boundary: [
    [0, 0],
    [12000, 0],
    [12000, 7600],
    [0, 7600]
  ],
  walls: [
    {
      id: 'wall-south',
      startMm: [0, 0],
      endMm: [12000, 0],
      thicknessMm: 160
    },
    {
      id: 'wall-east',
      startMm: [12000, 0],
      endMm: [12000, 7600],
      thicknessMm: 160
    },
    {
      id: 'wall-north',
      startMm: [12000, 7600],
      endMm: [0, 7600],
      thicknessMm: 160
    },
    {
      id: 'wall-west-lower',
      startMm: [0, 0],
      endMm: [0, 2800],
      thicknessMm: 160
    },
    {
      id: 'wall-west-upper',
      startMm: [0, 4300],
      endMm: [0, 7600],
      thicknessMm: 160
    }
  ],
  openings: [
    {
      id: 'main-entry',
      kind: 'door',
      startMm: [0, 2800],
      endMm: [0, 4300]
    }
  ],
  obstacles: [
    {
      id: 'column-center',
      name: '结构柱',
      polygon: [
        [5800, 3300],
        [6300, 3300],
        [6300, 3800],
        [5800, 3800]
      ]
    }
  ],
  zones: [
    {
      id: 'zone-automation',
      name: '自动化工站区',
      kind: 'automation',
      polygon: [
        [500, 4400],
        [7200, 4400],
        [7200, 7100],
        [500, 7100]
      ],
      color: '#38bdf8'
    },
    {
      id: 'zone-manual',
      name: '人工操作区',
      kind: 'manual',
      polygon: [
        [500, 500],
        [5000, 500],
        [5000, 2700],
        [500, 2700]
      ],
      color: '#34d399'
    },
    {
      id: 'zone-service',
      name: '维护与公用工程区',
      kind: 'service',
      polygon: [
        [7900, 500],
        [11500, 500],
        [11500, 7100],
        [7900, 7100]
      ],
      color: '#fbbf24'
    }
  ],
  utilities: [
    {
      id: 'utility-power-a',
      name: '动力电源 A',
      kind: 'power',
      positionMm: [11400, 6000]
    },
    {
      id: 'utility-network-a',
      name: '工业网络 A',
      kind: 'network',
      positionMm: [11400, 5400]
    },
    {
      id: 'utility-gas-a',
      name: '气源 A',
      kind: 'gas',
      positionMm: [11400, 4800]
    }
  ],
  source: { kind: 'manual' }
}
