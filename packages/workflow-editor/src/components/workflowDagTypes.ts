import type {
  WorkflowDagLayoutStrategy,
  WorkflowMaterialSwimlaneDirection
} from '../utils/workflowDagLayoutStrategy'
import type { WorkflowLink, WorkflowNode } from '../utils/parseWorkflow'

/** 工作流（Workflow）拓扑画布的稳定输入与编辑命令接口。 */
export interface WorkflowDagProps {
  nodes: WorkflowNode[]
  links: WorkflowLink[]
  onNodeSelect: (nodeId: string) => void
  onSetStart?: (nodeId: string) => void
  onToggleBreakpoint?: (nodeId: string) => void
  nodeStates?: Readonly<Record<string, string>>
  breakpoints?: ReadonlySet<string>
  startNodeId?: string | null
  beforeStartNodeIds?: ReadonlySet<string>
  pausedBeforeNodeId?: string | null
  canBeautify?: boolean
  beautifyDisabledReason?: string
  onBeautify?: (
    strategy: WorkflowDagLayoutStrategy,
    swimlaneDirection: WorkflowMaterialSwimlaneDirection
  ) => void
  canvasMutationEnabled?: boolean
  nodePositionMutationEnabled?: boolean
  onNodePositionChange?: (
    nodeId: string,
    position: { x: number; y: number }
  ) => void
  onConnectHandles?: (connection: {
    sourceNodeUuid: string
    sourceHandleUuid: string
    targetNodeUuid: string
    targetHandleUuid: string
  }) => void
  onDeleteRequest?: (selection: {
    nodeUuids: string[]
    edgeUuids: string[]
  }) => void
}
