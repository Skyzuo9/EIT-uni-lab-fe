import type {
  LayoutResult,
  WorkflowNodePortLayout
} from './dagLayout'
import type { WorkflowLink, WorkflowNode } from './parseWorkflow'
import { projectMaterialTraces } from './workflowMaterialTrace'

export const WORKFLOW_PRIMARY_SAMPLE_NODES_PER_ROW = 4
export const WORKFLOW_PRIMARY_SAMPLE_COLUMN_GAP = 328
export const WORKFLOW_PRIMARY_SAMPLE_MIN_ROW_GAP = 300

const ORIGIN_X = 72
const ORIGIN_Y = 72
const BRANCH_ROW_OFFSET = 164
const BRANCH_ROW_GAP = 124
const ROW_CLEARANCE = 152

/**
 * 以主样品物料流角色（MaterialFlowRole）的第一条物料链为主干生成蛇形布局。
 *
 * 主干每行最多放置四个节点，奇数行反向排列；其它物料（Material）支线按
 * 最近主干节点归入同一行的辅助区。返回结果只改变前端画布投影坐标与端口方向，
 * 不修改权威工作流图（Workflow Graph）或其执行顺序。
 *
 * @param nodes 已完成组合工作流折叠与物料可见性投影的节点。
 * @param links 端点均可能出现在当前投影中的控制边与物料边。
 * @returns 包含蛇形坐标、逐节点端口方向和主样品主干目录的布局结果。
 */
export function layoutWorkflowPrimarySampleFlow(
  nodes: readonly WorkflowNode[],
  links: readonly WorkflowLink[]
): LayoutResult {
  const nodeIds = new Set(nodes.map((node) => node.id))
  const visibleLinks = links.filter((link) =>
    nodeIds.has(link.source) && nodeIds.has(link.target)
  )
  if (nodes.length === 0) {
    return {
      nodes: [],
      links: visibleLinks,
      direction: 'horizontal',
      primarySample: {
        hasPrimarySample: false,
        backboneNodeIds: [],
        rowByNode: new Map()
      }
    }
  }

  const traces = projectMaterialTraces(nodes, visibleLinks)
  const primaryLineage = traces.lineages.find(
    (lineage) => lineage.materialRole === 'primary_sample'
  )
  const nodeOrder = new Map(nodes.map((node, index) => [node.id, index]))
  const layerByNode = workflowLayers(nodes, visibleLinks)
  const backboneNodeIds = primaryLineage
    ? primaryLineageNodeIds(
        nodes,
        visibleLinks,
        traces,
        primaryLineage.key,
        layerByNode,
        nodeOrder
      )
    : [...nodes]
        .sort((left, right) =>
          (layerByNode.get(left.id) ?? 0) -
            (layerByNode.get(right.id) ?? 0) ||
          (nodeOrder.get(left.id) ?? 0) - (nodeOrder.get(right.id) ?? 0)
        )
        .map((node) => node.id)
  const backboneIndexes = new Map(
    backboneNodeIds.map((nodeId, index) => [nodeId, index])
  )
  const rowByNode = new Map<string, number>()
  const secondaryByRow = groupSecondaryNodesByBackboneRow(
    nodes,
    visibleLinks,
    backboneIndexes,
    layerByNode,
    nodeOrder
  )
  const rowCount = Math.max(
    1,
    Math.ceil(backboneNodeIds.length / WORKFLOW_PRIMARY_SAMPLE_NODES_PER_ROW)
  )
  const positionByNode = new Map<string, { x: number; y: number }>()
  const nodePorts = new Map<string, WorkflowNodePortLayout>()
  let mainRowY = ORIGIN_Y

  for (let row = 0; row < rowCount; row += 1) {
    const rowStart = row * WORKFLOW_PRIMARY_SAMPLE_NODES_PER_ROW
    const rowNodeIds = backboneNodeIds.slice(
      rowStart,
      rowStart + WORKFLOW_PRIMARY_SAMPLE_NODES_PER_ROW
    )
    for (const [rowIndex, nodeId] of rowNodeIds.entries()) {
      const column = row % 2 === 0
        ? rowIndex
        : WORKFLOW_PRIMARY_SAMPLE_NODES_PER_ROW - 1 - rowIndex
      positionByNode.set(nodeId, {
        x: ORIGIN_X + column * WORKFLOW_PRIMARY_SAMPLE_COLUMN_GAP,
        y: mainRowY
      })
      rowByNode.set(nodeId, row)
      const absoluteIndex = rowStart + rowIndex
      nodePorts.set(nodeId, backbonePortLayout(
        absoluteIndex,
        backboneNodeIds.length
      ))
    }

    const secondaryNodes = secondaryByRow.get(row) ?? []
    for (const [index, node] of secondaryNodes.entries()) {
      const column = index % WORKFLOW_PRIMARY_SAMPLE_NODES_PER_ROW
      const branchRow = Math.floor(
        index / WORKFLOW_PRIMARY_SAMPLE_NODES_PER_ROW
      )
      positionByNode.set(node.id, {
        x: ORIGIN_X + column * WORKFLOW_PRIMARY_SAMPLE_COLUMN_GAP,
        y: mainRowY + BRANCH_ROW_OFFSET + branchRow * BRANCH_ROW_GAP
      })
      rowByNode.set(node.id, row)
      nodePorts.set(node.id, { target: 'top', source: 'bottom' })
    }
    const branchRowCount = Math.ceil(
      secondaryNodes.length / WORKFLOW_PRIMARY_SAMPLE_NODES_PER_ROW
    )
    mainRowY += Math.max(
      WORKFLOW_PRIMARY_SAMPLE_MIN_ROW_GAP,
      BRANCH_ROW_OFFSET + branchRowCount * BRANCH_ROW_GAP + ROW_CLEARANCE
    )
  }

  const edgeDirections = new Map<number, 'TB' | 'LR'>()
  visibleLinks.forEach((link, index) => {
    const sourceIndex = backboneIndexes.get(link.source)
    const targetIndex = backboneIndexes.get(link.target)
    const sameBackboneRow = sourceIndex !== undefined &&
      targetIndex !== undefined &&
      Math.abs(sourceIndex - targetIndex) === 1 &&
      Math.floor(sourceIndex / WORKFLOW_PRIMARY_SAMPLE_NODES_PER_ROW) ===
        Math.floor(targetIndex / WORKFLOW_PRIMARY_SAMPLE_NODES_PER_ROW)
    edgeDirections.set(index, sameBackboneRow ? 'LR' : 'TB')
  })

  return {
    nodes: nodes.map((node) => ({
      ...node,
      ...(positionByNode.get(node.id) ?? { x: ORIGIN_X, y: ORIGIN_Y })
    })),
    links: visibleLinks,
    direction: 'horizontal',
    nodePorts,
    edgeDirections,
    primarySample: {
      hasPrimarySample: Boolean(primaryLineage),
      backboneNodeIds,
      rowByNode
    }
  }
}

