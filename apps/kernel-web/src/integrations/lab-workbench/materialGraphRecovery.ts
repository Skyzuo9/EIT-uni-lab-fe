import type { MaterialStore } from '@unilab/material'

/**
 * Load the material graph when the backend becomes reachable. A failed load is
 * already represented by the material store, so recovery must not leak a
 * rejected promise into React's effect queue.
 */
export async function recoverMaterialGraph(
  store: MaterialStore | null,
  isOnline: boolean
): Promise<void> {
  if (!store || !isOnline) return

  const { loadState, reset } = store.getState()
  if (loadState === 'loading') return

  // A restarted backend may project a different authoritative graph (for
  // example newly available package models). Clear the ready guard so the
  // reconnection event fetches that projection instead of retaining stale data.
  if (loadState === 'ready') reset()

  try {
    await store.getState().loadGraph()
  } catch {
    // loadGraph records loadState/error; the next connection recovery retries it.
  }
}
