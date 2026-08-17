import type { WorkflowLink, WorkflowNode } from './parseWorkflow'
import {
  isResourceSlotHandle,
  type WorkflowMaterialTraceProjection
} from './workflowMaterialTrace'

const SAMPLE_ROLES = new Set(['primary_sample', 'aliquot_sample'])

export interface WorkflowSampleBackboneProjection {
  hasPrimarySample: boolean
  lineageKeys: string[]
  nodeIds: string[]
}

interface LineageEdge {
  source: string
  target: string
  lineageKey: string
}

/**
 * 投影会在样品交汇后切换身份的动态主线。
 *
 * 当前主线与至少一个其它样品谱系进入同一节点时，若该节点只公开一条不同于
 * 当前身份的新样品输出，后续主线切换到该输出；原样品仍可作为废料等支线保留。
 * 多个新样品输出属于歧义合同，投影失败关闭并保持当前主线。
 *
 * @param nodes 当前可见工作流（Workflow）节点。
 * @param links 当前可见工作流边。
 * @param traces 已由有类型物料占位符（ResourceSlot）边得到的谱系投影。
 * @returns 有序样品谱系和剔除交汇前辅助来源的主线节点。
 */
export function projectWorkflowSampleBackbone(
  nodes: readonly WorkflowNode[],
  links: readonly WorkflowLink[],
  traces: WorkflowMaterialTraceProjection
): WorkflowSampleBackboneProjection {
  const primaryLineage = traces.lineages.find(
    (lineage) => lineage.materialRole === 'primary_sample'
  )
  if (!primaryLineage) {
    return { hasPrimarySample: false, lineageKeys: [], nodeIds: [] }
  }

  const sampleLineageKeys = new Set(
    traces.lineages
      .filter((lineage) => SAMPLE_ROLES.has(lineage.materialRole))
      .map((lineage) => lineage.key)
  )
  const lineageEdges = materialLineageEdges(nodes, links, traces)
  const incomingByNode = lineageSetsByNode(lineageEdges, 'target')
  const outgoingByNode = sampleOutputLineagesByNode(nodes, traces)
  const nodeOrder = new Map(nodes.map((node, index) => [node.id, index]))
  const lineageKeys = [primaryLineage.key]
  const nodeIds: string[] = []
  const seenNodes = new Set<string>()
  const seenLineages = new Set(lineageKeys)
  let currentLineageKey = primaryLineage.key
  let segmentStartNodeId = primaryLineage.sourceNodeUuid

  while (true) {
    const switchNodeId = nearestSampleSwitch(
      segmentStartNodeId,
      currentLineageKey,
      lineageEdges,
      incomingByNode,
      outgoingByNode,
      sampleLineageKeys,
      nodeOrder
    )
    if (!switchNodeId) {
      appendUnique(
        nodeIds,
        seenNodes,
        reachableLineageNodes(
          segmentStartNodeId,
          currentLineageKey,
          lineageEdges,
          nodeOrder
        )
      )
      break
    }

    appendUnique(
      nodeIds,
      seenNodes,
      lineagePath(
        segmentStartNodeId,
        switchNodeId,
        currentLineageKey,
        lineageEdges
      )
    )
    const successor = uniqueNewSampleOutput(
      switchNodeId,
      currentLineageKey,
      incomingByNode,
      outgoingByNode,
      sampleLineageKeys
    )
    if (!successor || seenLineages.has(successor)) break
    lineageKeys.push(successor)
    seenLineages.add(successor)
    currentLineageKey = successor
    segmentStartNodeId = switchNodeId
  }

  return { hasPrimarySample: true, lineageKeys, nodeIds }
}

/** 把可追踪物料边收敛为只含端点与谱系键的只读目录。 */
function materialLineageEdges(
  nodes: readonly WorkflowNode[],
  links: readonly WorkflowLink[],
  traces: WorkflowMaterialTraceProjection
): LineageEdge[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const handleByNode = new Map(nodes.map((node) => [
    node.id,
    new Map((node.handles ?? []).map((handle) => [handle.uuid, handle]))
  ]))
  return links.flatMap((link, index) => {
    const lineageKey = traces.edgeLineages.get(index)
    const sourceHandle = link.sourceHandleUuid
      ? handleByNode.get(link.source)?.get(link.sourceHandleUuid)
      : undefined
    const targetHandle = link.targetHandleUuid
      ? handleByNode.get(link.target)?.get(link.targetHandleUuid)
      : undefined
    if (
      !lineageKey ||
      !nodeById.has(link.source) ||
      !nodeById.has(link.target) ||
      !sourceHandle ||
      !targetHandle ||
      !isResourceSlotHandle(sourceHandle) ||
      !isResourceSlotHandle(targetHandle)
    ) return []
    return [{ source: link.source, target: link.target, lineageKey }]
  })
}

/** 按来源或目标节点汇总边所承载的谱系身份。 */
function lineageSetsByNode(
  edges: readonly LineageEdge[],
  endpoint: 'source' | 'target'
): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>()
  for (const edge of edges) {
    const nodeId = edge[endpoint]
    const lineages = result.get(nodeId) ?? new Set<string>()
    lineages.add(edge.lineageKey)
    result.set(nodeId, lineages)
  }
  return result
}

