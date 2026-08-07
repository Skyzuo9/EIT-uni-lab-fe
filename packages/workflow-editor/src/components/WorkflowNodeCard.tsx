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
import type { MaterialShapeSpec } from '@unilab/material'
import type { WorkflowHandlePort } from '../utils/parseWorkflow'
import type {
  WorkflowDagLayoutStrategy,
  WorkflowMaterialSwimlaneDirection
} from '../utils/workflowDagLayoutStrategy'
import type { WorkflowMaterialChip } from '../utils/workflowMaterialTrace'
import WorkflowMaterialSourceNode from './WorkflowMaterialSourceNode'
import WorkflowTransferNode from './WorkflowTransferNode'
import type { WorkflowNodeVisualKind } from '../utils/workflowNodeVisualKind'
import {
  handlePosition,
  isReadyHandle,
  renderMaterialPorts,
  type WorkflowMaterialPortCard,
  workflowMaterialPortCards
} from './workflowNodeMaterialPorts'
import styles from './workflow.module.scss'

export {
  isReadyHandle,
  workflowMaterialPortCards,
  type WorkflowMaterialPortCard
} from './workflowNodeMaterialPorts'

/** 隐藏的转运 ready 锚点以 72px 端口内 54px 菱形的上、下尖角为中心。 */
const ROBOT_TRANSFER_READY_ANCHOR = {
  left: '36px',
  edgeInset: '3px'
} as const

// 自定义节点承载的数据
export interface WorkflowNodeData {
  id: string
  name: string
  color: string
  kind?: string
  visualKind?: WorkflowNodeVisualKind
  status?: string
  breakpoint?: boolean
  startNode?: boolean
  beforeStart?: boolean
  pausedBefore?: boolean
  groupKind?: 'group' | 'subworkflow'
  groupExpanded?: boolean
  descendantCount?: number
  handles?: WorkflowHandlePort[]
  traceAccent?: string
  materialHandleAccents?: Record<string, string>
  materialChips?: WorkflowMaterialChip[]
  layoutStrategy?: WorkflowDagLayoutStrategy
  materialLaneDirection?: WorkflowMaterialSwimlaneDirection
  materialLaneRange?: { start: number; end: number }
  materialLaneByHandle?: Record<string, number>
  materialSource?: {
    mode: string
    flowRole: string
    mountUuid: string
    resourceTemplateUuid: string
    shape?: MaterialShapeSpec
  }
  onSetStart?: (nodeId: string) => void
  onToggleBreakpoint?: (nodeId: string) => void
  onToggleGroup?: (nodeId: string) => void
}

/**
 * 渲染动作节点卡片或物料来源起点；物料来源采用外置名称与六边形视觉。
 *
 * @param props ReactFlow 节点数据与输入、输出句柄方向。
 * @returns 与节点类型匹配的可交互工作流节点。
 */
export default function WorkflowNodeCard({
  data,
  targetPosition = Position.Top,
  sourcePosition = Position.Bottom
}: NodeProps<WorkflowNodeData>): React.JSX.Element {
  const materialSource = data.kind === 'material_source'
  const allowsDebugMarkers = workflowNodeAllowsDebugMarkers(data.kind)
  const targetHandles = data.handles?.filter(
    (handle) => handle.ioType === 'target'
  )
  const sourceHandles = data.handles?.filter(
    (handle) => handle.ioType === 'source'
  )
  const materialPorts = workflowMaterialPortCards(
    [...(targetHandles ?? []), ...(sourceHandles ?? [])],
    data.materialHandleAccents,
    data.materialLaneByHandle
  )
  const projectedMaterialHandleIds = new Set(
    materialPorts.flatMap((port) => [
      port.targetHandle?.uuid,
      port.sourceHandle?.uuid
    ]).filter((uuid): uuid is string => Boolean(uuid))
  )
  if (materialSource) {
    return (
      <WorkflowMaterialSourceNode
        data={data}
        materialPorts={materialPorts}
        stateVisible={workflowNodeShowsState(data.kind, data.status)}
        stateLabel={workflowNodeStateLabel(data.kind, data.status || 'pending')}
        structuralTargetHandles={renderStructuralHandles(
          targetHandles,
          'target',
          targetPosition,
          projectedMaterialHandleIds
        )}
        structuralSourceHandles={renderStructuralHandles(
          sourceHandles,
          'source',
          sourcePosition,
          projectedMaterialHandleIds
        )}
      />
    )
  }
  if (data.visualKind === 'robot-transfer' && materialPorts.length === 1) {
    return (
      <WorkflowTransferNode
        data={data}
        materialPort={materialPorts[0]!}
        stateVisible={workflowNodeShowsState(data.kind, data.status)}
        stateLabel={workflowNodeStateLabel(data.kind, data.status || 'pending')}
        structuralTargetHandles={renderStructuralHandles(
          targetHandles,
          'target',
          targetPosition,
          projectedMaterialHandleIds,
          ROBOT_TRANSFER_READY_ANCHOR
        )}
        structuralSourceHandles={renderStructuralHandles(
          sourceHandles,
          'source',
          sourcePosition,
          projectedMaterialHandleIds,
          ROBOT_TRANSFER_READY_ANCHOR
        )}
      />
    )
  }
  return (
    <WorkflowActionNode
      data={data}
      materialPorts={materialPorts}
      targetHandles={targetHandles}
      sourceHandles={sourceHandles}
      targetPosition={targetPosition}
      sourcePosition={sourcePosition}
      projectedMaterialHandleIds={projectedMaterialHandleIds}
      allowsDebugMarkers={allowsDebugMarkers}
    />
  )
}

