import type { CSSProperties } from 'react'
import { Handle, Position } from 'reactflow'
import type { NodeProps } from 'reactflow'

import {
  isResourceSlotHandle,
  workflowMaterialRoleLabel
} from '../utils/workflowMaterialTrace'
import {
  isReadyHandle,
  workflowMaterialPortCards,
  workflowNodeShowsState,
  workflowNodeStateLabel,
  type WorkflowMaterialPortCard,
  type WorkflowNodeData
} from './WorkflowNodeCard'
import WorkflowMaterialShapeGlyph from './WorkflowMaterialShapeGlyph'
import styles from './workflow.module.scss'

/**
 * 渲染展开后的组合工作流调用（CompositeWorkflowInvocation）容器。
 *
 * 父节点本身继续承载真实输入/输出句柄；React Flow 子节点通过 `parentId`
 * 和 `extent: parent` 被约束在此边界内。物料句柄本身渲染为固定小卡片；卡片
 * 内缘另设透明的反向桥接端，使内部边从边界向内出发且不离开父节点范围。
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
  const materialPorts = workflowMaterialPortCards(
    [...(targetHandles ?? []), ...(sourceHandles ?? [])],
    data.materialHandleAccents,
    undefined,
    data.materialHandleRoles
  )
  const status = data.status || 'pending'
  return (
    <section
      className={`${styles.node} wf-node wf-node--composite-container`}
      data-workflow-node-uuid={data.id}
      data-workflow-node-kind={data.kind || 'workflow'}
      data-workflow-parent-container-uuid={data.parentContainerId}
      data-workflow-composite-expanded="true"
      data-workflow-composite-descendant-count={data.descendantCount || 0}
      aria-label={`已展开的组合工作流 ${data.name || data.id}`}
    >
      {renderBoundaryHandles(
        targetHandles,
        'target',
        targetPosition,
        data.materialHandleAccents,
        data.materialHandleRoles,
        materialPorts,
        data.materialChips
      )}
      {renderBoundaryHandles(
        sourceHandles,
        'source',
        sourcePosition,
        data.materialHandleAccents,
        data.materialHandleRoles,
        materialPorts,
        data.materialChips
      )}
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
  position: Position,
  materialHandleAccents: WorkflowNodeData['materialHandleAccents'],
  materialHandleRoles: WorkflowNodeData['materialHandleRoles'],
  materialPorts: readonly WorkflowMaterialPortCard[],
  materialChips: WorkflowNodeData['materialChips']
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
    const materialAccent = id
      ? materialHandleAccents?.[id] ?? 'var(--unilab-color-material)'
      : 'var(--unilab-color-material)'
    const materialRole = id ? materialHandleRoles?.[id] : undefined
    const materialVariable = handle?.dataKey?.trim() || handle?.handleKey
    const materialPort = materialPorts.find((candidate) =>
      candidate.targetHandle?.uuid === id || candidate.sourceHandle?.uuid === id
    )
    const materialPortHandleIds = new Set([
      materialPort?.targetHandle?.uuid,
      materialPort?.sourceHandle?.uuid
    ].filter((uuid): uuid is string => Boolean(uuid)))
    const materialChip = materialChips?.find((chip) =>
      materialPortHandleIds.has(chip.handleUuid)
    )
    const materialAccessibleLabel = materialRole
      ? `${label} · ${workflowMaterialRoleLabel(materialRole)}`
      : label
    const positionStyle = material
      ? boundaryMaterialCardPosition(
          position,
          index,
          projectedHandles.length
        )
      : boundaryHandlePosition(
          position,
          index,
          projectedHandles.length
        )
    const bridgePosition = material ? oppositePosition(position) : position
    const bridgeStyle = boundaryMaterialBridgePosition(
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
    const primaryStyle = material
      ? {
          ...positionStyle,
          '--wf-material-accent': materialAccent
        } as CSSProperties
      : positionStyle
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
        data-workflow-boundary-position={position}
        data-workflow-composite-material-port={material
          ? materialVariable
          : undefined}
        data-workflow-material-role={material ? materialRole : undefined}
        aria-label={material
          ? `${materialAccessibleLabel} 物料${ioType === 'target' ? '输入' : '输出'}端口`
          : `${label}${ioType === 'target' ? '输入' : '输出'}端口`}
        title={handle?.description || label}
        style={primaryStyle}
      >
        {material && (
          <span className="wf-node__composite-material-shape" aria-hidden="true">
            <WorkflowMaterialShapeGlyph shape={materialChip?.shape} />
          </span>
        )}
      </Handle>,
      <Handle
        key={`${ioType}:${id ?? 'default'}:bridge`}
        id={id}
        type={ioType === 'target' ? 'source' : 'target'}
        position={bridgePosition}
        className={`${className} wf-node__composite-handle--bridge`}
        data-workflow-boundary-bridge={ioType}
        aria-hidden="true"
        style={material ? bridgeStyle : positionStyle}
      />
    ]
  })
}

const MATERIAL_CARD_HALF_WIDTH = 17
const MATERIAL_CARD_HALF_HEIGHT = 14

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

/** 把物料卡片中心固定在组合容器边界上。 */
function boundaryMaterialCardPosition(
  position: Position,
  index: number,
  total: number
): CSSProperties {
  const offset = `${((index + 1) / (total + 1)) * 100}%`
  if (position === Position.Left) {
    return {
      top: offset,
      right: 'auto',
      left: 0,
      transform: 'translate(-50%, -50%)'
    }
  }
  if (position === Position.Right) {
    return {
      top: offset,
      right: 0,
      left: 'auto',
      transform: 'translate(50%, -50%)'
    }
  }
  if (position === Position.Top) {
    return {
      top: 0,
      bottom: 'auto',
      left: offset,
      transform: 'translate(-50%, -50%)'
    }
  }
  return {
    top: 'auto',
    bottom: 0,
    left: offset,
    transform: 'translate(-50%, 50%)'
  }
}

/**
 * 把反向桥接锚点放到卡片内缘，并让 React Flow 朝容器内部开始路由。
 */
function boundaryMaterialBridgePosition(
  position: Position,
  index: number,
  total: number
): CSSProperties {
  const offset = `${((index + 1) / (total + 1)) * 100}%`
  if (position === Position.Left) {
    return {
      top: offset,
      right: 'auto',
      left: MATERIAL_CARD_HALF_WIDTH,
      transform: 'translate(-50%, -50%)'
    }
  }
  if (position === Position.Right) {
    return {
      top: offset,
      right: MATERIAL_CARD_HALF_WIDTH,
      left: 'auto',
      transform: 'translate(50%, -50%)'
    }
  }
  if (position === Position.Top) {
    return {
      top: MATERIAL_CARD_HALF_HEIGHT,
      bottom: 'auto',
      left: offset,
      transform: 'translate(-50%, -50%)'
    }
  }
  return {
    top: 'auto',
    bottom: MATERIAL_CARD_HALF_HEIGHT,
    left: offset,
    transform: 'translate(-50%, 50%)'
  }
}

function oppositePosition(position: Position): Position {
  return {
    [Position.Left]: Position.Right,
    [Position.Right]: Position.Left,
    [Position.Top]: Position.Bottom,
    [Position.Bottom]: Position.Top
  }[position]
}
