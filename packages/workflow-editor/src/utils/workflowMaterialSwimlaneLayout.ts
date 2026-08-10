import type { WorkflowLink, WorkflowNode } from './parseWorkflow'
import type { WorkflowMaterialSwimlaneDirection } from './workflowDagLayoutStrategy'
import { projectMaterialTraces } from './workflowMaterialTrace'

export const WORKFLOW_MATERIAL_LANE_GAP = 192
export const WORKFLOW_MATERIAL_ACTION_FIRST_HANDLE_X = 191
export const WORKFLOW_MATERIAL_ACTION_FIRST_HANDLE_Y = 56
export const WORKFLOW_VERTICAL_MATERIAL_SOURCE_HANDLE_AXIS = 148
export const WORKFLOW_HORIZONTAL_MATERIAL_SOURCE_HANDLE_AXIS = 90
export const WORKFLOW_VERTICAL_TRANSFER_NODE_HANDLE_AXIS = 140
export const WORKFLOW_HORIZONTAL_TRANSFER_NODE_HANDLE_AXIS = 90

const LANE_ORIGIN_X = 320
const LANE_ORIGIN_Y = 220
const MATERIAL_SOURCE_WIDTH = 184
const MATERIAL_SOURCE_HEIGHT = 72
const HORIZONTAL_MATERIAL_SOURCE_WIDTH = 112
const HORIZONTAL_MATERIAL_SOURCE_HEIGHT = 126
const ACTION_NODE_HEIGHT = 64
const HORIZONTAL_ACTION_NODE_WIDTH = 280
const TRANSFER_NODE_WIDTH = 176
const TRANSFER_NODE_HEIGHT = 72
const HORIZONTAL_TRANSFER_NODE_WIDTH = 120
const HORIZONTAL_TRANSFER_NODE_HEIGHT = 126
const ACTION_NODE_TRAILING_WIDTH = 150
const ACTION_NODE_MIN_WIDTH = 248
const NODE_HORIZONTAL_GAP = 36
const NODE_VERTICAL_GAP = 36
const NODE_ROW_GAP = 44
const NODE_COLUMN_GAP = 44
const LAYER_GAP = 96
const HORIZONTAL_LAYER_GAP = 120
const ORIGIN_Y = 40
const ORIGIN_X = 40

export interface WorkflowMaterialSwimlane {
  key: string
  label: string
  accent: string
  index: number
  axis: number
  x: number
  y: number
}

export interface WorkflowMaterialSwimlaneNodeLayout {
  startLane: number
  endLane: number
  width: number
  height: number
}

export interface WorkflowMaterialSwimlaneProjection {
  direction: WorkflowMaterialSwimlaneDirection
  lanes: WorkflowMaterialSwimlane[]
  nodeLayouts: Map<string, WorkflowMaterialSwimlaneNodeLayout>
  handleLaneIndexes: Map<string, Map<string, number>>
}

export interface WorkflowMaterialSwimlaneLayoutNode extends WorkflowNode {
  x: number
  y: number
}

export interface WorkflowMaterialSwimlaneLayoutResult {
  nodes: WorkflowMaterialSwimlaneLayoutNode[]
  links: WorkflowLink[]
  direction: WorkflowMaterialSwimlaneDirection
  swimlanes: WorkflowMaterialSwimlaneProjection
}

interface SizedPositionedNode {
  node: WorkflowNode
  x: number
  width: number
  height: number
}

interface HorizontallyFlowingNode {
  node: WorkflowNode
  y: number
  width: number
  height: number
}

/**
 * 把当前可见工作流（Workflow）投影为指定方向的物料泳道布局。
 *
 * 物料（Material）身份沿物料流（MaterialFlow）固定在同一条泳道轴线上；
 * 多物料动作节点横跨首尾泳道，并在旋转方向时保持物料相对顺序。
 *
 * @param nodes 已完成组合工作流折叠投影的全部可见节点。
 * @param links 已完成端点重接的执行顺序边与物料流边。
 * @param direction 物料流从上到下或从左到右的泳道方向。
 * @returns 含节点坐标、有效边、泳道目录及句柄泳道索引的布局结果。
 */
