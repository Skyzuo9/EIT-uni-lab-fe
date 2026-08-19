import type { DagLayoutDirection, LayoutNode } from './dagLayout'
import type { WorkflowLink, WorkflowNode } from './parseWorkflow'

export interface WorkflowCanvasNodeSize {
  width: number
  height: number
}

export interface ContainedWorkflowLayoutNode extends LayoutNode {
  /** React Flow expects child coordinates relative to their immediate parent. */
  renderPosition: { x: number; y: number }
  /** Publish the layout footprint so React Flow can fit before DOM measurement. */
  renderSize: WorkflowCanvasNodeSize
  parentContainerId?: string
  compositeContainerSize?: WorkflowCanvasNodeSize
}

interface NodeRect extends WorkflowCanvasNodeSize {
  x: number
  y: number
}

const ACTION_NODE_MIN_WIDTH = 248
const ACTION_NODE_MAX_WIDTH = 520
const ACTION_NODE_HEIGHT = 96
const MATERIAL_SOURCE_WIDTH = 184
const MATERIAL_SOURCE_HEIGHT = 126
const TRANSFER_NODE_WIDTH = 176
const TRANSFER_NODE_HEIGHT = 126
const COLLAPSED_COMPOSITE_HEIGHT = 88
const CONTAINER_MIN_WIDTH = 320
const CONTAINER_MIN_HEIGHT = 196
const CONTAINER_INLINE_PADDING = 32
const CONTAINER_HEADER_HEIGHT = 64
const CONTAINER_BOTTOM_PADDING = 32
const SCOPE_COLLISION_GAP = 32
const CONTAINER_COLUMN_GAP = 48
const CONTAINER_ROW_GAP = 40
const CONTAINER_LAYER_TOLERANCE = 96
const CONTAINER_MIN_INLINE_SPAN = 640
const CONTAINER_MAX_INLINE_SPAN = 1280

/**
 * 将已经展开的组合工作流调用（CompositeWorkflowInvocation）投影为真正的
 * React Flow 父子容器。布局器仍只负责每个节点的阅读顺序；本模块统一负责
 * 容器尺寸、相对坐标、嵌套顺序和同一范围内的碰撞消解。
 *
 * @param nodes 当前布局器返回的全部可见节点及绝对坐标。
 * @param measuredSizes 可选的可靠节点测量；缺少时使用保守估算。
 * @returns 父节点先于后代、子坐标相对父容器且容器完整包围后代的投影。
 */
