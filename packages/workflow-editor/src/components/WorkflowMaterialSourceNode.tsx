import { Handle, Position } from 'reactflow'
import type { CSSProperties, ReactNode } from 'react'
import { MaterialShapeThumbnail } from '@unilab/material'
import type { WorkflowHandlePort } from '../utils/parseWorkflow'
import type {
  WorkflowMaterialPortCard,
  WorkflowNodeData
} from './WorkflowNodeCard'
import styles from './workflow.module.scss'

interface WorkflowMaterialSourceNodeProps {
  data: WorkflowNodeData
  materialPorts: readonly WorkflowMaterialPortCard[]
  stateVisible: boolean
  stateLabel: string
  structuralTargetHandles: ReactNode
  structuralSourceHandles: ReactNode
}

/**
 * 将物料来源（MaterialSource）投影为 Linq 式起点：名称在外，六边形承载来源图标。
 *
 * @param props 节点数据、物料端口及由画布提供的结构句柄。
 * @returns 不带普通卡片边框的物料来源起点。
 */
export default function WorkflowMaterialSourceNode({
  data,
  materialPorts,
  stateVisible,
  stateLabel,
  structuralTargetHandles,
  structuralSourceHandles
}: WorkflowMaterialSourceNodeProps): React.JSX.Element {
  const sourceDescription = data.materialSource
    ? `${flowRoleLabel(data.materialSource.flowRole)} · ${
        data.materialSource.mode === 'create_new' ? '新建物料' : '已有物料'
      }`
    : '物料来源'
  return (
    <div
      className={`${styles.node} wf-node wf-node--material-source cursor-pointer overflow-visible`}
      data-workflow-node-uuid={data.id}
      data-workflow-node-kind="material_source"
      data-workflow-layout-strategy={data.layoutStrategy}
      style={{ '--wf-material-accent': data.traceAccent } as CSSProperties}
    >
      {structuralTargetHandles}
      <span className="wf-node__material-source-label">
        <strong
          data-workflow-material-source-name
          title={data.name || data.id}
        >
          {data.name || data.id}
        </strong>
        <small>{sourceDescription}</small>
      </span>
      <span
        className="wf-node__material-source-visual"
        data-workflow-material-source-visual
      >
        {data.materialSource?.shape ? (
          <MaterialShapeThumbnail shape={data.materialSource.shape} />
        ) : (
          <svg
            aria-hidden="true"
            data-material-shape-source="default"
            focusable="false"
            viewBox="0 0 48 48"
          >
            <path d="m12 20 12-6 12 6-12 6-12-6Z" />
            <path d="m12 20v8l12 6 12-6v-8" />
            <path d="m17 17.5 12 6" />
            <path d="m31 17.5-12 6" />
          </svg>
        )}
        {renderMaterialSourceHandles(materialPorts)}
      </span>
      {stateVisible && (
        <span className={`wf-node__material-source-state wf-node__state--${data.status || 'pending'}`}>
          {stateLabel}
        </span>
      )}
      {structuralSourceHandles}
    </div>
  )
}

/**
 * 把物料来源（MaterialSource）的输出物料占位符映射到六边形底边句柄。
 *
 * @param cards 已按变量合并的物料占位符端口。
 * @returns 对准六边形底边的物料流（MaterialFlow）输出句柄。
 */
function renderMaterialSourceHandles(
  cards: readonly WorkflowMaterialPortCard[]
): React.JSX.Element[] | null {
  const outputs = cards.filter((card) => card.sourceHandle)
  if (outputs.length === 0) return null
  return outputs.map((card, index) => {
    const handle = card.sourceHandle as WorkflowHandlePort
    return (
      <Handle
        key={handle.uuid}
        id={handle.uuid}
        type="source"
        position={Position.Bottom}
        className="wf-node__handle wf-node__handle--material wf-node__material-source-handle"
        data-workflow-handle-template-uuid={handle.uuid}
        data-workflow-handle-key={handle.handleKey}
        data-workflow-handle-io="source"
        data-workflow-handle-kind="material"
        aria-label={`${card.label} 物料输出端口`}
        title={handle.description || `${card.label} · 物料流`}
        style={{
          left: `${((index + 1) * 100) / (outputs.length + 1)}%`,
          '--wf-material-accent': card.accent
        } as CSSProperties}
      />
    )
  })
}

/** 将 wire 枚举转换为物料角色（MaterialRole）的中文展示名。 */
function flowRoleLabel(flowRole: string): string {
  return {
    primary_sample: '主样品',
    aliquot_sample: '分装样品',
    reagent: '试剂',
    consumable: '耗材'
  }[flowRole] || flowRole
}
