import { temporal } from 'zundo'
import { createStore, type StoreApi } from 'zustand/vanilla'

import type {
  MaterialAggregate,
  MaterialAuthoringAggregate,
  MaterialAuthoringSnapshot,
  MaterialId
} from './types'

interface MaterialHistoryState {
  snapshot: MaterialAuthoringSnapshot
  record: (snapshot: MaterialAuthoringSnapshot) => void
}

type MaterialHistoryStore = StoreApi<MaterialHistoryState> & {
  temporal: StoreApi<{
    pastStates: Partial<MaterialAuthoringSnapshotState>[]
    futureStates: Partial<MaterialAuthoringSnapshotState>[]
    undo: (steps?: number) => void
    redo: (steps?: number) => void
    clear: () => void
    isTracking: boolean
    pause: () => void
    resume: () => void
  }>
}

interface MaterialAuthoringSnapshotState {
  snapshot: MaterialAuthoringSnapshot
}

export interface MaterialHistory {
  record(snapshot: MaterialAuthoringSnapshot): void
  reset(snapshot: MaterialAuthoringSnapshot): void
  peekUndo(): MaterialAuthoringSnapshot | null
  peekRedo(): MaterialAuthoringSnapshot | null
  commitUndo(): MaterialAuthoringSnapshot | null
  commitRedo(): MaterialAuthoringSnapshot | null
  canUndo(): boolean
  canRedo(): boolean
  clear(): void
}

export function createMaterialHistory(
  initialSnapshot: MaterialAuthoringSnapshot = emptyAuthoringSnapshot()
): MaterialHistory {
  const store = createStore(
    temporal<MaterialHistoryState, [], [], MaterialAuthoringSnapshotState>(
      (set) => ({
        snapshot: cloneSnapshot(initialSnapshot),
        record: (snapshot) => set({ snapshot: cloneSnapshot(snapshot) })
      }),
      {
        partialize: (state) => ({ snapshot: state.snapshot }),
        equality: (past, current) =>
          JSON.stringify(past) === JSON.stringify(current)
      }
    )
  ) as MaterialHistoryStore

  return {
    record: (snapshot) => store.getState().record(snapshot),
    reset: (snapshot) => {
      const temporalState = store.temporal.getState()
      temporalState.pause()
      store.setState({ snapshot: cloneSnapshot(snapshot) })
      temporalState.clear()
      temporalState.resume()
    },
    peekUndo: () => peek(store.temporal.getState().pastStates),
    peekRedo: () => peek(store.temporal.getState().futureStates),
    commitUndo: () => {
      if (!store.temporal.getState().pastStates.length) return null
      store.temporal.getState().undo()
      return cloneSnapshot(store.getState().snapshot)
    },
    commitRedo: () => {
      if (!store.temporal.getState().futureStates.length) return null
      store.temporal.getState().redo()
      return cloneSnapshot(store.getState().snapshot)
    },
    canUndo: () => store.temporal.getState().pastStates.length > 0,
    canRedo: () => store.temporal.getState().futureStates.length > 0,
    clear: () => store.temporal.getState().clear()
  }
}

export function authoringSnapshot(
  aggregatesById: Readonly<Record<MaterialId, MaterialAggregate>>
): MaterialAuthoringSnapshot {
  const authoringById: Record<MaterialId, MaterialAuthoringAggregate> = {}
  for (const [id, aggregate] of Object.entries(aggregatesById)) {
    authoringById[id] = structuredClone({
      material: aggregate.material,
      placement: aggregate.placement,
      sites: aggregate.sites
    })
  }
  return { aggregatesById: authoringById }
}

export function emptyAuthoringSnapshot(): MaterialAuthoringSnapshot {
  return { aggregatesById: {} }
}

function peek(
  states: Partial<MaterialAuthoringSnapshotState>[]
): MaterialAuthoringSnapshot | null {
  const snapshot = states.at(-1)?.snapshot
  return snapshot ? cloneSnapshot(snapshot) : null
}

function cloneSnapshot(
  snapshot: MaterialAuthoringSnapshot
): MaterialAuthoringSnapshot {
  return structuredClone(snapshot)
}
