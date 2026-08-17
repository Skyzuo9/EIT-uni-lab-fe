import type { CSSProperties } from 'react'
import { Handle, Position } from 'reactflow'
import type { NodeProps } from 'reactflow'

import { isResourceSlotHandle } from '../utils/workflowMaterialTrace'
import {
  isReadyHandle,
  workflowNodeShowsState,
  workflowNodeStateLabel,
  type WorkflowNodeData
} from './WorkflowNodeCard'
import styles from './workflow.module.scss'

/**
 * 渲染展开后的组合工作流调用（CompositeWorkflowInvocation）容器。
 *
 * 父节点本身继续承载真实输入/输出句柄；React Flow 子节点通过 `parentId`
 * 和 `extent: parent` 被约束在此边界内。每个边界句柄额外提供同位、透明的反向
 * 桥接端，使内部边可以止于父边界，而不直接跨到父节点之外。
 */
export default function WorkflowCompositeContainer({
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
  const status = data.status || 'pending'
  return (
    <section
      className={`${styles.node} wf-node wf-node--composite-container`}
      data-workflow-node-uuid={data.id}
      data-workflow-node-kind={data.kind || 'workflow'}
      data-workflow-composite-expanded="true"
      data-workflow-composite-descendant-count={data.descendantCount || 0}
      aria-label={`已展开的组合工作流 ${data.name || data.id}`}
    >
      {renderBoundaryHandles(targetHandles, 'target', targetPosition)}
      {renderBoundaryHandles(sourceHandles, 'source', sourcePosition)}
      <header className="wf-node__composite-header">
        <span className="wf-node__composite-identity">
          <strong title={data.description?.trim() || data.name || data.id}>
            {data.name || data.id}
          </strong>
          <small>组合工作流 · {data.descendantCount || 0} 个内部节点</small>
        </span>
        {workflowNodeShowsState(data.kind, status) && (
          <span className={`wf-node__state wf-node__state--${status}`}>
            {workflowNodeStateLabel(data.kind, status)}
          </span>
        )}
        <button
          type="button"
          className="wf-node__composite-toggle nodrag"
          data-subworkflow-toggle
          aria-expanded="true"
          aria-label={`折叠子工作流 ${data.name || data.id}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation()
            data.onToggleGroup?.(data.id)
          }}
        >
          <span aria-hidden="true">▾</span>
          折叠
        </button>
      </header>
    </section>
  )
}

function renderBoundaryHandles(
  handles: WorkflowNodeData['handles'],
  ioType: 'source' | 'target',
  position: Position
): React.JSX.Element[] {
  const projectedHandles = handles === undefined
    ? [undefined]
    : handles
  return projectedHandles.flatMap((handle, index) => {
    const id = handle?.uuid
    const label = handle?.title || handle?.displayName ||
      (ioType === 'target' ? '输入' : '输出')
    const material = handle ? isResourceSlotHandle(handle) : false
    const ready = handle ? isReadyHandle(handle) : false
    const positionStyle = boundaryHandlePosition(
      position,
      index,
      projectedHandles.length
    )
    const kind = material ? 'material' : ready ? 'ready' : 'structural'
    const className = [
      'wf-node__handle',
      `wf-node__handle--${kind}`,
      'wf-node__composite-handle',
      `wf-node__composite-handle--${ioType}`
    ].join(' ')
    return [
      <Handle
        key={`${ioType}:${id ?? 'default'}:primary`}
        id={id}
        type={ioType}
        position={position}
        className={className}
        data-workflow-handle-template-uuid={id}
        data-workflow-handle-key={handle?.handleKey}
        data-workflow-handle-io={ioType}
        data-workflow-handle-kind={kind}
        aria-label={`${label}${ioType === 'target' ? '输入' : '输出'}端口`}
        title={handle?.description || label}
        style={positionStyle}
      />,
      <Handle
        key={`${ioType}:${id ?? 'default'}:bridge`}
        id={id}
        type={ioType === 'target' ? 'source' : 'target'}
        position={position}
        className={`${className} wf-node__composite-handle--bridge`}
        data-workflow-boundary-bridge={ioType}
        aria-hidden="true"
        style={positionStyle}
      />
    ]
  })
}

function boundaryHandlePosition(
  position: Position,
  index: number,
  total: number
): CSSProperties {
  const offset = `${((index + 1) / (total + 1)) * 100}%`
  return position === Position.Left || position === Position.Right
    ? { top: offset }
    : { left: offset }
}
