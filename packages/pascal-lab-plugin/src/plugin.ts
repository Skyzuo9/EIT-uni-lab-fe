import {
  BuildingNode,
  LevelNode,
  SiteNode,
  loadPlugin,
  nodeRegistry,
  registerNode,
  type AnyNodeDefinition
} from '@pascal-app/core'

import {
  LabDeviceNodeSchema,
  LabTableNodeSchema,
  type LabDeviceNode,
  type LabTableNode
} from './schema'
import { buildLabFloorplan } from './floorplan'

const hierarchyRenderer = {
  kind: 'parametric' as const,
  module: () => import('./renderers/HierarchyRenderer')
}

const baseDefinitions: AnyNodeDefinition[] = [
  {
    kind: 'site',
    schemaVersion: 1,
    schema: SiteNode,
    category: 'site',
    defaults: () => ({ children: [] }),
    capabilities: {},
    dirtyTracking: false,
    presentation: {
      label: 'Site',
      icon: { kind: 'iconify', name: 'lucide:map' },
      hidden: true
    },
    renderer: hierarchyRenderer
  },
  {
    kind: 'building',
    schemaVersion: 1,
    schema: BuildingNode,
    category: 'site',
    defaults: () => ({
      children: [],
      position: [0, 0, 0],
      rotation: [0, 0, 0]
    }),
    capabilities: {},
    dirtyTracking: false,
    presentation: {
      label: 'Laboratory',
      icon: { kind: 'iconify', name: 'lucide:warehouse' },
      hidden: true
    },
    renderer: hierarchyRenderer
  },
  {
    kind: 'level',
    schemaVersion: 1,
    schema: LevelNode,
    category: 'site',
    defaults: () => ({ children: [], level: 0 }),
    capabilities: {},
    dirtyTracking: false,
    presentation: {
      label: 'Lab floor',
      icon: { kind: 'iconify', name: 'lucide:layers-3' },
      hidden: true
    },
    renderer: hierarchyRenderer
  }
] as unknown as AnyNodeDefinition[]

const labDeviceDefinition = {
  kind: 'lab-device',
  schemaVersion: 1,
  schema: LabDeviceNodeSchema,
  category: 'furnish',
  defaults: () => ({
    object: 'node' as const,
    materialNodeId: '',
    displayName: '实验设备',
    deviceType: 'custom',
    templateUuid: '',
    rosDeviceName: '',
    children: [],
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    dimensions: [0.6, 0.5, 0.6],
    model: {
      path: '',
      format: 'gltf',
      attachPoints: []
    },
    attach: {
      parentDeviceId: null,
      parentLinkName: null,
      mountPoint: null
    },
    placementRef: {
      kind: 'world',
      parentMaterialId: null,
      siteId: null,
      anchorKind: 'root',
      anchorLinkName: null
    },
    parentId: null,
    visible: true,
    metadata: {}
  }),
  capabilities: {
    movable: {
      axes: ['x', 'z'],
      gridSnap: true
    },
    rotatable: {
      axes: ['y'],
      snapAngles: [
        0,
        Math.PI / 2,
        Math.PI,
        (Math.PI * 3) / 2
      ]
    },
    selectable: { hitVolume: 'bbox' },
    deletable: false,
    duplicable: false,
    groupable: false,
    floorPlaced: {
      footprint: (node: LabDeviceNode) => ({
        dimensions: node.dimensions,
        rotation: node.rotation,
        position: node.position
      })
    },
    dragBounds: (node: LabDeviceNode) => ({
      size: node.dimensions,
      centerY: node.dimensions[1] / 2
    })
  },
  snapProfile: 'item',
  presentation: {
    label: '实验设备',
    description: 'Uni-Lab material graph device',
    icon: { kind: 'iconify', name: 'lucide:microscope' },
    paletteSection: 'furnish',
    actionMenu: true
  },
  tree: {
    label: (node: LabDeviceNode) =>
      String(node.displayName ?? node.name ?? '设备')
  },
  floorplan: buildLabFloorplan,
  renderer: {
    kind: 'parametric',
    module: () => import('./renderers/LabDeviceRenderer')
  }
} as unknown as AnyNodeDefinition

const labTableDefinition = {
  kind: 'lab-table',
  schemaVersion: 1,
  schema: LabTableNodeSchema,
  category: 'furnish',
  defaults: () => ({
    object: 'node' as const,
    materialNodeId: '',
    displayName: '工作台',
    children: [],
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    dimensions: [1.5, 0.9, 0.75],
    placementRef: {
      kind: 'world',
      parentMaterialId: null,
      siteId: null,
      anchorKind: 'root',
      anchorLinkName: null
    },
    parentId: null,
    visible: true,
    metadata: {}
  }),
  capabilities: {
    movable: {
      axes: ['x', 'z'],
      gridSnap: true
    },
    rotatable: {
      axes: ['y'],
      snapAngles: [
        0,
        Math.PI / 2,
        Math.PI,
        (Math.PI * 3) / 2
      ]
    },
    selectable: { hitVolume: 'bbox' },
    deletable: false,
    duplicable: false,
    groupable: false,
    floorPlaced: {
      footprint: (node: LabTableNode) => ({
        dimensions: node.dimensions,
        rotation: node.rotation,
        position: node.position
      })
    },
    dragBounds: (node: LabTableNode) => ({
      size: node.dimensions,
      centerY: node.dimensions[1] / 2
    })
  },
  snapProfile: 'item',
  presentation: {
    label: '工作台',
    icon: { kind: 'iconify', name: 'lucide:table-2' },
    paletteSection: 'furnish',
    actionMenu: true
  },
  tree: {
    label: (node: LabTableNode) =>
      String(node.displayName ?? node.name ?? '工作台')
  },
  floorplan: buildLabFloorplan,
  renderer: {
    kind: 'parametric',
    module: () => import('./renderers/LabTableRenderer')
  }
} as unknown as AnyNodeDefinition

let preparation: Promise<void> | null = null

/**
 * Idempotently register the Uni-Lab plugin and the three structural fallbacks
 * needed by the standalone npm editor package.
 */
export function preparePascalLabPlugin(): Promise<void> {
  preparation ??= (async () => {
    for (const definition of baseDefinitions) {
      if (!nodeRegistry.has(definition.kind)) registerNode(definition)
    }

    const missingLabDefinitions = [
      labDeviceDefinition,
      labTableDefinition
    ].filter((definition) => !nodeRegistry.has(definition.kind))

    if (missingLabDefinitions.length > 0) {
      await loadPlugin({
        id: 'unilab.lab',
        apiVersion: 1,
        nodes: missingLabDefinitions
      })
    }
  })()

  return preparation
}
