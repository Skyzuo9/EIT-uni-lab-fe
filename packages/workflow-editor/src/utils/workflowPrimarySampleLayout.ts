import type {
  LayoutResult,
  WorkflowNodePortLayout
} from './dagLayout'
import type { WorkflowLink, WorkflowNode } from './parseWorkflow'
import {
  isResourceSlotHandle,
  projectMaterialTraces
} from './workflowMaterialTrace'
import {
  packWorkflowSupportingBranches,
  type WorkflowSupportingBranch,
  workflowBackboneColumnForIndex
} from './workflowPrimarySampleBranchLayout'
import type {
  WorkflowSupportingMaterialPresentation
} from './workflowReactionMaterialProjection'

export const WORKFLOW_PRIMARY_SAMPLE_NODES_PER_ROW = 4
export const WORKFLOW_PRIMARY_SAMPLE_COLUMN_GAP = 328
export const WORKFLOW_PRIMARY_SAMPLE_MIN_ROW_GAP = 300

const ORIGIN_X = 72
const ORIGIN_Y = 72
const SUPPORTING_BRANCH_VERTICAL_GAP = 44
const ROW_CLEARANCE = 112
const COMPACT_NODE_BASE_HEIGHT = 48
const COMPACT_MATERIAL_CARD_HEIGHT = 33
const SPECIAL_NODE_HEIGHT = 72

export interface WorkflowPrimarySampleLayoutOptions {
  supportingMaterialPresentation?: WorkflowSupportingMaterialPresentation
}

/**
 * 以主样品物料流角色（MaterialFlowRole）的第一条物料链为主干生成蛇形布局。
 *
 * 主干每行最多放置四个节点，奇数行反向排列；其它物料（Material）支线按
 * 最近主干节点归入同一行的辅助区。返回结果只改变前端画布投影坐标与端口方向，
 * 不修改权威工作流图（Workflow Graph）或其执行顺序。
 *
 * @param nodes 已完成组合工作流折叠与物料可见性投影的节点。
 * @param links 端点均可能出现在当前投影中的控制边与物料边。
 * @param options 辅助物料使用反应式标注或完整支线的布局选项。
 * @returns 包含蛇形坐标、逐节点端口方向和主样品主干目录的布局结果。
 */