export function projectWorkflowCompositeContainment(
  nodes: readonly LayoutNode[],
  measuredSizes: ReadonlyMap<string, WorkflowCanvasNodeSize> = new Map(),
  links: readonly WorkflowLink[] = [],
  direction: DagLayoutDirection = 'vertical'
): ContainedWorkflowLayoutNode[] {
  if (nodes.length === 0) return []

  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const visibleNodeIds = new Set(nodeById.keys())
  const expandedContainerIds = new Set(
    nodes
      .filter((node) =>
        node.groupKind === 'subworkflow' &&
        nodes.some((candidate) =>
          candidate.id !== node.id &&
          nodeAncestors(candidate, nodeById).includes(node.id)
        )
      )
      .map((node) => node.id)
  )
  const visibleParentById = new Map<string, string>()
  for (const node of nodes) {
    const parentId = nodeAncestors(node, nodeById).find((candidate) =>
      expandedContainerIds.has(candidate) && visibleNodeIds.has(candidate)
    )
    if (parentId) visibleParentById.set(node.id, parentId)
  }

  const childIdsByParent = new Map<string, string[]>()
  for (const node of nodes) {
    const parentId = visibleParentById.get(node.id)
    if (!parentId) continue
    childIdsByParent.set(parentId, [
      ...(childIdsByParent.get(parentId) ?? []),
      node.id
    ])
  }
  const rectById = new Map<string, NodeRect>()
  const anchorById = new Map<string, { x: number; y: number }>()
  for (const node of nodes) {
    const size = measuredSizes.get(node.id) ?? estimateWorkflowCanvasNodeSize(node)
    rectById.set(node.id, {
      x: node.x,
      y: node.y,
      width: size.width,
      height: size.height
    })
    anchorById.set(node.id, { x: node.x, y: node.y })
  }

  const containerIdsByDepth = [...expandedContainerIds].sort(
    (left, right) => nodeDepth(right, nodeById) - nodeDepth(left, nodeById)
  )
  for (const containerId of containerIdsByDepth) {
    const childIds = childIdsByParent.get(containerId) ?? []
    if (childIds.length === 0) {
      expandedContainerIds.delete(containerId)
      continue
    }
    packContainerChildren(
      childIds,
      anchorById.get(containerId) ?? { x: 0, y: 0 },
      rectById,
      childIdsByParent,
      anchorById,
      links,
      visibleParentById,
      containerId,
      direction
    )
    const childRects = childIds.flatMap((childId) => {
      const rect = rectById.get(childId)
      return rect ? [rect] : []
    })
    const left = Math.min(...childRects.map((rect) => rect.x))
    const top = Math.min(...childRects.map((rect) => rect.y))
    const right = Math.max(...childRects.map((rect) => rect.x + rect.width))
    const bottom = Math.max(...childRects.map((rect) => rect.y + rect.height))
    rectById.set(containerId, {
      x: left - CONTAINER_INLINE_PADDING,
      y: top - CONTAINER_HEADER_HEIGHT,
      width: Math.max(
        CONTAINER_MIN_WIDTH,
        right - left + CONTAINER_INLINE_PADDING * 2
      ),
      height: Math.max(
        CONTAINER_MIN_HEIGHT,
        bottom - top + CONTAINER_HEADER_HEIGHT + CONTAINER_BOTTOM_PADDING
      )
    })
  }

  const rootIds = nodes
    .filter((node) => !visibleParentById.has(node.id))
    .map((node) => node.id)
  separateScopeCollisions(rootIds, rectById, childIdsByParent)

  const projectedById = new Map<string, ContainedWorkflowLayoutNode>()
  for (const node of nodes) {
    const rect = rectById.get(node.id)!
    const parentId = visibleParentById.get(node.id)
    const parentRect = parentId ? rectById.get(parentId) : undefined
    projectedById.set(node.id, {
      ...node,
      x: rect.x,
      y: rect.y,
      renderPosition: parentRect
        ? { x: rect.x - parentRect.x, y: rect.y - parentRect.y }
        : { x: rect.x, y: rect.y },
      renderSize: {
        width: rect.width,
        height: rect.height
      },
      ...(parentId ? { parentContainerId: parentId } : {}),
      ...(expandedContainerIds.has(node.id)
        ? {
            compositeContainerSize: {
              width: rect.width,
              height: rect.height
            }
          }
        : {})
    })
  }

  const ordered: ContainedWorkflowLayoutNode[] = []
  const appendNode = (nodeId: string): void => {
    const projected = projectedById.get(nodeId)
    if (!projected || ordered.some((node) => node.id === nodeId)) return
    ordered.push(projected)
    for (const childId of childIdsByParent.get(nodeId) ?? []) {
      appendNode(childId)
    }
  }
  for (const nodeId of rootIds) appendNode(nodeId)
  for (const node of nodes) appendNode(node.id)
  return ordered
}

/**
 * 判断一条前端画布连线是否遵守组合工作流调用边界。
 *
 * 合法连线只有三种：同一父范围内的节点互连、父节点连直接子节点、直接子节点
 * 连父节点。任何跨过一个或多个父范围的直接连线都必须拒绝。
 */
export function workflowCompositeConnectionAllowed(
  nodes: ReadonlyArray<Pick<
    WorkflowNode,
    'id' | 'parentGroupId' | 'groupKind'
  >>,
  sourceNodeId: string,
  targetNodeId: string
): boolean {
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const source = nodeById.get(sourceNodeId)
  const target = nodeById.get(targetNodeId)
  if (!source || !target || sourceNodeId === targetNodeId) return false
  const sourceParentId = nearestCompositeParentId(source, nodeById)
  const targetParentId = nearestCompositeParentId(target, nodeById)
  return sourceParentId === targetParentId ||
    sourceParentId === targetNodeId ||
    targetParentId === sourceNodeId
}

/**
 * 判断一条新画布连线是否会改写展开的子工作流内容。
 *
 * 展开只提供结构细节查看；只要任一端位于组合工作流调用
 * （CompositeWorkflowInvocation）内部，这条新连线就不可编辑。顶层调用节点
 * 自身仍可通过真实输入/输出句柄连接其他顶层节点。
 */