/**
 * 提取第一条主样品物料链覆盖的节点并按拓扑层稳定排序。
 *
 * @param nodes 当前可见工作流节点。
 * @param links 当前可见工作流边。
 * @param traces 物料流追踪投影。
 * @param lineageKey 主样品物料链的稳定键。
 * @param layerByNode 节点到最长路径层号的映射。
 * @param nodeOrder 节点在权威图投影中的声明顺序。
 * @returns 主样品物料链上的有序节点 UUID。
 */
function primaryLineageNodeIds(
  nodes: readonly WorkflowNode[],
  links: readonly WorkflowLink[],
  traces: ReturnType<typeof projectMaterialTraces>,
  lineageKey: string,
  layerByNode: ReadonlyMap<string, number>,
  nodeOrder: ReadonlyMap<string, number>
): string[] {
  const primaryNodeIds = new Set<string>()
  const lineage = traces.lineages.find((item) => item.key === lineageKey)
  if (lineage) primaryNodeIds.add(lineage.sourceNodeUuid)
  for (const [nodeId, handles] of traces.handleLineagesByNode) {
    if ([...handles.values()].includes(lineageKey)) primaryNodeIds.add(nodeId)
  }
  links.forEach((link, index) => {
    if (traces.edgeLineages.get(index) !== lineageKey) return
    primaryNodeIds.add(link.source)
    primaryNodeIds.add(link.target)
  })
  return nodes
    .filter((node) => primaryNodeIds.has(node.id))
    .sort((left, right) =>
      (layerByNode.get(left.id) ?? 0) - (layerByNode.get(right.id) ?? 0) ||
      (nodeOrder.get(left.id) ?? 0) - (nodeOrder.get(right.id) ?? 0)
    )
    .map((node) => node.id)
}

/**
 * 将非主干节点分配给图距离最近的主样品节点所在行。
 *
 * @param nodes 当前可见工作流节点。
 * @param links 当前可见工作流边。
 * @param backboneIndexes 主干节点到序号的映射。
 * @param layerByNode 节点到拓扑层号的映射。
 * @param nodeOrder 节点声明顺序。
 * @returns 按蛇形行号分组且稳定排序的辅助节点。
 */
