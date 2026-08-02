import type { MaterialStore, MaterialStoreState } from '@unilab/material'
import { describe, expect, it, vi } from 'vitest'

import { recoverMaterialGraph } from './materialGraphRecovery'

describe('material graph connection recovery', () => {
  it('retries a failed graph load when the backend reconnects', async () => {
    const loadGraph = vi.fn(async () => undefined)
    const store = materialStoreWithState('error', loadGraph)

    await recoverMaterialGraph(store, false)
    expect(loadGraph).not.toHaveBeenCalled()

    await recoverMaterialGraph(store, true)
    expect(loadGraph).toHaveBeenCalledTimes(1)
  })

  it('does not duplicate a graph load already in progress', async () => {
    const loadGraph = vi.fn(async () => undefined)
    const store = materialStoreWithState('loading', loadGraph)

    await recoverMaterialGraph(store, true)

    expect(loadGraph).not.toHaveBeenCalled()
  })

  it('refreshes an already loaded graph after the backend reconnects', async () => {
    const loadGraph = vi.fn(async () => undefined)
    const reset = vi.fn()
    const store = materialStoreWithState('ready', loadGraph, reset)

    await recoverMaterialGraph(store, true)

    expect(reset).toHaveBeenCalledTimes(1)
    expect(loadGraph).toHaveBeenCalledTimes(1)
  })

  it('leaves load failures in the store instead of leaking an unhandled rejection', async () => {
    const loadGraph = vi.fn(async () => {
      throw new Error('OS unavailable')
    })
    const store = materialStoreWithState('error', loadGraph)

    await expect(recoverMaterialGraph(store, true)).resolves.toBeUndefined()
  })
})

function materialStoreWithState(
  loadState: MaterialStoreState['loadState'],
  loadGraph: MaterialStoreState['loadGraph'],
  reset: MaterialStoreState['reset'] = vi.fn()
): MaterialStore {
  return {
    getState: () => ({ loadState, loadGraph, reset })
  } as unknown as MaterialStore
}