/** 从公开来源句柄读取节点真正公开的样品输出谱系。 */
function sampleOutputLineagesByNode(
  nodes: readonly WorkflowNode[],
  traces: WorkflowMaterialTraceProjection
): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>()
  for (const node of nodes) {
    const lineagesByHandle = traces.handleLineagesByNode.get(node.id)
    if (!lineagesByHandle) continue
    const outputLineages = new Set<string>()
    for (const handle of node.handles ?? []) {
      if (handle.ioType !== 'source' || !isResourceSlotHandle(handle)) continue
      const lineageKey = lineagesByHandle.get(handle.uuid)
      if (lineageKey) outputLineages.add(lineageKey)
    }
    if (outputLineages.size > 0) result.set(node.id, outputLineages)
  }
  return result
}

/** 查找当前身份沿物料边最早抵达且合同无歧义的样品交汇节点。 */
function nearestSampleSwitch(
  startNodeId: string,
  currentLineageKey: string,
  edges: readonly LineageEdge[],
  incomingByNode: ReadonlyMap<string, ReadonlySet<string>>,
  outgoingByNode: ReadonlyMap<string, ReadonlySet<string>>,
  sampleLineageKeys: ReadonlySet<string>,
  nodeOrder: ReadonlyMap<string, number>
): string | undefined {
  const distance = lineageDistances(startNodeId, currentLineageKey, edges)
  return [...distance]
    .filter(([nodeId, nodeDistance]) =>
      nodeDistance > 0 && Boolean(uniqueNewSampleOutput(
        nodeId,
        currentLineageKey,
        incomingByNode,
        outgoingByNode,
        sampleLineageKeys
      ))
    )
    .sort(([leftId, leftDistance], [rightId, rightDistance]) =>
      leftDistance - rightDistance ||
      (nodeOrder.get(leftId) ?? 0) - (nodeOrder.get(rightId) ?? 0)
    )[0]?.[0]
}

/** 返回交汇点唯一的新样品输出；不存在或歧义时返回 undefined。 */
function uniqueNewSampleOutput(
  nodeId: string,
  currentLineageKey: string,
  incomingByNode: ReadonlyMap<string, ReadonlySet<string>>,
  outgoingByNode: ReadonlyMap<string, ReadonlySet<string>>,
  sampleLineageKeys: ReadonlySet<string>
): string | undefined {
  const incomingSamples = [...(incomingByNode.get(nodeId) ?? [])]
    .filter((lineageKey) => sampleLineageKeys.has(lineageKey))
  if (
    !incomingSamples.includes(currentLineageKey) ||
    new Set(incomingSamples).size < 2
  ) return undefined
  const successors = [...(outgoingByNode.get(nodeId) ?? [])]
    .filter((lineageKey) =>
      sampleLineageKeys.has(lineageKey) && lineageKey !== currentLineageKey
    )
  return new Set(successors).size === 1 ? successors[0] : undefined
}

/** 计算指定谱系从起点沿前向物料边到每个节点的最短距离。 */
function lineageDistances(
  startNodeId: string,
  lineageKey: string,
  edges: readonly LineageEdge[]
): Map<string, number> {
  const outgoing = new Map<string, string[]>()
  for (const edge of edges) {
    if (edge.lineageKey !== lineageKey) continue
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target])
  }
  const distance = new Map([[startNodeId, 0]])
  const queue = [startNodeId]
  while (queue.length > 0) {
    const nodeId = queue.shift()!
    for (const target of outgoing.get(nodeId) ?? []) {
      if (distance.has(target)) continue
      distance.set(target, (distance.get(nodeId) ?? 0) + 1)
      queue.push(target)
    }
  }
  return distance
}

/** 返回同一线性物料身份从起点到终点的确定路径。 */
function lineagePath(
  startNodeId: string,
  endNodeId: string,
  lineageKey: string,
  edges: readonly LineageEdge[]
): string[] {
  const outgoing = new Map<string, string[]>()
  for (const edge of edges) {
    if (edge.lineageKey !== lineageKey) continue
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target])
  }
  const parent = new Map<string, string>()
  const queue = [startNodeId]
  const visited = new Set(queue)
  while (queue.length > 0 && !visited.has(endNodeId)) {
    const nodeId = queue.shift()!
    for (const target of outgoing.get(nodeId) ?? []) {
      if (visited.has(target)) continue
      visited.add(target)
      parent.set(target, nodeId)
      queue.push(target)
    }
  }
  if (!visited.has(endNodeId)) return [startNodeId]
  const path = [endNodeId]
  while (path[0] !== startNodeId) path.unshift(parent.get(path[0]!)!)
  return path
}

/** 返回指定谱系在当前交汇点之后仍可到达的全部节点。 */
function reachableLineageNodes(
  startNodeId: string,
  lineageKey: string,
  edges: readonly LineageEdge[],
  nodeOrder: ReadonlyMap<string, number>
): string[] {
  return [...lineageDistances(startNodeId, lineageKey, edges)]
    .sort(([leftId, leftDistance], [rightId, rightDistance]) =>
      leftDistance - rightDistance ||
      (nodeOrder.get(leftId) ?? 0) - (nodeOrder.get(rightId) ?? 0)
    )
    .map(([nodeId]) => nodeId)
}

/** 依次追加未出现的主线节点，避免交汇节点在相邻谱系段重复。 */
function appendUnique(
  target: string[],
  seen: Set<string>,
  source: readonly string[]
): void {
  for (const nodeId of source) {
    if (seen.has(nodeId)) continue
    seen.add(nodeId)
    target.push(nodeId)
  }
}
