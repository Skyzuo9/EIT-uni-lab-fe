import type { WorkflowMaterialTransferRoute } from './utils/workflowMaterialTransferScene'

/** 工作流面板向宿主发布的有界只读运行投影，不包含编写图或任务文档。 */
export interface WorkflowPanelRuntimeProjection {
  taskUuid: string | null
  generation: number
  materialTransferRoutes: readonly WorkflowMaterialTransferRoute[]
}
