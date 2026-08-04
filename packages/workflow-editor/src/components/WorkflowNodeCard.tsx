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
import type { WorkflowMaterialChip } from '../utils/workflowMaterialTrace'
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
  materialChips?: WorkflowMaterialChip[]
  materialSource?: {
    mode: string
    flowRole: string
    mountUuid: string
  }
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
  const materialSource = data.kind === 'material_source'
  const allowsDebugMarkers = workflowNodeAllowsDebugMarkers(data.kind)
  const targetHandles = data.handles?.filter(
    (handle) => handle.ioType === 'target'
  )
  const sourceHandles = data.handles?.filter(
    (handle) => handle.ioType === 'source'
  )
  return (
    <div
      className={`${styles.node} wf-node ${materialSource ? 'wf-node--material-source' : 'wf-node--action-strip'} min-w-[150px] max-w-[220px] cursor-pointer overflow-visible rounded-[var(--unilab-radius-md)] border border-[var(--unilab-color-border)] bg-[var(--unilab-color-surface)] transition-[border-color,box-shadow] duration-200`}
      data-workflow-node-uuid={data.id}
      data-workflow-node-kind={data.kind || 'action'}
      style={materialSource
        ? ({ '--wf-material-accent': data.traceAccent } as CSSProperties)
        : undefined}
    >
      {renderHandles(targetHandles, 'target', targetPosition)}

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
        {materialSource && (
          <span className="wf-node__material-glyph" aria-hidden="true">▱</span>
        )}
        {materialSource ? (
          <>
            <span className="wf-node__kind">{workflowNodeKindLabel(data.kind)}</span>
            <span
              className="wf-node__id"
              title={data.name || data.id}
            >
              {data.name || data.id}
            </span>
          </>
        ) : (
          <span className="wf-node__identity">
            <span
              className="wf-node__id"
              title={data.name || data.id}
            >
              {data.name || data.id}
            </span>
          </span>
        )}
        {materialSource && data.materialSource && (
          <span className="wf-node__material-summary">
            {flowRoleLabel(data.materialSource.flowRole)} · {' '}
            {data.materialSource.mode === 'create_new' ? '新建物料' : '已有物料'}
            <small title={data.materialSource.mountUuid}>
              挂载点 · {shortIdentity(data.materialSource.mountUuid)}
            </small>
          </span>
        )}
        {!materialSource && Boolean(data.materialChips?.length) && (
          <span className="wf-node__material-chips" aria-label="物料轨道">
            {data.materialChips?.map((chip) => (
              <span
                key={`${chip.handleUuid}:${chip.sourceNodeUuid}`}
                style={{ '--wf-material-accent': chip.accent } as CSSProperties}
                title={`${chip.label} · ${chip.sourceNodeUuid} · 端口 ${chip.handleUuid}`}
              >
                {chip.label}<small>{chip.shortIdentity}</small>
              </span>
            ))}
          </span>
        )}
        {!materialSource && (
          <span
            className="wf-node__port-summary"
            title={`${targetHandles?.length ?? 1} 个输入端口，${sourceHandles?.length ?? 1} 个输出端口`}
          >
            入 {targetHandles?.length ?? 1} · 出 {sourceHandles?.length ?? 1}
          </span>
        )}
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
          {workflowNodeStateLabel(data.kind, data.status || 'pending')}
        </span>
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

export function workflowNodeAllowsDebugMarkers(kind?: string): boolean {
  return kind !== 'material_source'
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

function flowRoleLabel(flowRole: string): string {
  return {
    primary_sample: '主样品',
    aliquot_sample: '分装样品',
    reagent: '试剂',
    consumable: '耗材'
  }[flowRole] || flowRole
}

function shortIdentity(value: string): string {
  return value ? value.replace(/-/g, '').slice(-6) : '未设置'
}