export function layoutWorkflowMaterialSwimlanes(
  nodes: readonly WorkflowNode[],
  links: readonly WorkflowLink[],
  direction: WorkflowMaterialSwimlaneDirection = 'vertical'
): WorkflowMaterialSwimlaneLayoutResult {
  const nodeIds = new Set(nodes.map((node) => node.id))
  const visibleLinks = links.filter((link) =>
    nodeIds.has(link.source) && nodeIds.has(link.target)
  )
  const traces = projectMaterialTraces(nodes, visibleLinks)
  const lanes = traces.lineages.map((lineage, index) => {
    const axis = (direction === 'vertical' ? LANE_ORIGIN_X : LANE_ORIGIN_Y) +
      index * WORKFLOW_MATERIAL_LANE_GAP
    return {
      key: lineage.key,
      label: lineage.sourceNodeName,
      accent: lineage.accent,
      index,
      axis,
      x: direction === 'vertical' ? axis : 0,
      y: direction === 'horizontal' ? axis : 0
    }
  })
  const laneIndexByKey = new Map(
    lanes.map((lane) => [lane.key, lane.index] as const)
  )
  const handleLaneIndexes = new Map<string, Map<string, number>>()
  for (const [nodeId, lineagesByHandle] of traces.handleLineagesByNode) {
    const laneIndexes = new Map<string, number>()
    for (const [handleUuid, lineageKey] of lineagesByHandle) {
      const laneIndex = laneIndexByKey.get(lineageKey)
      if (laneIndex !== undefined) laneIndexes.set(handleUuid, laneIndex)
    }
    if (laneIndexes.size > 0) handleLaneIndexes.set(nodeId, laneIndexes)
  }

  const swimlanes: WorkflowMaterialSwimlaneProjection = {
    direction,
    lanes,
    nodeLayouts: new Map(),
    handleLaneIndexes
  }
  return direction === 'horizontal'
    ? layoutHorizontalMaterialSwimlanes(nodes, visibleLinks, swimlanes)
    : layoutVerticalMaterialSwimlanes(nodes, visibleLinks, swimlanes)
}

/**
 * 生成从上到下流动、物料左右排列的泳道坐标。
 *
 * @param nodes 当前全部可见工作流节点。
 * @param visibleLinks 端点均可见的执行顺序边与物料流边。
 * @param swimlanes 已冻结物料顺序与句柄泳道索引的投影。
 * @returns 物料流句柄纵向对齐的布局结果。
 */
function layoutVerticalMaterialSwimlanes(
  nodes: readonly WorkflowNode[],
  visibleLinks: WorkflowLink[],
  swimlanes: WorkflowMaterialSwimlaneProjection
): WorkflowMaterialSwimlaneLayoutResult {
  const { lanes, nodeLayouts, handleLaneIndexes } = swimlanes
  let auxiliaryColumn = 0
  const laneRight = lanes.at(-1)?.x ?? LANE_ORIGIN_X
  const sizedNodes = nodes.map((node) => {
    const laneIndexes = [...new Set(
      handleLaneIndexes.get(node.id)?.values() ?? []
    )]
    if (node.type === 'material_source' && laneIndexes.length > 0) {
      const laneIndex = Math.min(...laneIndexes)
      return {
        node,
        x: lanes[laneIndex]!.x - WORKFLOW_VERTICAL_MATERIAL_SOURCE_HANDLE_AXIS,
        width: MATERIAL_SOURCE_WIDTH,
        height: MATERIAL_SOURCE_HEIGHT
      }
    }
    if (node.visualKind === 'robot-transfer' && laneIndexes.length === 1) {
      const laneIndex = laneIndexes[0]!
      nodeLayouts.set(node.id, {
        startLane: laneIndex,
        endLane: laneIndex,
        width: TRANSFER_NODE_WIDTH,
        height: TRANSFER_NODE_HEIGHT
      })
      return {
        node,
        x: lanes[laneIndex]!.x - WORKFLOW_VERTICAL_TRANSFER_NODE_HANDLE_AXIS,
        width: TRANSFER_NODE_WIDTH,
        height: TRANSFER_NODE_HEIGHT
      }
    }
    if (laneIndexes.length > 0) {
      const startLane = Math.min(...laneIndexes)
      const endLane = Math.max(...laneIndexes)
      const width = WORKFLOW_MATERIAL_ACTION_FIRST_HANDLE_X +
        (endLane - startLane) * WORKFLOW_MATERIAL_LANE_GAP +
        ACTION_NODE_TRAILING_WIDTH
      nodeLayouts.set(node.id, {
        startLane,
        endLane,
        width,
        height: ACTION_NODE_HEIGHT
      })
      return {
        node,
        x: lanes[startLane]!.x - WORKFLOW_MATERIAL_ACTION_FIRST_HANDLE_X,
        width,
        height: ACTION_NODE_HEIGHT
      }
    }
    const column = auxiliaryColumn
    auxiliaryColumn += 1
    return {
      node,
      x: laneRight + 250 + column * (ACTION_NODE_MIN_WIDTH + NODE_HORIZONTAL_GAP),
      width: ACTION_NODE_MIN_WIDTH,
      height: ACTION_NODE_HEIGHT
    }
  })

  const layerByNode = workflowLayers(nodes, visibleLinks)
  const nodesByLayer = new Map<number, SizedPositionedNode[]>()
  for (const sizedNode of sizedNodes) {
    const layer = layerByNode.get(sizedNode.node.id) ?? 0
    nodesByLayer.set(layer, [...(nodesByLayer.get(layer) ?? []), sizedNode])
  }
  const yByNode = new Map<string, number>()
  let y = ORIGIN_Y
  for (const [, layerNodes] of [...nodesByLayer.entries()].sort(
    ([left], [right]) => left - right
  )) {
    const rows = packNonOverlappingRows(layerNodes)
    for (const row of rows) {
      const rowHeight = Math.max(...row.map((item) => item.height))
      for (const item of row) yByNode.set(item.node.id, y)
      y += rowHeight + NODE_ROW_GAP
    }
    y += LAYER_GAP - NODE_ROW_GAP
  }

  return {
    nodes: sizedNodes.map(({ node, x }) => ({
      ...node,
      x,
      y: yByNode.get(node.id) ?? ORIGIN_Y
    })),
    links: visibleLinks,
    direction: 'vertical',
    swimlanes
  }
}