export function workflowCompositeConnectionEditable(
  nodes: ReadonlyArray<Pick<
    WorkflowNode,
    'id' | 'parentGroupId' | 'groupKind'
  >>,
  sourceNodeId: string,
  targetNodeId: string
): boolean {
  if (!workflowCompositeConnectionAllowed(nodes, sourceNodeId, targetNodeId)) {
    return false
  }
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const source = nodeById.get(sourceNodeId)
  const target = nodeById.get(targetNodeId)
  if (!source || !target) return false
  return nearestCompositeParentId(source, nodeById) === undefined &&
    nearestCompositeParentId(target, nodeById) === undefined
}

function nearestCompositeParentId(
  node: Pick<WorkflowNode, 'parentGroupId'>,
  nodeById: ReadonlyMap<
    string,
    Pick<WorkflowNode, 'id' | 'parentGroupId' | 'groupKind'>
  >
): string | undefined {
  const visited = new Set<string>()
  let parentId = node.parentGroupId
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId)
    const parent = nodeById.get(parentId)
    if (!parent) return undefined
    if (parent.groupKind === 'subworkflow') return parentId
    parentId = parent.parentGroupId
  }
  return undefined
}

/** Return a conservative canvas footprint before React Flow measures a node. */
export function estimateWorkflowCanvasNodeSize(
  node: Pick<
    WorkflowNode,
    'type' | 'visualKind' | 'groupKind' | 'handles'
  >
): WorkflowCanvasNodeSize {
  if (node.type === 'material_source') {
    return { width: MATERIAL_SOURCE_WIDTH, height: MATERIAL_SOURCE_HEIGHT }
  }
  if (node.visualKind === 'robot-transfer') {
    return { width: TRANSFER_NODE_WIDTH, height: TRANSFER_NODE_HEIGHT }
  }
  const materialVariables = new Set(
    (node.handles ?? [])
      .filter((handle) => handle.valueType === 'ResourceSlot')
      .map((handle) => handle.dataKey?.trim() || handle.handleKey)
  ).size
  return {
    width: Math.min(
      ACTION_NODE_MAX_WIDTH,
      Math.max(ACTION_NODE_MIN_WIDTH, 170 + materialVariables * 78)
    ),
    height: node.groupKind === 'subworkflow'
      ? COLLAPSED_COMPOSITE_HEIGHT
      : ACTION_NODE_HEIGHT
  }
}

function nodeAncestors(
  node: Pick<WorkflowNode, 'parentGroupId'>,
  nodeById: ReadonlyMap<string, WorkflowNode>
): string[] {
  const ancestors: string[] = []
  const visited = new Set<string>()
  let parentId = node.parentGroupId
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId)
    ancestors.push(parentId)
    parentId = nodeById.get(parentId)?.parentGroupId
  }
  return ancestors
}

function nodeDepth(
  nodeId: string,
  nodeById: ReadonlyMap<string, WorkflowNode>
): number {
  const node = nodeById.get(nodeId)
  return node ? nodeAncestors(node, nodeById).length : 0
}

function separateScopeCollisions(
  nodeIds: readonly string[],
  rectById: Map<string, NodeRect>,
  childIdsByParent: ReadonlyMap<string, readonly string[]>
): void {
  const ordered = [...nodeIds].sort((left, right) => {
    const leftRect = rectById.get(left)
    const rightRect = rectById.get(right)
    return (leftRect?.y ?? 0) - (rightRect?.y ?? 0) ||
      (leftRect?.x ?? 0) - (rightRect?.x ?? 0)
  })
  const placed: string[] = []
  for (const nodeId of ordered) {
    let current = rectById.get(nodeId)
    if (!current) continue
    let nextX = current.x
    for (const placedId of placed) {
      const other = rectById.get(placedId)
      if (!other || !rectanglesOverlap(
        { ...current, x: nextX },
        other,
        SCOPE_COLLISION_GAP
      )) continue
      nextX = Math.max(nextX, other.x + other.width + SCOPE_COLLISION_GAP)
    }
    if (nextX !== current.x) {
      shiftSubtree(
        nodeId,
        nextX - current.x,
        0,
        rectById,
        childIdsByParent
      )
      current = rectById.get(nodeId)
    }
    if (current) placed.push(nodeId)
  }
}