interface WorkflowActionNodeProps {
  data: WorkflowNodeData
  materialPorts: WorkflowMaterialPortCard[]
  targetHandles: WorkflowHandlePort[] | undefined
  sourceHandles: WorkflowHandlePort[] | undefined
  targetPosition: Position
  sourcePosition: Position
  projectedMaterialHandleIds: ReadonlySet<string>
  allowsDebugMarkers: boolean
}

/** 渲染普通动作条节点，并组合拆分后的状态与调试控件。 */
function WorkflowActionNode({
  data,
  materialPorts,
  targetHandles,
  sourceHandles,
  targetPosition,
  sourcePosition,
  projectedMaterialHandleIds,
  allowsDebugMarkers
}: WorkflowActionNodeProps): React.JSX.Element {
  return (
    <div
      className={`${styles.node} wf-node wf-node--action-strip min-w-[150px] max-w-[220px] cursor-pointer overflow-visible rounded-[var(--unilab-radius-md)] border border-[var(--unilab-color-border)] bg-[var(--unilab-color-surface)] transition-[border-color,box-shadow] duration-200`}
      data-workflow-node-uuid={data.id}
      data-workflow-node-kind={data.kind || 'action'}
      data-workflow-layout-strategy={data.layoutStrategy}
      data-workflow-layout-direction={data.materialLaneDirection}
      data-workflow-material-port-count={materialPorts.length}
      data-workflow-multi-material={materialPorts.length > 1 ? 'true' : undefined}
    >
      {renderStructuralHandles(
        targetHandles,
        'target',
        targetPosition,
        projectedMaterialHandleIds
      )}
      <WorkflowSwimlaneRail data={data} portCount={materialPorts.length} />
      <WorkflowDebugMarkers data={data} visible={allowsDebugMarkers} />
      <div className="wf-node__body">
        <WorkflowNodeIdentity data={data} />
        {renderMaterialPorts(
          materialPorts,
          data.materialLaneRange,
          data.materialLaneDirection
        )}
        <WorkflowGroupToggle data={data} />
        <WorkflowNodeState data={data} />
        <WorkflowMarkerActions data={data} visible={allowsDebugMarkers} />
      </div>
      {renderStructuralHandles(
        sourceHandles,
        'source',
        sourcePosition,
        projectedMaterialHandleIds
      )}
    </div>
  )
}

/** 在不产生多横向端口冲突时显示物料泳道（MaterialSwimlane）导轨。 */
function WorkflowSwimlaneRail({
  data,
  portCount
}: {
  data: WorkflowNodeData
  portCount: number
}): React.JSX.Element | null {
  const hiddenForHorizontalFanout =
    data.materialLaneDirection === 'horizontal' && portCount > 1
  const visible = data.layoutStrategy === 'material-swimlanes'
    && portCount > 0
    && !hiddenForHorizontalFanout
  return visible
    ? <span className="wf-node__swimlane-rail" aria-hidden="true" />
    : null
}

/** 渲染起始点、断点和调试裁剪结果标记。 */
function WorkflowDebugMarkers({
  data,
  visible
}: {
  data: WorkflowNodeData
  visible: boolean
}): React.JSX.Element | null {
  if (!visible) return null
  return (
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
  )
}

/** 渲染节点稳定显示名。 */
function WorkflowNodeIdentity({ data }: { data: WorkflowNodeData }) {
  const displayName = data.name || data.id
  return (
    <span className="wf-node__identity">
      <span className="wf-node__id" title={displayName}>{displayName}</span>
    </span>
  )
}

/** 渲染子工作流展开或折叠入口。 */
function WorkflowGroupToggle({
  data
}: {
  data: WorkflowNodeData
}): React.JSX.Element | null {
  if (data.groupKind !== 'subworkflow') return null
  const action = data.groupExpanded ? '折叠' : '展开'
  return (
    <button
      type="button"
      className="wf-node__group-toggle"
      data-subworkflow-toggle
      aria-expanded={Boolean(data.groupExpanded)}
      aria-label={`${action}子工作流 ${data.name || data.id}`}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation()
        data.onToggleGroup?.(data.id)
      }}
    >
      <span aria-hidden="true">{data.groupExpanded ? '▾' : '▸'}</span>
      {data.descendantCount || 0} 个内部节点
    </button>
  )
}

