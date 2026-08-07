import { Handle, Position } from 'reactflow'
import type { CSSProperties } from 'react'

import type { WorkflowHandlePort } from '../utils/parseWorkflow'
import type { WorkflowMaterialSwimlaneDirection } from '../utils/workflowDagLayoutStrategy'
import { WORKFLOW_MATERIAL_LANE_GAP } from '../utils/workflowMaterialSwimlaneLayout'
import {
  isResourceSlotHandle,
  type WorkflowMaterialChip
} from '../utils/workflowMaterialTrace'

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
 * 渲染节点内物料占位符（ResourceSlot）标签及其泳道方向句柄。
 *
 * @param cards 已按变量合并并排序的物料端口卡片。
 * @param laneRange 节点在物料泳道中的最左与最右序号；缺省时使用紧凑排列。
 * @param direction 物料泳道从上到下或从左到右的流向。
 * @returns 物料端口容器；没有物料端口时返回空。
 */
export function renderMaterialPorts(
  cards: readonly WorkflowMaterialPortCard[],
  laneRange: { start: number; end: number } | undefined,
  direction: WorkflowMaterialSwimlaneDirection | undefined
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
      data-workflow-material-lane-direction={swimlane ? direction : undefined}
      style={swimlane
        ? direction === 'horizontal'
          ? {
              width: 128,
              height: 38 +
                (laneRange.end - laneRange.start) * WORKFLOW_MATERIAL_LANE_GAP
            }
          : {
              width: 128 +
                (laneRange.end - laneRange.start) * WORKFLOW_MATERIAL_LANE_GAP,
              height: 38
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
              ? direction === 'horizontal'
                ? {
                    top: (card.laneIndex as number - laneRange.start) *
                      WORKFLOW_MATERIAL_LANE_GAP
                  }
                : {
                    left: (card.laneIndex as number - laneRange.start) *
                      WORKFLOW_MATERIAL_LANE_GAP
                  }
              : {})
          } as CSSProperties & { '--wf-material-accent': string }}
          title={card.description}
          aria-label={card.description
            ? `${card.label}：${card.description}`
            : card.label}
        >
          {card.targetHandle && renderMaterialHandle(
            card.targetHandle,
            'target',
            card.accent,
            card.label,
            direction
          )}
          <span className="wf-node__material-port-label">{card.label}</span>
          {card.sourceHandle && renderMaterialHandle(
            card.sourceHandle,
            'source',
            card.accent,
            card.label,
            direction
          )}
        </span>
      ))}
    </span>
  )
}

/**
 * 渲染一个物料流（MaterialFlow）句柄，并按泳道方向选择节点外缘。
 *
 * @param handle OS 投影出的物料占位符（ResourceSlot）句柄。
 * @param ioType 句柄是输入端还是输出端。
 * @param accent 当前物料链的稳定强调色。
 * @param label 物料变量的中文优先展示标签。
 * @param direction 物料泳道从上到下或从左到右的流向。
 * @returns 可供 ReactFlow 连线的物料句柄元素。
 */
function renderMaterialHandle(
  handle: WorkflowHandlePort,
  ioType: 'source' | 'target',
  accent: string,
  label: string,
  direction: WorkflowMaterialSwimlaneDirection | undefined
): React.JSX.Element {
  return (
    <Handle
      key={handle.uuid}
      id={handle.uuid}
      type={ioType}
      position={direction === 'horizontal'
        ? ioType === 'target' ? Position.Left : Position.Right
        : ioType === 'target' ? Position.Top : Position.Bottom}
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

export function handlePosition(
  position: Position,
  index: number,
  count: number
): CSSProperties {
  const offset = `${((index + 1) * 100) / (count + 1)}%`
  return position === Position.Top || position === Position.Bottom
    ? { left: offset }
    : { top: offset }
}