function packContainerChildren(
  nodeIds: readonly string[],
  anchor: { x: number; y: number },
  rectById: Map<string, NodeRect>,
  childIdsByParent: ReadonlyMap<string, readonly string[]>,
  anchorById: ReadonlyMap<string, { x: number; y: number }>,
  links: readonly WorkflowLink[],
  visibleParentById: ReadonlyMap<string, string>,
  containerId: string,
  direction: DagLayoutDirection
): void {
  const layerById = containerChildLayers(
    nodeIds,
    anchorById,
    links,
    visibleParentById,
    containerId,
    direction
  )
  const rows = new Map<number, string[]>()
  for (const nodeId of nodeIds) {
    const layer = layerById.get(nodeId) ?? 0
    rows.set(layer, [...(rows.get(layer) ?? []), nodeId])
  }
  const orderedLayers = [...rows.entries()].sort(
    ([left], [right]) => left - right
  )
  const inlineLimit = adaptiveContainerInlineSpan(nodeIds, rectById)
  if (direction === 'horizontal') {
    const originX = anchor.x + CONTAINER_INLINE_PADDING
    let nextX = originX
    let bandY = anchor.y + CONTAINER_HEADER_HEIGHT
    let bandHeight = 0
    for (const [, columnNodeIds] of orderedLayers) {
      const ordered = [...columnNodeIds].sort((left, right) =>
        (anchorById.get(left)?.y ?? rectById.get(left)?.y ?? 0) -
        (anchorById.get(right)?.y ?? rectById.get(right)?.y ?? 0)
      )
      const columnRects = ordered.flatMap((nodeId) => {
        const rect = rectById.get(nodeId)
        return rect ? [rect] : []
      })
      const columnWidth = Math.max(
        0,
        ...columnRects.map((rect) => rect.width)
      )
      const columnHeight = columnRects.reduce(
        (height, rect, index) =>
          height + rect.height + (index === 0 ? 0 : CONTAINER_ROW_GAP),
        0
      )
      if (
        nextX > originX &&
        nextX + columnWidth > originX + inlineLimit
      ) {
        nextX = originX
        bandY += bandHeight + CONTAINER_ROW_GAP
        bandHeight = 0
      }
      let nextY = bandY
      for (const nodeId of ordered) {
        const rect = rectById.get(nodeId)
        if (!rect) continue
        shiftSubtree(
          nodeId,
          nextX - rect.x,
          nextY - rect.y,
          rectById,
          childIdsByParent
        )
        nextY += rect.height + CONTAINER_ROW_GAP
      }
      bandHeight = Math.max(bandHeight, columnHeight)
      nextX += columnWidth + CONTAINER_COLUMN_GAP
    }
    return
  }

  const originX = anchor.x + CONTAINER_INLINE_PADDING
  let nextY = anchor.y + CONTAINER_HEADER_HEIGHT
  for (const [, rowNodeIds] of orderedLayers) {
    const ordered = [...rowNodeIds].sort((left, right) =>
      (anchorById.get(left)?.x ?? rectById.get(left)?.x ?? 0) -
      (anchorById.get(right)?.x ?? rectById.get(right)?.x ?? 0)
    )
    let nextX = originX
    let rowHeight = 0
    for (const nodeId of ordered) {
      const rect = rectById.get(nodeId)
      if (!rect) continue
      if (
        nextX > originX &&
        nextX + rect.width > originX + inlineLimit
      ) {
        nextX = originX
        nextY += rowHeight + CONTAINER_ROW_GAP
        rowHeight = 0
      }
      shiftSubtree(
        nodeId,
        nextX - rect.x,
        nextY - rect.y,
        rectById,
        childIdsByParent
      )
      nextX += rect.width + CONTAINER_COLUMN_GAP
      rowHeight = Math.max(rowHeight, rect.height)
    }
    nextY += rowHeight + CONTAINER_ROW_GAP
  }
}

/**
 * Derive a compact wrapping span from the real child footprints. The square-root
 * target keeps small composites on one line while preventing a wide dependency
 * layer from multiplying the width of every expanded ancestor.
 */
function adaptiveContainerInlineSpan(
  nodeIds: readonly string[],
  rectById: ReadonlyMap<string, NodeRect>
): number {
  const rects = nodeIds.flatMap((nodeId) => {
    const rect = rectById.get(nodeId)
    return rect ? [rect] : []
  })
  if (rects.length === 0) return CONTAINER_MIN_INLINE_SPAN

  const totalFootprint = rects.reduce((total, rect) => (
    total +
    (rect.width + CONTAINER_COLUMN_GAP) *
    (rect.height + CONTAINER_ROW_GAP)
  ), 0)
  const longestChild = Math.max(...rects.map((rect) => rect.width))
  return Math.max(
    longestChild,
    Math.min(
      CONTAINER_MAX_INLINE_SPAN,
      Math.max(CONTAINER_MIN_INLINE_SPAN, Math.ceil(Math.sqrt(totalFootprint * 2)))
    )
  )
}

