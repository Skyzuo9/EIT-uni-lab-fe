import { describe, expect, it } from 'vitest'

import {
  materialNodesToSceneGraph,
  sceneGraphToMaterialUpdates
} from './materialSceneBridge'
import { isLabDeviceNode } from './schema'

describe('material/scene bridge', () => {
  it('keeps Cloud template model and mount metadata', () => {
    const scene = materialNodesToSceneGraph([
      {
        uuid: 'robot',
        name: 'robot arm',
        display_name: '机械臂',
        type: 'robot',
        res_template_uuid: 'template-1',
        model: {
          path: '/assets/robot.xacro',
          attach_points: [
            {
              link: 'tool0',
              accept_types: ['gripper']
            }
          ]
        },
        init_param_data: {
          sites: [
            {
              parent_link: 'deck_link',
              label: 'Deck'
            }
          ]
        },
        pose: {
          position: { x: 100, y: 200, z: 300 },
          rotation: { x: 0, y: 0, z: 0 },
          position_3d: { x: 100, y: 200, z: 300 },
          size: { width: 500, height: 700, depth: 400 }
        }
      }
    ])

    const node = scene.nodes['lab-robot']
    expect(isLabDeviceNode(node)).toBe(true)
    if (!isLabDeviceNode(node)) return

    expect(node.model.format).toBe('xacro')
    expect(node.model.attachPoints.map((point) => point.link)).toEqual([
      'tool0',
      'deck_link'
    ])
    expect(node.templateUuid).toBe('template-1')
    expect(scene.rootNodeIds).toEqual(['site_unilab'])
  })

  it('turns edited Pascal transforms back into material updates', () => {
    const scene = materialNodesToSceneGraph([
      {
        uuid: 'reader',
        pose: {
          position: { x: 100, y: 200, z: 300 },
          rotation: { x: 0.1, y: 0.2, z: 0.3 },
          position_3d: { x: 100, y: 200, z: 300 },
          size: { width: 500, height: 300, depth: 400 }
        }
      }
    ])

    const updates = sceneGraphToMaterialUpdates(scene)
    expect(updates).toHaveLength(1)
    expect(updates[0].uuid).toBe('reader')
    expect(updates[0].changes.pose?.position).toEqual({
      x: 100,
      y: 200,
      z: 300
    })
    const rotation = updates[0].changes.pose?.rotation
    expect(rotation?.x).toBeCloseTo(0.1)
    expect(rotation?.y).toBeCloseTo(0.2)
    expect(rotation?.z).toBeCloseTo(0.3)
  })
})
