import { createStore, type StoreApi } from 'zustand/vanilla'

export interface LabInteractionState {
  selectedMaterialIds: readonly string[]
  highlightedMaterialIds: readonly string[]
  selectedSceneObjectIds: readonly string[]
  selectedWorkflowStepId: string | null
  selectMaterials: (materialIds: readonly string[]) => void
  highlightMaterials: (materialIds: readonly string[]) => void
  selectSceneObjects: (sceneObjectIds: readonly string[]) => void
  selectWorkflowStep: (workflowStepId: string | null) => void
  clearInteraction: () => void
}

const EMPTY_INTERACTION = {
  selectedMaterialIds: [] as readonly string[],
  highlightedMaterialIds: [] as readonly string[],
  selectedSceneObjectIds: [] as readonly string[],
  selectedWorkflowStepId: null
}

/**
 * Cross-panel state contains identities and interaction intent only. Material
 * documents, workflow documents, and Pascal scene data remain owned by their
 * feature packages and are never mirrored here.
 */
export function createLabInteractionStore(): StoreApi<LabInteractionState> {
  return createStore<LabInteractionState>((set, get) => ({
    ...EMPTY_INTERACTION,
    selectMaterials: (selectedMaterialIds) => {
      if (sameIds(get().selectedMaterialIds, selectedMaterialIds)) return
      set({ selectedMaterialIds: [...selectedMaterialIds] })
    },
    highlightMaterials: (highlightedMaterialIds) => {
      if (
        sameIds(get().highlightedMaterialIds, highlightedMaterialIds)
      ) return
      set({ highlightedMaterialIds: [...highlightedMaterialIds] })
    },
    selectSceneObjects: (selectedSceneObjectIds) => {
      if (
        sameIds(get().selectedSceneObjectIds, selectedSceneObjectIds)
      ) return
      set({ selectedSceneObjectIds: [...selectedSceneObjectIds] })
    },
    selectWorkflowStep: (selectedWorkflowStepId) => {
      if (get().selectedWorkflowStepId === selectedWorkflowStepId) return
      set({ selectedWorkflowStepId })
    },
    clearInteraction: () => set(EMPTY_INTERACTION)
  }))
}

export type LabInteractionStore = ReturnType<typeof createLabInteractionStore>

function sameIds(
  left: readonly string[],
  right: readonly string[]
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  )
}
