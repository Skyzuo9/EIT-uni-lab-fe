/**
 * ============================================================
 * AI-GENERATED CODE METADATA
 * ============================================================
 * Model: Claude Opus 4.8
 * Generation Date: 2026-07-22
 * Prompt Summary: 自定义 ReactFlow 节点(无头部,仅名称 + 上下 handle)
 * Context: 工作流 DAG 节点卡片,上下 handle 端点,上下流向
 * Human Review Status: [ ] Pending  [ ] Reviewed  [ ] Approved
 * ============================================================
 */
import { Handle, Position } from 'reactflow'
import type { NodeProps } from 'reactflow'

// 自定义节点承载的数据
export interface WorkflowNodeData {
  id: string
  name: string
  color: string
  kind?: string
  status?: string
  breakpoint?: boolean
}

// 节点卡片:无头部,仅名称 + 上下 handle
export default function WorkflowNodeCard({ data }: NodeProps<WorkflowNodeData>): React.JSX.Element {
  return (
    <div className="wf-node">
      {/* 顶部目标端点(上下流向,连入) */}
      <Handle type="target" position={Position.Left} className="wf-node__handle" />

      <div className="wf-node__body">
        <span className="wf-node__kind">
          {data.kind === 'branch' ? '◇ BRANCH' : data.kind === 'join' ? '◆ JOIN' : 'ACTION'}
        </span>
        <span className="wf-node__id">{data.name || data.id}</span>
        <span className={`wf-node__state wf-node__state--${data.status || 'pending'}`}>
          {data.breakpoint ? '● ' : ''}{data.status || 'pending'}
        </span>
      </div>

      {/* 底部源端点(上下流向,连出) */}
      <Handle type="source" position={Position.Right} className="wf-node__handle" />
    </div>
  )
}