/**
 * 生成从左到右流动、物料上下排列的泳道坐标。
 *
 * 多物料操作（Action）在纵向横跨所使用的全部物料泳道；同一拓扑层中
 * 发生纵向碰撞的节点会进入相邻子列，避免改变物料的上下顺序。
 *
 * @param nodes 当前全部可见工作流节点。
 * @param visibleLinks 端点均可见的执行顺序边与物料流边。
 * @param swimlanes 已冻结物料顺序与句柄泳道索引的投影。
 * @returns 物料流句柄横向对齐的布局结果。
 */
function layoutHorizontalMaterialSwimlanes(
  nodes: readonly WorkflowNode[],
  visibleLinks: WorkflowLink[],
  swimlanes: WorkflowMaterialSwimlaneProjection
): WorkflowMaterialSwimlaneLayoutResult {
  const { lanes, nodeLayouts, handleLaneIndexes } = swimlanes
  let auxiliaryRow = 0
  const laneBottom = lanes.at(-1)?.axis ?? LANE_ORIGIN_Y
  const sizedNodes = nodes.map((node): HorizontallyFlowingNode => {
    const laneIndexes = [...new Set(
      handleLaneIndexes.get(node.id)?.values() ?? []
    )]
    if (node.type === 'material_source' && laneIndexes.length > 0) {
      const laneIndex = Math.min(...laneIndexes)
      return {
        node,
        y: lanes[laneIndex]!.axis -
          WORKFLOW_HORIZONTAL_MATERIAL_SOURCE_HANDLE_AXIS,
        width: HORIZONTAL_MATERIAL_SOURCE_WIDTH,
        height: HORIZONTAL_MATERIAL_SOURCE_HEIGHT
      }
    }
    if (node.visualKind === 'robot-transfer' && laneIndexes.length === 1) {
      const laneIndex = laneIndexes[0]!
      nodeLayouts.set(node.id, {
        startLane: laneIndex,
        endLane: laneIndex,
        width: HORIZONTAL_TRANSFER_NODE_WIDTH,
        height: HORIZONTAL_TRANSFER_NODE_HEIGHT
      })
      return {
        node,
        y: lanes[laneIndex]!.axis - WORKFLOW_HORIZONTAL_TRANSFER_NODE_HANDLE_AXIS,
        width: HORIZONTAL_TRANSFER_NODE_WIDTH,
        height: HORIZONTAL_TRANSFER_NODE_HEIGHT
      }
    }
    if (laneIndexes.length > 0) {
      const startLane = Math.min(...laneIndexes)
      const endLane = Math.max(...laneIndexes)
      const height = WORKFLOW_MATERIAL_ACTION_FIRST_HANDLE_Y * 2 +
        (endLane - startLane) * WORKFLOW_MATERIAL_LANE_GAP
      nodeLayouts.set(node.id, {
        startLane,
        endLane,
        width: HORIZONTAL_ACTION_NODE_WIDTH,
        height
      })
      return {
        node,
        y: lanes[startLane]!.axis - WORKFLOW_MATERIAL_ACTION_FIRST_HANDLE_Y,
        width: HORIZONTAL_ACTION_NODE_WIDTH,
        height
      }
    }
    const row = auxiliaryRow
    auxiliaryRow += 1
    return {
      node,
      y: laneBottom + 180 + row * (ACTION_NODE_HEIGHT + NODE_VERTICAL_GAP),
      width: ACTION_NODE_MIN_WIDTH,
      height: ACTION_NODE_HEIGHT
    }
  })

  const layerByNode = workflowLayers(nodes, visibleLinks)
  const nodesByLayer = new Map<number, HorizontallyFlowingNode[]>()
  for (const sizedNode of sizedNodes) {
    const layer = layerByNode.get(sizedNode.node.id) ?? 0
    nodesByLayer.set(layer, [...(nodesByLayer.get(layer) ?? []), sizedNode])
  }
  const xByNode = new Map<string, number>()
  let x = ORIGIN_X
  for (const [, layerNodes] of [...nodesByLayer.entries()].sort(
    ([left], [right]) => left - right
  )) {
    const columns = packNonOverlappingColumns(layerNodes)
    for (const column of columns) {
      const columnWidth = Math.max(...column.map((item) => item.width))
      for (const item of column) xByNode.set(item.node.id, x)
      x += columnWidth + NODE_COLUMN_GAP
    }
    x += HORIZONTAL_LAYER_GAP - NODE_COLUMN_GAP
  }

  return {
    nodes: sizedNodes.map(({ node, y }) => ({
      ...node,
      x: xByNode.get(node.id) ?? ORIGIN_X,
      y
    })),
    links: visibleLinks,
    direction: 'horizontal',
    swimlanes
  }
}

