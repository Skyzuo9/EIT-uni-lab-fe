import WorkflowCompositeContainer from './WorkflowCompositeContainer'
import WorkflowNodeCard from './WorkflowNodeCard'
import WorkflowReactionMaterialNode from './WorkflowReactionMaterialNode'

/** ReactFlow 工作流（Workflow）节点类型目录，保持引用在渲染间稳定。 */
export const WORKFLOW_DAG_NODE_TYPES = {
  wfCompositeContainer: WorkflowCompositeContainer,
  wfNode: WorkflowNodeCard,
  wfReactionMaterial: WorkflowReactionMaterialNode
}