/** 渲染节点执行状态，仅隐藏默认等待态。 */
function WorkflowNodeState({
  data
}: {
  data: WorkflowNodeData
}): React.JSX.Element | null {
  if (!workflowNodeShowsState(data.kind, data.status)) return null
  const status = data.status || 'pending'
  return (
    <span className={`wf-node__state wf-node__state--${status}`}>
      {workflowNodeStateLabel(data.kind, status)}
    </span>
  )
}

/** 渲染设置起始点和断点的调试操作。 */
function WorkflowMarkerActions({
  data,
  visible
}: {
  data: WorkflowNodeData
  visible: boolean
}): React.JSX.Element | null {
  if (!visible || (!data.onSetStart && !data.onToggleBreakpoint)) return null
  return (
    <span className="wf-node__marker-actions">
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
    </span>
  )
}

/**
 * 渲染非物料结构句柄，并将就绪依赖（Ready）锚点放在所属视觉的边缘中心。
 *
 * @param handles 操作系统（OS）投影出的当前方向句柄。
 * @param ioType 当前句柄集合属于输入端还是输出端。
 * @param position 非 ready 结构句柄沿用的 React Flow 方位。
 * @param projectedMaterialHandleIds 已由物料占位符（ResourceSlot）卡片承载的句柄 UUID。
 * @param readyAnchor 特殊视觉的 ready 横向中心与边缘内缩；省略时使用节点边缘正中。
 * @returns 可供 React Flow 测量和连线的结构句柄元素。
 */
function renderStructuralHandles(
  handles: WorkflowHandlePort[] | undefined,
  ioType: 'source' | 'target',
  position: Position,
  projectedMaterialHandleIds: ReadonlySet<string>,
  readyAnchor?: Readonly<{ left: string; edgeInset: string }>
): React.JSX.Element | React.JSX.Element[] {
  if (handles === undefined) {
    return (
      <Handle
        type={ioType}
        position={position}
        className="wf-node__handle wf-node__handle--structural"
        data-workflow-handle-kind="structural"
        aria-hidden="true"
      />
    )
  }
  const structuralHandles = handles.filter(
    (handle) => !projectedMaterialHandleIds.has(handle.uuid)
  )
  return structuralHandles.map((handle, index) => {
    const ready = isReadyHandle(handle)
    const readyPosition = ioType === 'target' ? Position.Top : Position.Bottom
    return (
      <Handle
        key={handle.uuid}
        id={handle.uuid}
        type={ioType}
        position={ready ? readyPosition : position}
        className={ready
          ? `wf-node__handle wf-node__handle--ready wf-node__handle--${ioType}`
          : 'wf-node__handle wf-node__handle--structural'}
        data-workflow-handle-template-uuid={handle.uuid}
        data-workflow-handle-key={handle.handleKey}
        data-workflow-handle-io={ioType}
        data-workflow-handle-kind={ready ? 'ready' : 'structural'}
        aria-label={ready
          ? `执行顺序${ioType === 'target' ? '输入' : '输出'}端口`
          : undefined}
        aria-hidden={ready ? undefined : true}
        title={ready ? '执行顺序' : undefined}
        style={ready
          ? {
              left: readyAnchor?.left ?? '50%',
              ...(readyAnchor
                ? ioType === 'target'
                  ? { top: readyAnchor.edgeInset }
                  : { bottom: readyAnchor.edgeInset }
                : {})
            }
          : handlePosition(position, index, structuralHandles.length)}
      />
    )
  })
}

/**
 * 判断句柄是否承载动作就绪（ready）执行顺序，而非物料（Material）。
 *
 * @param handle OS 接口投影出的工作流句柄。
 * @returns 句柄是否应以南北方向的短竖线显示。
 */
export function workflowNodeAllowsDebugMarkers(kind?: string): boolean {
  return kind !== 'material_source'
}

export function workflowNodeShowsState(kind?: string, status?: string): boolean {
  return Boolean(status && status !== 'pending')
}

export function workflowNodeKindLabel(kind?: string): string {
  return kind === 'material_source'
    ? '物料来源'
    : kind === 'branch'
      ? '◇ 分支节点'
      : kind === 'join'
        ? '◆ 汇合节点'
        : kind === 'group'
          ? '▣ 节点组'
          : '操作节点'
}

export function workflowNodeStateLabel(kind: string | undefined, status: string): string {
  if (kind === 'material_source') {
    const materialLabels: Record<string, string> = {
      pending: '等待物料',
      material_waiting: '等待物料',
      success: '物料已绑定',
      material_bound: '物料已绑定',
      failed: '物料解析失败',
      material_failed: '物料解析失败',
      cancelled: '物料解析已取消',
      skipped: '未解析物料'
    }
    return materialLabels[status] || status
  }
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