/**
 * 把同一拓扑层中会发生水平碰撞的节点分配到不同子行。
 *
 * @param nodes 已计算水平位置和估算尺寸的同层节点。
 * @returns 按纵向显示顺序排列、每行内部互不重叠的节点集合。
 */
function packNonOverlappingRows(
  nodes: readonly SizedPositionedNode[]
): SizedPositionedNode[][] {
  const rows: SizedPositionedNode[][] = []
  for (const node of [...nodes].sort((left, right) =>
    left.x - right.x || left.node.id.localeCompare(right.node.id)
  )) {
    const available = rows.find((row) => row.every((candidate) =>
      candidate.x + candidate.width + NODE_HORIZONTAL_GAP <= node.x ||
      node.x + node.width + NODE_HORIZONTAL_GAP <= candidate.x
    ))
    if (available) available.push(node)
    else rows.push([node])
  }
  return rows
}

/**
 * 把同一拓扑层中会发生纵向碰撞的节点分配到不同子列。
 *
 * @param nodes 已计算纵向位置和估算尺寸的同层节点。
 * @returns 按横向显示顺序排列、每列内部互不重叠的节点集合。
 */
function packNonOverlappingColumns(
  nodes: readonly HorizontallyFlowingNode[]
): HorizontallyFlowingNode[][] {
  const columns: HorizontallyFlowingNode[][] = []
  for (const node of [...nodes].sort((left, right) =>
    left.y - right.y || left.node.id.localeCompare(right.node.id)
  )) {
    const available = columns.find((column) => column.every((candidate) =>
      candidate.y + candidate.height + NODE_VERTICAL_GAP <= node.y ||
      node.y + node.height + NODE_VERTICAL_GAP <= candidate.y
    ))
    if (available) available.push(node)
    else columns.push([node])
  }
  return columns
}

/**
 * 按全部可见边计算稳定的最长路径层级。
 *
 * @param nodes 当前全部可见工作流节点。
 * @param links 当前全部可见执行顺序边与物料流边。
 * @returns 节点 UUID 到纵向层号的映射；循环依赖回退到根层。
 */
function workflowLayers(
  nodes: readonly WorkflowNode[],
  links: readonly WorkflowLink[]
): Map<string, number> {
  const incoming = new Map(nodes.map((node) => [node.id, [] as string[]]))
  for (const link of links) incoming.get(link.target)?.push(link.source)
  const layers = new Map<string, number>()
  const visiting = new Set<string>()
  const resolveLayer = (nodeId: string): number => {
    const cached = layers.get(nodeId)
    if (cached !== undefined) return cached
    if (visiting.has(nodeId)) return 0
    visiting.add(nodeId)
    const predecessors = incoming.get(nodeId) ?? []
    const layer = predecessors.length === 0
      ? 0
      : Math.max(...predecessors.map(resolveLayer)) + 1
    visiting.delete(nodeId)
    layers.set(nodeId, layer)
    return layer
  }
  nodes.forEach((node) => resolveLayer(node.id))
  return layers
}
