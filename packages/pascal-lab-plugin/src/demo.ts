import type { LabMaterialNode } from './material'

/**
 * Offline scene mirrors Cloud graph semantics and makes the desktop renderer
 * useful before a backend Profile/laboratory has been selected.
 */
export const DEMO_LAB_MATERIAL_NODES: readonly LabMaterialNode[] = [
  {
    uuid: 'table-main',
    name: 'main_table',
    display_name: '中央实验台',
    type: 'table',
    pose: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      position_3d: { x: 0, y: 0, z: 0 },
      size: { width: 2400, height: 900, depth: 900 }
    }
  },
  {
    uuid: 'liquid-handler',
    name: 'liquid_handler',
    display_name: '液体工作站',
    type: 'liquid-handler',
    pose: {
      position: { x: -550, y: 0, z: 900 },
      rotation: { x: 0, y: 0, z: 0 },
      position_3d: { x: -550, y: 0, z: 900 },
      scale: { x: 1, y: 1, z: 1 },
      size: { width: 760, height: 620, depth: 620 }
    }
  },
  {
    uuid: 'plate-reader',
    name: 'plate_reader',
    display_name: '酶标仪',
    type: 'plate-reader',
    pose: {
      position: { x: 550, y: 0, z: 900 },
      rotation: { x: 0, y: 0, z: 0 },
      position_3d: { x: 550, y: 0, z: 900 },
      scale: { x: 1, y: 1, z: 1 },
      size: { width: 520, height: 360, depth: 480 }
    }
  }
]
