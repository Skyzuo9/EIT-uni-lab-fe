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
import styles from './vendor.module.scss'

// 自定义节点承载的数据
export interface WorkflowNodeData {
  id: string
  name: string
  color: string
  kind?: string
  status?: string
  breakpoint?: boolean
  startNode?: boolean
  beforeStart?: boolean
  pausedBefore?: boolean
  onSetStart?: (nodeId: string) => void
  onToggleBreakpoint?: (nodeId: string) => void
}

// 节点卡片:无头部,仅名称 + 上下 handle
export default function WorkflowNodeCard({ data }: NodeProps<WorkflowNodeData>): React.JSX.Element {
  return (
    <div
      className={`${styles.node} wf-node min-w-[150px] max-w-[220px] cursor-pointer overflow-visible rounded-lg border border-[#cbd5e1] bg-white shadow-[0_2px_8px_rgba(15,23,42,0.08)] transition-[box-shadow,transform] duration-200 hover:shadow-[0_4px_14px_rgba(15,23,42,0.14)]`}
    >
      {/* 顶部目标端点(上下流向,连入) */}
      <Handle type="target" position={Position.Left} className="wf-node__handle" />

      <div className="wf-node__body">
        <div className="wf-node__markers">
          {data.startNode && (
            <span className="wf-node__marker wf-node__marker--start">⚑ 起始点</span>
          )}
          {data.breakpoint && (
            <span className="wf-node__marker wf-node__marker--breakpoint">● 断点</span>
          )}
          {data.pausedBefore && (
            <span className="wf-node__marker wf-node__marker--paused">下一步</span>
          )}
          {data.beforeStart && (
            <span className="wf-node__marker wf-node__marker--excluded">不执行</span>
          )}
        </div>
        <span className="wf-node__kind">
          {data.kind === 'branch' ? '◇ BRANCH' : data.kind === 'join' ? '◆ JOIN' : 'ACTION'}
        </span>
        <span className="wf-node__id">{data.name || data.id}</span>
        <span className={`wf-node__state wf-node__state--${data.status || 'pending'}`}>
          {stateLabel(data.status || 'pending')}
        </span>
        <div className="wf-node__marker-actions">
          <button
            type="button"
            className={data.startNode ? 'is-active is-start' : ''}
            aria-label={`${data.startNode ? '取消' : '设为'}起始点 ${data.id}`}
            title={data.startNode ? '取消起始点' : '从此节点开始执行'}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              data.onSetStart?.(data.id)
            }}
          >
            ⚑
          </button>
          <button
            type="button"
            className={data.breakpoint ? 'is-active is-breakpoint' : ''}
            aria-label={`${data.breakpoint ? '取消' : '设置'}断点 ${data.id}`}
            title={data.breakpoint ? '取消断点' : '在此节点前暂停'}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              data.onToggleBreakpoint?.(data.id)
            }}
          >
            ●
          </button>
        </div>
      </div>

      {/* 底部源端点(上下流向,连出) */}
      <Handle type="source" position={Position.Right} className="wf-node__handle" />
    </div>
  )
}

function stateLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: '等待执行',
    ready: '已就绪',
    running: '正在运行',
    success: '执行成功',
    skipped: '已跳过',
    failed: '执行失败',
    cancelled: '已取消',
    reconciling: '状态核对中'
  }
  return labels[status] || status
}