/**
 * 将一个组合容器的直接子节点按真实依赖分层；无边节点沿用原布局的纵向层。
 * 嵌套后代的跨边先投影到其直接子容器，因此内层展开不会把外层顺序压平。
 */
function containerChildLayers(
  nodeIds: readonly string[],
  anchorById: ReadonlyMap<string, { x: number; y: number }>,
  links: readonly WorkflowLink[],
  visibleParentById: ReadonlyMap<string, string>,
  containerId: string,
  direction: DagLayoutDirection
): Map<string, number> {
  const nodeIdSet = new Set(nodeIds)
  const incoming = new Map(nodeIds.map((nodeId) => [nodeId, new Set<string>()]))
  for (const link of links) {
    const source = directChildInContainer(
      link.source,
      containerId,
      visibleParentById
    )
    const target = directChildInContainer(
      link.target,
      containerId,
      visibleParentById
    )
    if (
      source && target && source !== target &&
      nodeIdSet.has(source) && nodeIdSet.has(target)
    ) {
      incoming.get(target)?.add(source)
    }
  }

  const layers = new Map<string, number>()
  const visiting = new Set<string>()
  const resolve = (nodeId: string): number => {
    const cached = layers.get(nodeId)
    if (cached !== undefined) return cached
    if (visiting.has(nodeId)) return 0
    visiting.add(nodeId)
    const predecessors = [...(incoming.get(nodeId) ?? [])]
    const dependencyLayer = predecessors.length === 0
      ? 0
      : Math.max(...predecessors.map(resolve)) + 1
    visiting.delete(nodeId)
    layers.set(nodeId, dependencyLayer)
    return dependencyLayer
  }
  nodeIds.forEach(resolve)

  if ([...incoming.values()].some((predecessors) => predecessors.size > 0)) {
    return layers
  }
  const orderedAxis = [...new Set(nodeIds.map(
    (nodeId) => direction === 'horizontal'
      ? anchorById.get(nodeId)?.x ?? 0
      : anchorById.get(nodeId)?.y ?? 0
  ))].sort((left, right) => left - right)
  const axisLayers: number[] = []
  for (const axis of orderedAxis) {
    if (
      axisLayers.length === 0 ||
      axis - axisLayers[axisLayers.length - 1]! > CONTAINER_LAYER_TOLERANCE
    ) {
      axisLayers.push(axis)
    }
  }
  return new Map(nodeIds.map((nodeId) => {
    const axis = direction === 'horizontal'
      ? anchorById.get(nodeId)?.x ?? 0
      : anchorById.get(nodeId)?.y ?? 0
    const layer = Math.max(
      0,
      axisLayers.findIndex((layerAxis, index) =>
        axis <= layerAxis + CONTAINER_LAYER_TOLERANCE ||
        index === axisLayers.length - 1
      )
    )
    return [nodeId, layer]
  }))
}

function directChildInContainer(
  nodeId: string,
  containerId: string,
  visibleParentById: ReadonlyMap<string, string>
): string | undefined {
  let candidate = nodeId
  const visited = new Set<string>()
  while (!visited.has(candidate)) {
    visited.add(candidate)
    const parentId = visibleParentById.get(candidate)
    if (!parentId) return undefined
    if (parentId === containerId) return candidate
    candidate = parentId
  }
  return undefined
}

function shiftSubtree(
  nodeId: string,
  deltaX: number,
  deltaY: number,
  rectById: Map<string, NodeRect>,
  childIdsByParent: ReadonlyMap<string, readonly string[]>
): void {
  const rect = rectById.get(nodeId)
  if (rect) {
    rectById.set(nodeId, {
      ...rect,
      x: rect.x + deltaX,
      y: rect.y + deltaY
    })
  }
  for (const childId of childIdsByParent.get(nodeId) ?? []) {
    shiftSubtree(childId, deltaX, deltaY, rectById, childIdsByParent)
  }
}

function rectanglesOverlap(
  left: NodeRect,
  right: NodeRect,
  gap: number
): boolean {
  return left.x < right.x + right.width + gap &&
    left.x + left.width + gap > right.x &&
    left.y < right.y + right.height + gap &&
    left.y + left.height + gap > right.y
}
