import type { NodeProps } from 'reactflow'
import type { CSSProperties } from 'react'

import type { WorkflowNodeData } from './WorkflowNodeCard'
import type { WorkflowReactionMaterialItem } from '../utils/workflowReactionMaterialProjection'

export interface WorkflowReactionMaterialNodeData extends WorkflowNodeData {
  reactionMaterials: WorkflowReactionMaterialItem[]
  reactionTargetNodeName: string
}

/**
 * 渲染类似有机反应式反应物列表的辅助物料（Material）标注。
 *
 * @param props ReactFlow 注释节点数据；不承载执行或编辑语义。
 * @returns 紧贴实际加入步骤、无支线连线的辅助物料名称列表。
 */
export default function WorkflowReactionMaterialNode({
  data
}: NodeProps<WorkflowReactionMaterialNodeData>): React.JSX.Element {
  const items = data.reactionMaterials
  return (
    <div
      className="wf-reaction-materials"
      aria-label={`${data.reactionTargetNodeName || data.name}加入：${items
        .map((item) => item.sourceNodeName)
        .join('、')}`}
    >
      {items.map((item) => (
        <div
          key={item.lineageKey}
          className="wf-reaction-materials__item"
          style={{ '--wf-material-accent': item.accent } as CSSProperties}
        >
          <span className="wf-reaction-materials__dot" aria-hidden="true" />
          <strong>{item.sourceNodeName}</strong>
          <small>{item.materialRoleLabel}</small>
        </div>
      ))}
    </div>
  )
}
