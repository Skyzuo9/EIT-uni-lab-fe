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
import type { MaterialShapeSpec } from '@unilab/material'
import type { WorkflowHandlePort } from '../utils/parseWorkflow'
import type { WorkflowDagLayoutStrategy } from '../utils/workflowDagLayoutStrategy'
import { WORKFLOW_MATERIAL_LANE_GAP } from '../utils/workflowMaterialSwimlaneLayout'
import {
  isResourceSlotHandle,
  type WorkflowMaterialChip
} from '../utils/workflowMaterialTrace'
import WorkflowMaterialSourceNode from './WorkflowMaterialSourceNode'
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
  traceAccent?: string
  materialHandleAccents?: Record<string, string>
  materialChips?: WorkflowMaterialChip[]
  layoutStrategy?: WorkflowDagLayoutStrategy
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
  return (
    <div
      className={`${styles.node} wf-node wf-node--action-strip min-w-[150px] max-w-[220px] cursor-pointer overflow-visible rounded-[var(--unilab-radius-md)] border border-[var(--unilab-color-border)] bg-[var(--unilab-color-surface)] transition-[border-color,box-shadow] duration-200`}
      data-workflow-node-uuid={data.id}
      data-workflow-node-kind={data.kind || 'action'}
      data-workflow-layout-strategy={data.layoutStrategy}
    >
      {renderStructuralHandles(
        targetHandles,
        'target',
        targetPosition,
        projectedMaterialHandleIds
      )}

      {allowsDebugMarkers && (
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
      )}

      <div className="wf-node__body">
        <span className="wf-node__identity">
          <span
            className="wf-node__id"
            title={data.name || data.id}
          >
            {data.name || data.id}
          </span>
        </span>
        {renderMaterialPorts(materialPorts, data.materialLaneRange)}
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
        {workflowNodeShowsState(data.kind, data.status) && (
          <span className={`wf-node__state wf-node__state--${data.status || 'pending'}`}>
            {workflowNodeStateLabel(data.kind, data.status || 'pending')}
          </span>
        )}
        {allowsDebugMarkers && (data.onSetStart || data.onToggleBreakpoint) && (
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
        )}
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

function renderStructuralHandles(
  handles: WorkflowHandlePort[] | undefined,
  ioType: 'source' | 'target',
  position: Position,
  projectedMaterialHandleIds: ReadonlySet<string>
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
          ? { left: 'calc(100% - 18px)' }
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
export function isReadyHandle(handle: WorkflowHandlePort): boolean {
  const key = (handle.dataKey?.trim() || handle.handleKey).toLowerCase()
  const valueType = (handle.valueType ?? '').toLowerCase()
  return key === 'ready' && (
    valueType === '' ||
    valueType === 'boolean' ||
    valueType === 'bool' ||
    valueType === 'builtins.bool'
  )
}

export interface WorkflowMaterialPortCard {
  key: string
  variableName: string
  label: string
  description?: string
  accent: string
  targetHandle?: WorkflowHandlePort
  sourceHandle?: WorkflowHandlePort
  laneIndex?: number
}

/**
 * 将节点的 ResourceSlot Handle 投影为物料标签。
 *
 * @param handles 节点的输入、输出 Handle。
 * @param materialHandleAccents 按 Handle UUID 索引的物料流颜色。
 * @param materialLaneByHandle 按 Handle UUID 索引的物料泳道序号。
 * @returns 按逻辑字段合并后的物料标签；同字段输入、输出只占一项。
 */
export function workflowMaterialPortCards(
  handles: readonly WorkflowHandlePort[],
  materialHandleAccents: Record<string, string> | undefined,
  materialLaneByHandle: Record<string, number> | undefined = undefined
): WorkflowMaterialPortCard[] {
  const cards: WorkflowMaterialPortCard[] = []
  const resourceHandles = handles.filter(isResourceSlotHandle)
  const accentByVariable = new Map<string, string>()
  for (const handle of resourceHandles) {
    const accent = materialHandleAccents?.[handle.uuid]
    if (!accent) continue
    const variableName = handle.dataKey?.trim() || handle.handleKey
    if (!accentByVariable.has(variableName) || handle.ioType === 'target') {
      accentByVariable.set(variableName, accent)
    }
  }
  for (const handle of resourceHandles) {
    const variableName = handle.dataKey?.trim() || handle.handleKey
    const accent = materialHandleAccents?.[handle.uuid] ??
      accentByVariable.get(variableName)
    if (!accent) continue
    const slot = handle.ioType === 'target' ? 'targetHandle' : 'sourceHandle'
    const existing = cards.find((card) =>
      card.variableName === variableName &&
      card[slot] === undefined
    )
    if (existing) {
      existing[slot] = handle
      existing.laneIndex ??= materialLaneByHandle?.[handle.uuid]
      // 同字段输入与输出是同一个 ResourceSlot；输入侧颜色代表进入节点的
      // 既有物料身份，因此在目录数据暂时不一致时仍以输入侧为准。
      if (handle.ioType === 'target') existing.accent = accent
      existing.label = preferredMaterialPortLabel(existing, handle)
      existing.description = mergeDescriptions(
        existing.description,
        handle.description
      )
      continue
    }
    cards.push({
      key: `${variableName}:${accent}:${cards.length}`,
      variableName,
      label: handle.title || variableName || handle.displayName,
      ...(handle.description ? { description: handle.description } : {}),
      accent,
      laneIndex: materialLaneByHandle?.[handle.uuid],
      [slot]: handle
    })
  }
  return cards.sort((left, right) =>
    (left.laneIndex ?? Number.MAX_SAFE_INTEGER) -
      (right.laneIndex ?? Number.MAX_SAFE_INTEGER)
  )
}

function preferredMaterialPortLabel(
  card: WorkflowMaterialPortCard,
  handle: WorkflowHandlePort
): string {
  const target = handle.ioType === 'target'
    ? handle
    : card.targetHandle
  return target?.title || handle.title || card.variableName || handle.displayName
}

function mergeDescriptions(
  current: string | undefined,
  incoming: string | undefined
): string | undefined {
  if (!incoming || incoming === current) return current
  return current ? `${current}\n${incoming}` : incoming
}

/**
 * 渲染节点内物料占位符（ResourceSlot）标签及其南北句柄。
 *
 * @param cards 已按变量合并并排序的物料端口卡片。
 * @param laneRange 节点在物料泳道中的最左与最右序号；缺省时使用紧凑排列。
 * @returns 物料端口容器；没有物料端口时返回空。
 */
function renderMaterialPorts(
  cards: readonly WorkflowMaterialPortCard[],
  laneRange: { start: number; end: number } | undefined
): React.JSX.Element | null {
  if (cards.length === 0) return null
  const swimlane = laneRange && cards.every(
    (card) => card.laneIndex !== undefined
  )
  return (
    <span
      className="wf-node__material-ports"
      aria-label="物料变量"
      data-workflow-material-lane-start={swimlane ? laneRange.start : undefined}
      data-workflow-material-lane-end={swimlane ? laneRange.end : undefined}
      style={swimlane
        ? {
            width: 128 +
              (laneRange.end - laneRange.start) * WORKFLOW_MATERIAL_LANE_GAP
          }
        : undefined}
    >
      {cards.map((card) => (
        <span
          key={card.key}
          className="wf-node__material-port"
          data-workflow-material-port-variable={card.variableName}
          data-workflow-material-port-label={card.label}
          data-workflow-material-port-description={card.description}
          data-workflow-material-lane-index={card.laneIndex}
          style={{
            '--wf-material-accent': card.accent,
            ...(swimlane
              ? {
                  left: (card.laneIndex as number - laneRange.start) *
                    WORKFLOW_MATERIAL_LANE_GAP
                }
              : {})
          } as CSSProperties}
          title={card.description}
          aria-label={card.description
            ? `${card.label}：${card.description}`
            : card.label}
        >
          {card.targetHandle && renderMaterialHandle(
            card.targetHandle,
            'target',
            card.accent,
            card.label
          )}
          <span className="wf-node__material-port-label">{card.label}</span>
          {card.sourceHandle && renderMaterialHandle(
            card.sourceHandle,
            'source',
            card.accent,
            card.label
          )}
        </span>
      ))}
    </span>
  )
}

function renderMaterialHandle(
  handle: WorkflowHandlePort,
  ioType: 'source' | 'target',
  accent: string,
  label: string
): React.JSX.Element {
  return (
    <Handle
      key={handle.uuid}
      id={handle.uuid}
      type={ioType}
      position={ioType === 'target' ? Position.Top : Position.Bottom}
      className={`wf-node__handle wf-node__handle--material wf-node__handle--${ioType}`}
      data-workflow-handle-template-uuid={handle.uuid}
      data-workflow-handle-key={handle.handleKey}
      data-workflow-handle-io={ioType}
      data-workflow-handle-kind="material"
      aria-label={`${label} 物料${ioType === 'target' ? '输入' : '输出'}端口`}
      title={handle.description || `${label} · 物料流`}
      style={{ '--wf-material-accent': accent } as CSSProperties}
    />
  )
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