function groupSecondaryNodesByBackboneRow(
  nodes: readonly WorkflowNode[],
  links: readonly WorkflowLink[],
  backboneIndexes: ReadonlyMap<string, number>,
  layerByNode: ReadonlyMap<string, number>,
  nodeOrder: ReadonlyMap<string, number>
): Map<number, WorkflowNode[]> {
  const adjacency = new Map(nodes.map((node) => [node.id, [] as string[]]))
  for (const link of links) {
    adjacency.get(link.source)?.push(link.target)
    adjacency.get(link.target)?.push(link.source)
  }
  const assigned = new Map<number, Array<{
    node: WorkflowNode
    anchorIndex: number
  }>>()
  for (const node of nodes) {
    if (backboneIndexes.has(node.id)) continue
    const anchorIndex = nearestBackboneIndex(
      node.id,
      adjacency,
      backboneIndexes
    )
    const row = Math.floor(
      anchorIndex / WORKFLOW_PRIMARY_SAMPLE_NODES_PER_ROW
    )
    assigned.set(row, [
      ...(assigned.get(row) ?? []),
      { node, anchorIndex }
    ])
  }
  return new Map([...assigned].map(([row, entries]) => [
    row,
    entries
      .sort((left, right) =>
        left.anchorIndex - right.anchorIndex ||
        (layerByNode.get(left.node.id) ?? 0) -
          (layerByNode.get(right.node.id) ?? 0) ||
        (nodeOrder.get(left.node.id) ?? 0) -
          (nodeOrder.get(right.node.id) ?? 0)
      )
      .map(({ node }) => node)
  ]))
}

/**
 * 在无向工作流邻接表中查找距离给定节点最近的主样品主干序号。
 *
 * @param startNodeId 待安置辅助节点 UUID。
 * @param adjacency 当前可见图的无向邻接表。
 * @param backboneIndexes 主干节点到序号的映射。
 * @returns 最近主干序号；断开的辅助节点回退到第一行。
 */
function nearestBackboneIndex(
  startNodeId: string,
  adjacency: ReadonlyMap<string, readonly string[]>,
  backboneIndexes: ReadonlyMap<string, number>
): number {
  const visited = new Set([startNodeId])
  let frontier = [startNodeId]
  while (frontier.length > 0) {
    const matches = frontier
      .map((nodeId) => backboneIndexes.get(nodeId))
      .filter((index): index is number => index !== undefined)
    if (matches.length > 0) return Math.min(...matches)
    const next: string[] = []
    for (const nodeId of frontier) {
      for (const neighbor of adjacency.get(nodeId) ?? []) {
        if (visited.has(neighbor)) continue
        visited.add(neighbor)
        next.push(neighbor)
      }
    }
    frontier = next
  }
  return 0
}

/**
 * 返回主样品蛇形路径中一个节点的输入、输出端口方向。
 *
 * @param nodeIndex 节点在主样品主干中的零基序号。
 * @param nodeCount 主样品主干节点总数。
 * @returns 同行使用左右端口、换行转折使用上下端口的端口布局。
 */
function backbonePortLayout(
  nodeIndex: number,
  nodeCount: number
): WorkflowNodePortLayout {
  const row = Math.floor(
    nodeIndex / WORKFLOW_PRIMARY_SAMPLE_NODES_PER_ROW
  )
  const rowIndex = nodeIndex % WORKFLOW_PRIMARY_SAMPLE_NODES_PER_ROW
  const firstInRow = rowIndex === 0
  const lastInRow = rowIndex === WORKFLOW_PRIMARY_SAMPLE_NODES_PER_ROW - 1 ||
    nodeIndex === nodeCount - 1
  const leftToRight = row % 2 === 0
  return {
    target: firstInRow && nodeIndex > 0
      ? 'top'
      : leftToRight ? 'left' : 'right',
    source: lastInRow && nodeIndex < nodeCount - 1
      ? 'bottom'
      : leftToRight ? 'right' : 'left'
  }
}

/**
 * 按全部可见边计算稳定的最长路径层号。
 *
 * @param nodes 当前可见工作流节点。
 * @param links 当前可见工作流边。
 * @returns 节点 UUID 到拓扑层号的映射；循环依赖回退到根层。
 */
function workflowLayers(
  nodes: readonly WorkflowNode[],
  links: readonly WorkflowLink[]
): Map<string, number> {
  const incoming = new Map(nodes.map((node) => [node.id, [] as string[]]))
  for (const link of links) incoming.get(link.target)?.push(link.source)
  const layers = new Map<string, number>()
  const visiting = new Set<string>()
  const resolve = (nodeId: string): number => {
    const cached = layers.get(nodeId)
    if (cached !== undefined) return cached
    if (visiting.has(nodeId)) return 0
    visiting.add(nodeId)
    const predecessors = incoming.get(nodeId) ?? []
    const layer = predecessors.length === 0
      ? 0
      : Math.max(...predecessors.map(resolve)) + 1
    visiting.delete(nodeId)
    layers.set(nodeId, layer)
    return layer
  }
  nodes.forEach((node) => resolve(node.id))
  return layers
}