export function layoutWorkflowPrimarySampleFlow(
  nodes: readonly WorkflowNode[],
  links: readonly WorkflowLink[],
  options: WorkflowPrimarySampleLayoutOptions = {}
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
  const secondaryBranchesByRow = groupSecondaryBranchesByBackboneRow(
    nodes,
    visibleLinks,
    traces,
    backboneIndexes,
    layerByNode,
    nodeOrder
  )
  const showSupportingBranches =
    options.supportingMaterialPresentation !== 'reaction-formula'
  const rowCount = Math.max(
    1,
    Math.ceil(backboneNodeIds.length / WORKFLOW_PRIMARY_SAMPLE_NODES_PER_ROW)
  )
  const positionByNode = new Map<string, { x: number; y: number }>()
  const nodePorts = new Map<string, WorkflowNodePortLayout>()
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  let mainRowY = ORIGIN_Y

  for (let row = 0; row < rowCount; row += 1) {
    const rowStart = row * WORKFLOW_PRIMARY_SAMPLE_NODES_PER_ROW
    const rowNodeIds = backboneNodeIds.slice(
      rowStart,
      rowStart + WORKFLOW_PRIMARY_SAMPLE_NODES_PER_ROW
    )
    const mainRowHeight = Math.max(
      SPECIAL_NODE_HEIGHT,
      ...rowNodeIds.map((nodeId) =>
        estimatedHorizontalNodeHeight(nodeById.get(nodeId))
      )
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
      nodePorts.set(nodeId, backboneHorizontalPortLayout(absoluteIndex))
    }

    const secondaryBands = showSupportingBranches
      ? packWorkflowSupportingBranches(
          secondaryBranchesByRow.get(row) ?? [],
          ORIGIN_X,
          WORKFLOW_PRIMARY_SAMPLE_COLUMN_GAP,
          WORKFLOW_PRIMARY_SAMPLE_NODES_PER_ROW
        )
      : []
    let occupiedBottom = mainRowY + mainRowHeight
    for (const branchNodes of secondaryBands) {
      const branchY = occupiedBottom + SUPPORTING_BRANCH_VERTICAL_GAP
      const branchHeight = Math.max(
        SPECIAL_NODE_HEIGHT,
        ...branchNodes.map(({ node }) => estimatedHorizontalNodeHeight(node))
      )
      for (const { node, x, ports } of branchNodes) {
        positionByNode.set(node.id, {
          x,
          y: branchY
        })
        rowByNode.set(node.id, row)
        nodePorts.set(node.id, ports)
      }
      occupiedBottom = branchY + branchHeight
    }
    mainRowY += Math.max(
      WORKFLOW_PRIMARY_SAMPLE_MIN_ROW_GAP,
      occupiedBottom - mainRowY + ROW_CLEARANCE
    )
  }

  const edgeDirections = new Map<number, 'TB' | 'LR'>()
  visibleLinks.forEach((_link, index) => {
    edgeDirections.set(index, 'LR')
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
 * 将移除主样品主干后仍相连的节点收束为局部辅助物料支线。
 *
 * @param nodes 当前可见工作流节点。
 * @param links 当前可见工作流边。
 * @param traces 当前物料流追踪投影。
 * @param backboneIndexes 主干节点到序号的映射。
 * @param layerByNode 节点到拓扑层号的映射。
 * @param nodeOrder 节点声明顺序。
 * @returns 按蛇形行号分组且稳定排序的辅助物料支线。
 */
function groupSecondaryBranchesByBackboneRow(
  nodes: readonly WorkflowNode[],
  links: readonly WorkflowLink[],
  traces: ReturnType<typeof projectMaterialTraces>,
  backboneIndexes: ReadonlyMap<string, number>,
  layerByNode: ReadonlyMap<string, number>,
  nodeOrder: ReadonlyMap<string, number>
): Map<number, WorkflowSupportingBranch[]> {
  const adjacency = new Map(nodes.map((node) => [node.id, [] as string[]]))
  links.forEach((link, index) => {
    // 只用物料边构造支线，避免纯执行依赖把互不相关的试剂链粘成一条长支线。
    if (!traces.edgeLineages.has(index)) return
    adjacency.get(link.source)?.push(link.target)
    adjacency.get(link.target)?.push(link.source)
  })
  const secondaryNodeIds = new Set(
    nodes.filter((node) => !backboneIndexes.has(node.id)).map((node) => node.id)
  )
  const visited = new Set<string>()
  const assigned = new Map<number, WorkflowSupportingBranch[]>()

  for (const startNodeId of secondaryNodeIds) {
    if (visited.has(startNodeId)) continue
    const componentIds = connectedSecondaryNodeIds(
      startNodeId,
      adjacency,
      secondaryNodeIds,
      visited
    )
    const componentNodes = nodes
      .filter((node) => componentIds.has(node.id))
      .sort((left, right) =>
        (layerByNode.get(left.id) ?? 0) -
          (layerByNode.get(right.id) ?? 0) ||
        (nodeOrder.get(left.id) ?? 0) - (nodeOrder.get(right.id) ?? 0)
      )
    const attachment = branchBackboneAttachment(
      componentIds,
      links,
      adjacency,
      backboneIndexes
    )
    const row = Math.floor(
      attachment.anchorIndex / WORKFLOW_PRIMARY_SAMPLE_NODES_PER_ROW
    )
    assigned.set(row, [
      ...(assigned.get(row) ?? []),
      {
        nodes: componentNodes,
        anchorIndex: attachment.anchorIndex,
        anchorColumn: workflowBackboneColumnForIndex(
          attachment.anchorIndex,
          WORKFLOW_PRIMARY_SAMPLE_NODES_PER_ROW
        ),
        order: Math.min(...componentNodes.map(
          (node) => nodeOrder.get(node.id) ?? Number.MAX_SAFE_INTEGER
        )),
        flowDirection: attachment.flowDirection
      }
    ])
  }
  return new Map([...assigned].map(([row, entries]) => [
    row,
    entries
      .sort((left, right) =>
        left.anchorColumn - right.anchorColumn ||
        left.anchorIndex - right.anchorIndex ||
        left.order - right.order
      )
  ]))
}

/**
 * 找出不穿过主样品主干的辅助节点连通分量。
 *
 * @param startNodeId 当前分量的起始节点 UUID。
 * @param adjacency 当前可见图的无向邻接表。
 * @param secondaryNodeIds 全部非主干节点 UUID。
 * @param visited 已归入其它辅助物料支线的节点 UUID。
 * @returns 当前局部支线覆盖的节点 UUID。
 */
function connectedSecondaryNodeIds(
  startNodeId: string,
  adjacency: ReadonlyMap<string, readonly string[]>,
  secondaryNodeIds: ReadonlySet<string>,
  visited: Set<string>
): Set<string> {
  const component = new Set<string>()
  const pending = [startNodeId]
  visited.add(startNodeId)
  while (pending.length > 0) {
    const nodeId = pending.shift()
    if (!nodeId) continue
    component.add(nodeId)
    for (const neighbor of adjacency.get(nodeId) ?? []) {
      if (!secondaryNodeIds.has(neighbor) || visited.has(neighbor)) continue
      visited.add(neighbor)
      pending.push(neighbor)
    }
  }
  return component
}

/**
 * 确定一条辅助物料支线应贴近的主样品节点。
 *
 * 优先采用从辅助支线汇入主干的有向边；若图中没有直接汇入边，则回退到
 * 无向图距离最近的主干节点，保持异常或不完整投影仍可布局。
 *
 * @param componentIds 当前辅助物料支线节点 UUID。
 * @param links 当前可见工作流边。
 * @param adjacency 当前可见图的无向邻接表。
 * @param backboneIndexes 主干节点到序号的映射。
 * @returns 支线接入的主干序号及物料相对主干的流向。
 */
function branchBackboneAttachment(
  componentIds: ReadonlySet<string>,
  links: readonly WorkflowLink[],
  adjacency: ReadonlyMap<string, readonly string[]>,
  backboneIndexes: ReadonlyMap<string, number>
): {
  anchorIndex: number
  flowDirection: WorkflowSupportingBranch['flowDirection']
} {
  const directJoinIndexes = links
    .filter((link) =>
      componentIds.has(link.source) && backboneIndexes.has(link.target)
    )
    .map((link) => backboneIndexes.get(link.target))
    .filter((index): index is number => index !== undefined)
  if (directJoinIndexes.length > 0) return {
    anchorIndex: Math.min(...directJoinIndexes),
    flowDirection: 'into-primary'
  }

  const directDepartureIndexes = links
    .filter((link) =>
      backboneIndexes.has(link.source) && componentIds.has(link.target)
    )
    .map((link) => backboneIndexes.get(link.source))
    .filter((index): index is number => index !== undefined)
  if (directDepartureIndexes.length > 0) return {
    anchorIndex: Math.min(...directDepartureIndexes),
    flowDirection: 'out-of-primary'
  }

  let fallback = Number.POSITIVE_INFINITY
  for (const nodeId of componentIds) {
    fallback = Math.min(
      fallback,
      nearestBackboneIndex(nodeId, adjacency, backboneIndexes)
    )
  }
  return {
    anchorIndex: Number.isFinite(fallback) ? fallback : 0,
    flowDirection: 'into-primary'
  }
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
 * 返回横向主样品蛇形路径中一个节点的输入、输出端口方向。
 *
 * @param nodeIndex 节点在主样品主干中的零基序号。
 * @returns 偶数行由西向东、奇数行由东向西的端口布局。
 */
function backboneHorizontalPortLayout(
  nodeIndex: number
): WorkflowNodePortLayout {
  const row = Math.floor(
    nodeIndex / WORKFLOW_PRIMARY_SAMPLE_NODES_PER_ROW
  )
  const leftToRight = row % 2 === 0
  return {
    target: leftToRight ? 'left' : 'right',
    source: leftToRight ? 'right' : 'left'
  }
}

/**
 * 估算横向节点在物料名称卡片纵向堆叠后的占用高度。
 *
 * 该估算只用于为下一辅助行预留空间；ReactFlow 仍以真实 DOM 测量作为
 * 连线锚点权威。物料来源（MaterialSource）和标准转运节点保持专用视觉高度。
 *
 * @param node 当前工作流（Workflow）节点；缺失时按专用节点最低高度处理。
 * @returns 画布布局应为该节点预留的像素高度。
 */
function estimatedHorizontalNodeHeight(
  node: WorkflowNode | undefined
): number {
  if (!node || node.type === 'material_source' ||
    node.visualKind === 'robot-transfer') return SPECIAL_NODE_HEIGHT
  // `materialVariableKeys` 是节点内需要独立展示的物料占位符逻辑字段集合。
  const materialVariableKeys = new Set(
    (node.handles ?? [])
      .filter(isResourceSlotHandle)
      .map((handle) => handle.dataKey?.trim() || handle.handleKey)
  )
  return COMPACT_NODE_BASE_HEIGHT +
    Math.max(1, materialVariableKeys.size) * COMPACT_MATERIAL_CARD_HEIGHT
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
