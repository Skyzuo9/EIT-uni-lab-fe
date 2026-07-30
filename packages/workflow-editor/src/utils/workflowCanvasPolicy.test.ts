import { describe, expect, it } from 'vitest'

import {
  READ_ONLY_WORKFLOW_CANVAS,
  visibleReadOnlyEdgeChanges,
  visibleReadOnlyNodeChanges
} from './workflowCanvasPolicy'

describe('read-only workflow canvas policy', () => {
  it('disables every mutation entry point while preserving selection', () => {
    expect(READ_ONLY_WORKFLOW_CANVAS).toEqual({
      nodesDraggable: false,
      nodesConnectable: false,
      edgesUpdatable: false,
      deleteKeyCode: null,
      connectOnClick: false
    })
  })

  it('forwards only measurement and selection node changes', () => {
    expect(
      visibleReadOnlyNodeChanges([
        { id: 'node-1', type: 'position', position: { x: 10, y: 20 } },
        { id: 'node-1', type: 'remove' },
        {
          id: 'node-1',
          type: 'dimensions',
          dimensions: { width: 220, height: 92 }
        },
        { id: 'node-1', type: 'select', selected: true }
      ])
    ).toEqual([
      {
        id: 'node-1',
        type: 'dimensions',
        dimensions: { width: 220, height: 92 }
      },
      { id: 'node-1', type: 'select', selected: true }
    ])
  })

  it('forwards only edge selection changes', () => {
    expect(
      visibleReadOnlyEdgeChanges([
        {
          type: 'add',
          item: { id: 'edge-1', source: 'node-1', target: 'node-2' }
        },
        { id: 'edge-1', type: 'remove' },
        { id: 'edge-1', type: 'select', selected: true }
      ])
    ).toEqual([{ id: 'edge-1', type: 'select', selected: true }])
  })
})
