import { describe, expect, it, vi } from 'vitest'

import { createMaterialStore } from './store'
import {
  materialAggregate,
  materialGraphPort
} from './testFixtures'
import type { MaterialCapability } from './types'

describe('material store', () => {
  it('loads authoritative aggregates and derives graph indexes', async () => {
    const parent = materialAggregate('parent')
    const child = materialAggregate('child', {
      placement: {
        kind: 'parent',
        parentId: 'parent',
        anchor: { kind: 'root' },
        localPose: {
          positionMm: [10, 20, 0],
          rotationDegXYZ: [0, 0, 0]
        }
      }
    })
    const store = createMaterialStore({
      scope: { kind: 'singleton' },
      graph: materialGraphPort({
        getGraph: async () => [parent, child]
      }),
      requireCapability: allowCapabilities('material.readGraph')
    })

    await store.getState().loadGraph()

    expect(store.getState()).toMatchObject({
      loadState: 'ready',
      graphIndex: {
        childrenByParentId: { parent: ['child'] }
      }
    })
    expect(Object.keys(store.getState().aggregatesById)).toEqual([
      'parent',
      'child'
    ])
    expect(store.getState().canUndo()).toBe(false)
  })

  it('does not add drag previews to zundo history', async () => {
    const initial = materialAggregate('robot')
    const moved = materialAggregate('robot', {
      revision: 2,
      placement: {
        kind: 'world',
        pose: {
          positionMm: [100, 200, 0],
          rotationDegXYZ: [0, 0, 0]
        }
      }
    })
    const store = createMaterialStore({
      scope: { kind: 'singleton' },
      graph: materialGraphPort({
        getGraph: async () => [initial],
        move: async () => moved
      }),
      requireCapability: allowCapabilities(
        'material.readGraph',
        'material.move'
      )
    })
    await store.getState().loadGraph()

    store.getState().setDragPreview('robot', {
      positionMm: [50, 60, 0],
      rotationDegXYZ: [0, 0, 0]
    })
    expect(store.getState().canUndo()).toBe(false)

    await store.getState().move('robot', moved.placement)
    expect(store.getState().canUndo()).toBe(true)
    expect(store.getState().dragPreviewByMaterialId.robot).toBeUndefined()
    expect(store.getState().aggregatesById.robot.revision).toBe(2)
  })

  it('checks capability before invoking the port', async () => {
    const getGraph = vi.fn()
    const store = createMaterialStore({
      scope: { kind: 'singleton' },
      graph: materialGraphPort({ getGraph }),
      requireCapability: () => {
        throw new Error('unsupported')
      }
    })

    await expect(store.getState().loadGraph()).rejects.toThrow('unsupported')
    expect(getGraph).not.toHaveBeenCalled()
  })

  it('coalesces concurrent graph loads from 2D and 3D panels', async () => {
    let resolveGraph:
      | ((aggregates: readonly ReturnType<typeof materialAggregate>[]) => void)
      | undefined
    const getGraph = vi.fn(
      () =>
        new Promise<readonly ReturnType<typeof materialAggregate>[]>(
          (resolve) => {
            resolveGraph = resolve
          }
        )
    )
    const store = createMaterialStore({
      scope: { kind: 'singleton' },
      graph: materialGraphPort({ getGraph }),
      requireCapability: allowCapabilities('material.readGraph')
    })

    const first = store.getState().loadGraph()
    const second = store.getState().loadGraph()
    expect(getGraph).toHaveBeenCalledTimes(1)
    resolveGraph?.([materialAggregate('robot')])
    await Promise.all([first, second])

    expect(store.getState().loadState).toBe('ready')
  })

  it('resets graph, previews and temporal history together', async () => {
    const initial = materialAggregate('robot')
    const moved = materialAggregate('robot', { revision: 2 })
    const store = createMaterialStore({
      scope: { kind: 'singleton' },
      graph: materialGraphPort({
        getGraph: async () => [initial],
        move: async () => moved
      }),
      requireCapability: allowCapabilities(
        'material.readGraph',
        'material.move'
      )
    })
    await store.getState().loadGraph()
    await store.getState().move('robot', moved.placement)
    store.getState().setDragPreview('robot', {
      positionMm: [1, 2, 3],
      rotationDegXYZ: [0, 0, 0]
    })

    store.getState().reset()

    expect(store.getState()).toMatchObject({
      aggregatesById: {},
      dragPreviewByMaterialId: {},
      loadState: 'idle'
    })
    expect(store.getState().canUndo()).toBe(false)
  })
})

function allowCapabilities(
  ...allowed: readonly MaterialCapability[]
): (capability: MaterialCapability) => void {
  const set = new Set(allowed)
  return (capability) => {
    if (!set.has(capability)) {
      throw new Error(`Unsupported capability: ${capability}`)
    }
  }
}
