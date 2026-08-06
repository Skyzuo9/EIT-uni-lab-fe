import { createStore, type StoreApi } from 'zustand/vanilla'
import type {
  WorkflowMaterialTransferRoute,
  WorkflowPanelRuntimeProjection
} from '@unilab/workflow-editor'

export interface LabInteractionState {
  selectedMaterialIds: readonly string[]
  highlightedMaterialIds: readonly string[]
  selectedSceneObjectIds: readonly string[]
  activeWorkflowPanelId: string | null
  activeWorkflowId: string | null
  activeWorkflowTaskId: string | null
  activeWorkflowRuntimeGeneration: number
  activeWorkflowMaterialTransferRoutes:
    readonly WorkflowMaterialTransferRoute[]
  selectedWorkflowStepId: string | null
  selectMaterials: (materialIds: readonly string[]) => void
  highlightMaterials: (materialIds: readonly string[]) => void
  selectSceneObjects: (sceneObjectIds: readonly string[]) => void
  activateWorkflowPanel: (panelId: string, workflowId: string) => void
  deactivateWorkflowPanel: (panelId: string) => void
  publishWorkflowRuntime: (
    panelId: string,
    projection: WorkflowPanelRuntimeProjection
  ) => void
  selectWorkflowStep: (
    panelId: string,
    workflowStepId: string | null
  ) => void
  clearInteraction: () => void
}

const EMPTY_INTERACTION = {
  selectedMaterialIds: [] as readonly string[],
  highlightedMaterialIds: [] as readonly string[],
  selectedSceneObjectIds: [] as readonly string[],
  activeWorkflowPanelId: null,
  activeWorkflowId: null,
  activeWorkflowTaskId: null,
  activeWorkflowRuntimeGeneration: 0,
  activeWorkflowMaterialTransferRoutes:
    [] as readonly WorkflowMaterialTransferRoute[],
  selectedWorkflowStepId: null
}

/**
 * 创建实验室跨面板交互 Store，只保存稳定身份、短生命周期交互意图和有界只读路线。
 *
 * @returns 新的隔离 Store；物料（Material）文档、工作流（Workflow）文档和
 * Pascal 场景仍由各自功能包拥有，不在此复制；路线只是已应用图/冻结快照的派生 DTO。
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
    /** 激活一个可见工作流面板，并重置上一面板的任务与节点身份。 */
    activateWorkflowPanel: (activeWorkflowPanelId, activeWorkflowId) => {
      const current = get()
      if (
        current.activeWorkflowPanelId === activeWorkflowPanelId &&
        current.activeWorkflowId === activeWorkflowId
      ) return
      set({
        activeWorkflowPanelId,
        activeWorkflowId,
        activeWorkflowTaskId: null,
        activeWorkflowRuntimeGeneration: 0,
        activeWorkflowMaterialTransferRoutes: [],
        selectedWorkflowStepId: null
      })
    },
    /** 仅允许当前所有者面板撤销自己发布的工作流身份。 */
    deactivateWorkflowPanel: (panelId) => {
      if (get().activeWorkflowPanelId !== panelId) return
      set({
        activeWorkflowPanelId: null,
        activeWorkflowId: null,
        activeWorkflowTaskId: null,
        activeWorkflowRuntimeGeneration: 0,
        activeWorkflowMaterialTransferRoutes: [],
        selectedWorkflowStepId: null
      })
    },
    /** 发布当前面板已读取的工作流任务（WorkflowTask）身份与投影代次。 */
    publishWorkflowRuntime: (
      panelId,
      projection
    ) => {
      const current = get()
      if (current.activeWorkflowPanelId !== panelId) return
      const activeWorkflowTaskId = projection.taskUuid
      const activeWorkflowRuntimeGeneration = projection.generation
      if (
        current.activeWorkflowTaskId === activeWorkflowTaskId &&
        current.activeWorkflowRuntimeGeneration ===
          activeWorkflowRuntimeGeneration &&
        current.activeWorkflowMaterialTransferRoutes ===
          projection.materialTransferRoutes
      ) return
      set({
        activeWorkflowTaskId,
        activeWorkflowRuntimeGeneration,
        activeWorkflowMaterialTransferRoutes: projection.materialTransferRoutes
      })
    },
    /** 发布当前所有者面板选中的工作流节点身份。 */
    selectWorkflowStep: (panelId, selectedWorkflowStepId) => {
      if (get().activeWorkflowPanelId !== panelId) return
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
