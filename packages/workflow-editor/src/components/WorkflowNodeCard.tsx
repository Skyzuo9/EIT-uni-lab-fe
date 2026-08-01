/**
 * ============================================================
 * AI-GENERATED CODE METADATA
 * ============================================================
 * Model: Claude Opus 4.8
 * Generation Date: 2026-07-22
 * Prompt Summary: 自定义 ReactFlow 节点(无头部,仅名称 + 自适应方向 handle)
 * Context: 工作流 DAG 节点卡片,handle 端点跟随布局主轴
 * Human Review Status: [ ] Pending  [ ] Reviewed  [ ] Approved
 * ============================================================
 */
import { Handle, Position } from 'reactflow'
import type { NodeProps } from 'reactflow'
import type { CSSProperties } from 'react'
import type { WorkflowHandlePort } from '../utils/parseWorkflow'
import styles from './workflow.module.scss'

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
  groupKind?: 'group' | 'subworkflow'
  groupExpanded?: boolean
  descendantCount?: number
  handles?: WorkflowHandlePort[]
  onSetStart?: (nodeId: string) => void
  onToggleBreakpoint?: (nodeId: string) => void
  onToggleGroup?: (nodeId: string) => void
}

// 节点卡片:无头部，输入/输出端点位置由 DAG 布局方向决定。
export default function WorkflowNodeCard({
  data,
  targetPosition = Position.Top,
  sourcePosition = Position.Bottom
}: NodeProps<WorkflowNodeData>): React.JSX.Element {
  const targetHandles = data.handles?.filter(
    (handle) => handle.ioType === 'target'
  )
  const sourceHandles = data.handles?.filter(
    (handle) => handle.ioType === 'source'
  )
  return (
    <div
      className={`${styles.node} wf-node min-w-[150px] max-w-[220px] cursor-pointer overflow-visible rounded-[var(--unilab-radius-md)] border border-[var(--unilab-color-border)] bg-[var(--unilab-color-surface)] transition-[border-color,box-shadow] duration-200`}
      data-workflow-node-uuid={data.id}
    >
      {renderHandles(targetHandles, 'target', targetPosition)}

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
          {data.groupKind === 'subworkflow'
            ? '▣ 子工作流'
            : data.kind === 'branch'
              ? '◇ 分支节点'
              : data.kind === 'join'
                ? '◆ 汇合节点'
                : data.kind === 'group'
                  ? '▣ 节点组'
                  : '操作节点'}
        </span>
        <span
          className="wf-node__id"
          title={data.name || data.id}
        >
          {data.name || data.id}
        </span>
        {data.groupKind === 'subworkflow' && (
          <button
            type="button"
            className="wf-node__group-toggle"
            data-subworkflow-toggle
            aria-expanded={Boolean(data.groupExpanded)}
            aria-label={`${data.groupExpanded ? '折叠' : '展开'}子工作流 ${data.name || data.id}`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              data.onToggleGroup?.(data.id)
            }}
          >
            <span aria-hidden="true">{data.groupExpanded ? '▾' : '▸'}</span>
            {data.descendantCount || 0} 个内部节点
          </button>
        )}
        <span className={`wf-node__state wf-node__state--${data.status || 'pending'}`}>
          {stateLabel(data.status || 'pending')}
        </span>
        {(data.onSetStart || data.onToggleBreakpoint) && (
          <div className="wf-node__marker-actions">
            {data.onSetStart && (
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
            )}
            {data.onToggleBreakpoint && (
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
            )}
          </div>
        )}
      </div>

      {renderHandles(sourceHandles, 'source', sourcePosition)}
    </div>
  )
}

function renderHandles(
  handles: WorkflowHandlePort[] | undefined,
  ioType: 'source' | 'target',
  position: Position
): React.JSX.Element | React.JSX.Element[] {
  if (handles === undefined) {
    return (
      <Handle
        type={ioType}
        position={position}
        className="wf-node__handle"
      />
    )
  }
  return handles.map((handle, index) => (
    <Handle
      key={handle.uuid}
      id={handle.uuid}
      type={ioType}
      position={position}
      className="wf-node__handle"
      data-workflow-handle-template-uuid={handle.uuid}
      data-workflow-handle-key={handle.handleKey}
      data-workflow-handle-io={ioType}
      aria-label={`${handle.displayName} ${ioType === 'target' ? '输入' : '输出'}端口`}
      title={`${handle.handleKey} · ${handle.uuid}`}
      style={handlePosition(position, index, handles.length)}
    />
  ))
}

function handlePosition(
  position: Position,
  index: number,
  count: number
): CSSProperties {
  const offset = `${((index + 1) * 100) / (count + 1)}%`
  return position === Position.Top || position === Position.Bottom
    ? { left: offset }
    : { top: offset }
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
