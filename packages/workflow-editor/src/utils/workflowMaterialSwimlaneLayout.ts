import type { WorkflowLink, WorkflowNode } from './parseWorkflow'
import { projectMaterialTraces } from './workflowMaterialTrace'

export const WORKFLOW_MATERIAL_LANE_GAP = 192
export const WORKFLOW_MATERIAL_ACTION_FIRST_HANDLE_X = 191

const LANE_ORIGIN_X = 320
const MATERIAL_SOURCE_WIDTH = 136
const MATERIAL_SOURCE_HEIGHT = 148
const ACTION_NODE_HEIGHT = 64
const ACTION_NODE_TRAILING_WIDTH = 150
const ACTION_NODE_MIN_WIDTH = 248
const NODE_HORIZONTAL_GAP = 36
const NODE_ROW_GAP = 44
const LAYER_GAP = 96
const ORIGIN_Y = 40

export interface WorkflowMaterialSwimlane {
  key: string
  label: string
  accent: string
  index: number
  x: number
}

export interface WorkflowMaterialSwimlaneNodeLayout {
  startLane: number
  endLane: number
  width: number
}

export interface WorkflowMaterialSwimlaneProjection {
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
  direction: 'vertical'
  swimlanes: WorkflowMaterialSwimlaneProjection
}

interface SizedPositionedNode {
  node: WorkflowNode
  x: number
  width: number
  height: number
}

/**
 * 把当前可见工作流（Workflow）投影为自上而下的物料泳道布局。
 *
 * 物料（Material）身份沿物料流（MaterialFlow）固定在同一条纵向轴线上；
 * 同时使用多种物料的动作节点横跨最左与最右泳道，不改变物料左右关系。
 *
 * @param nodes 已完成组合工作流折叠投影的全部可见节点。
 * @param links 已完成端点重接的执行顺序边与物料流边。
 * @returns 含节点坐标、有效边、泳道目录及句柄泳道索引的布局结果。
 */
export function layoutWorkflowMaterialSwimlanes(
  nodes: readonly WorkflowNode[],
  links: readonly WorkflowLink[]
): WorkflowMaterialSwimlaneLayoutResult {
  const nodeIds = new Set(nodes.map((node) => node.id))
  const visibleLinks = links.filter((link) =>
    nodeIds.has(link.source) && nodeIds.has(link.target)
  )
  const traces = projectMaterialTraces(nodes, visibleLinks)
  const lanes = traces.lineages.map((lineage, index) => ({
    key: lineage.key,
    label: lineage.sourceNodeName,
    accent: lineage.accent,
    index,
    x: LANE_ORIGIN_X + index * WORKFLOW_MATERIAL_LANE_GAP
  }))
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

  const nodeLayouts = new Map<string, WorkflowMaterialSwimlaneNodeLayout>()
  let auxiliaryColumn = 0
  const laneRight = lanes.at(-1)?.x ?? LANE_ORIGIN_X
  const sizedNodes = nodes.map((node) => {
    const laneIndexes = [...(handleLaneIndexes.get(node.id)?.values() ?? [])]
    if (node.type === 'material_source' && laneIndexes.length > 0) {
      const laneIndex = Math.min(...laneIndexes)
      return {
        node,
        x: lanes[laneIndex]!.x - MATERIAL_SOURCE_WIDTH / 2,
        width: MATERIAL_SOURCE_WIDTH,
        height: MATERIAL_SOURCE_HEIGHT
      }
    }
    if (laneIndexes.length > 0) {
      const startLane = Math.min(...laneIndexes)
      const endLane = Math.max(...laneIndexes)
      const width = WORKFLOW_MATERIAL_ACTION_FIRST_HANDLE_X +
        (endLane - startLane) * WORKFLOW_MATERIAL_LANE_GAP +
        ACTION_NODE_TRAILING_WIDTH
      nodeLayouts.set(node.id, { startLane, endLane, width })
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
    swimlanes: { lanes, nodeLayouts, handleLaneIndexes }
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
