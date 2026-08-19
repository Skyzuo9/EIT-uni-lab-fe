import type {
  WorkflowHandlePort,
  WorkflowLink,
  WorkflowNode
} from './parseWorkflow'
import type { MaterialShapeSpec } from '@unilab/material'

export interface WorkflowMaterialChip {
  handleUuid: string
  sourceNodeUuid: string
  sourceNodeName: string
  sourceHandleName: string
  accent: string
  shape?: MaterialShapeSpec
}

export interface WorkflowMaterialTraceProjection {
  edgeAccents: Map<number, string>
  edgeLineages: Map<number, string>
  handleAccentsByNode: Map<string, Map<string, string>>
  handleLineagesByNode: Map<string, Map<string, string>>
  handleRolesByNode: Map<string, Map<string, string>>
  materialSourceAccents: Map<string, string>
  chipsByNode: Map<string, WorkflowMaterialChip[]>
  lineages: WorkflowMaterialLineage[]
}

export interface WorkflowMaterialLineage {
  key: string
  sourceNodeUuid: string
  sourceNodeName: string
  sourceHandleName: string
  materialRole: string
  accent: string
  shape?: MaterialShapeSpec
}

export interface WorkflowMaterialRoleOption {
  value: string
  label: string
  accent: string
  lineageCount: number
}

export interface WorkflowMaterialRoleProjection {
  nodes: WorkflowNode[]
  links: WorkflowLink[]
}

interface MaterialEdge {
  index: number
  sourceNode: WorkflowNode
  sourceHandle: WorkflowHandlePort
  targetNode: WorkflowNode
  targetHandle: WorkflowHandlePort
}

export function materialTraceAccent(identity: string): string {
  let hash = 2166136261
  for (let index = 0; index < identity.length; index += 1) {
    hash ^= identity.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  const unsigned = hash >>> 0
  return hslToHex(
    unsigned % 360,
    62 + ((unsigned >>> 9) % 15),
    43 + ((unsigned >>> 17) % 10)
  )
}

/** 返回物料角色的稳定中文标签；未知角色保留原值以支持 OS 扩展。 */
export function workflowMaterialRoleLabel(materialRole: string): string {
  return {
    primary_sample: '主样品',
    aliquot_sample: '分装样品',
    reagent: '试剂',
    consumable: '耗材',
    derived: '过程产物',
    unclassified: '未分类'
  }[materialRole] || materialRole
}

/**
 * 汇总当前图实际出现的物料角色，并保留每个角色首条谱系的色标作为筛选提示。
 */
export function workflowMaterialRoleOptions(
  projection: WorkflowMaterialTraceProjection
): WorkflowMaterialRoleOption[] {
  const options = new Map<string, WorkflowMaterialRoleOption>()
  for (const lineage of projection.lineages) {
    const current = options.get(lineage.materialRole)
    options.set(lineage.materialRole, current
      ? { ...current, lineageCount: current.lineageCount + 1 }
      : {
          value: lineage.materialRole,
          label: workflowMaterialRoleLabel(lineage.materialRole),
          accent: lineage.accent,
          lineageCount: 1
        })
  }
  return [...options.values()]
}

/**
 * 只保留承载任一可见物料流角色（MaterialFlowRole）的节点、对应物料边，
 * 以及可见节点之间的结构边。共享操作节点只要仍承载一种可见物料就会保留。
 * 过滤仅作用于画布投影，不修改 OS 权威工作流图（Workflow Graph）。
 *
 * @param nodes 当前权威工作流图投影出的全部节点。
 * @param links 当前权威工作流图投影出的全部边。
 * @param visibleMaterialRoles 可见角色集合；null 表示显示全部角色。
 * @param projection 可复用的物料流追踪投影，省略时由当前图计算。
 * @returns 仅包含所选角色及其共享操作节点的画布投影。
 */
export function filterWorkflowByMaterialRoles(
  nodes: readonly WorkflowNode[],
  links: readonly WorkflowLink[],
  visibleMaterialRoles: ReadonlySet<string> | null,
  projection = projectMaterialTraces(nodes, links)
): WorkflowMaterialRoleProjection {
  if (!visibleMaterialRoles) return { nodes: [...nodes], links: [...links] }
  const lineageKeys = new Set(
    projection.lineages
      .filter((lineage) => visibleMaterialRoles.has(lineage.materialRole))
      .map((lineage) => lineage.key)
  )
  if (lineageKeys.size === 0) return { nodes: [], links: [] }

  const visibleNodeIds = new Set<string>()
  for (const lineage of projection.lineages) {
    if (lineageKeys.has(lineage.key)) {
      visibleNodeIds.add(lineage.sourceNodeUuid)
    }
  }
  for (const [nodeUuid, handles] of projection.handleLineagesByNode) {
    if ([...handles.values()].some((key) => lineageKeys.has(key))) {
      visibleNodeIds.add(nodeUuid)
    }
  }
  links.forEach((link, index) => {
    const lineageKey = projection.edgeLineages.get(index)
    if (!lineageKey || !lineageKeys.has(lineageKey)) return
    visibleNodeIds.add(link.source)
    visibleNodeIds.add(link.target)
  })

  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  for (const nodeUuid of [...visibleNodeIds]) {
    let parentUuid = nodeById.get(nodeUuid)?.parentGroupId
    while (parentUuid) {
      if (visibleNodeIds.has(parentUuid)) break
      visibleNodeIds.add(parentUuid)
      parentUuid = nodeById.get(parentUuid)?.parentGroupId
    }
  }

  return {
    nodes: nodes.filter((node) => visibleNodeIds.has(node.id)),
    links: links.filter((link, index) => {
      const lineageKey = projection.edgeLineages.get(index)
      return lineageKey
        ? lineageKeys.has(lineageKey)
        : visibleNodeIds.has(link.source) && visibleNodeIds.has(link.target)
    })
  }
}

/**
 * 兼容既有单一物料流角色（MaterialFlowRole）聚焦调用。
 *
 * @param nodes 当前权威工作流图投影出的全部节点。
 * @param links 当前权威工作流图投影出的全部边。
 * @param materialRole 唯一可见角色；null 表示显示全部角色。
 * @param projection 可复用的物料流追踪投影。
 * @returns 与多角色可见性投影相同结构的节点与边。
 */
export function filterWorkflowByMaterialRole(
  nodes: readonly WorkflowNode[],
  links: readonly WorkflowLink[],
  materialRole: string | null,
  projection = projectMaterialTraces(nodes, links)
): WorkflowMaterialRoleProjection {
  return filterWorkflowByMaterialRoles(
    nodes,
    links,
    materialRole ? new Set([materialRole]) : null,
    projection
  )
}

/**
 * 从有类型物料占位符（ResourceSlot）边投影物料流身份、颜色与节点标签。
 *
 * @param nodes 当前可见工作流（Workflow）节点。
 * @param links 当前可见工作流边；只有两端均为物料占位符的边会进入投影。
 * @returns 可按边、句柄和来源查询的物料流（MaterialFlow）追踪投影。
 */
export function projectMaterialTraces(
  nodes: readonly WorkflowNode[],
  links: readonly WorkflowLink[]
): WorkflowMaterialTraceProjection {
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const handleByNode = new Map(nodes.map((node) => [
    node.id,
    new Map((node.handles ?? []).map((handle) => [handle.uuid, handle]))
  ]))
  const materialEdges = links.flatMap((link, index) => {
    const sourceNode = nodeById.get(link.source)
    const targetNode = nodeById.get(link.target)
    const sourceHandle = link.sourceHandleUuid
      ? handleByNode.get(link.source)?.get(link.sourceHandleUuid)
      : undefined
    const targetHandle = link.targetHandleUuid
      ? handleByNode.get(link.target)?.get(link.targetHandleUuid)
      : undefined
    const sourceIoType = link.compositeBoundaryBridge === 'target'
      ? 'target'
      : 'source'
    const targetIoType = link.compositeBoundaryBridge === 'source'
      ? 'source'
      : 'target'
    if (
      !sourceNode ||
      !targetNode ||
      !sourceHandle ||
      !targetHandle ||
      sourceHandle.ioType !== sourceIoType ||
      targetHandle.ioType !== targetIoType ||
      !isResourceSlotHandle(sourceHandle) ||
      !isResourceSlotHandle(targetHandle)
    ) return []
    return [{
      index,
      sourceNode,
      sourceHandle,
      targetNode,
      targetHandle
    } satisfies MaterialEdge]
  })
  const outgoingByHandle = new Map<string, MaterialEdge[]>()
  for (const edge of materialEdges) {
    const key = handleIdentity(edge.sourceNode.id, edge.sourceHandle.uuid)
    const outgoing = outgoingByHandle.get(key) ?? []
    outgoing.push(edge)
    outgoingByHandle.set(key, outgoing)
  }

  const edgeAccents = new Map<number, string>()
  const edgeLineages = new Map<number, string>()
  const handleAccentsByNode = new Map<string, Map<string, string>>()
  const handleLineagesByNode = new Map<string, Map<string, string>>()
  // `handleRolesByNode` 让画布只调整物料流角色（MaterialFlowRole）的视觉层级，
  // 不需要再次猜测物料来源（MaterialSource）或改写权威工作流图。
  const handleRolesByNode = new Map<string, Map<string, string>>()
  const materialSourceAccents = new Map<string, string>()
  const chipsByNode = new Map<string, WorkflowMaterialChip[]>()
  const lineages: WorkflowMaterialLineage[] = []
  const lineageKeys = new Set<string>()
  const visited = new Set<string>()
  const usedAccents = new Set<string>()
  const accentsByLineage = new Map<string, string>()
  const accentFor = (lineageKey: string): string => {
    const existing = accentsByLineage.get(lineageKey)
    if (existing) return existing
    let accent = materialTraceAccent(lineageKey)
    let offset = 1
    while (usedAccents.has(accent)) {
      accent = materialTraceAccent(`${lineageKey}#${offset}`)
      offset += 1
    }
    accentsByLineage.set(lineageKey, accent)
    usedAccents.add(accent)
    return accent
  }

  const traceFrom = (
    sourceNode: WorkflowNode,
    sourceHandle: WorkflowHandlePort,
    lineage: WorkflowMaterialLineage
  ): void => {
    if (!lineageKeys.has(lineage.key)) {
      lineageKeys.add(lineage.key)
      lineages.push(lineage)
    }
    const queue: Array<{
      node: WorkflowNode
      handle: WorkflowHandlePort
    }> = [{ node: sourceNode, handle: sourceHandle }]
    while (queue.length > 0) {
      const current = queue.shift()
      if (!current) continue
      const currentIdentity = handleIdentity(current.node.id, current.handle.uuid)
      const visitKey = `${lineage.key}:${currentIdentity}`
      if (visited.has(visitKey)) continue
      visited.add(visitKey)
      setHandleAccent(
        handleAccentsByNode,
        current.node.id,
        current.handle.uuid,
        lineage.accent
      )
      setHandleLineage(
        handleLineagesByNode,
        current.node.id,
        current.handle.uuid,
        lineage.key
      )
      setHandleRole(
        handleRolesByNode,
        current.node.id,
        current.handle.uuid,
        lineage.materialRole
      )
      for (const edge of outgoingByHandle.get(currentIdentity) ?? []) {
        edgeAccents.set(edge.index, lineage.accent)
        edgeLineages.set(edge.index, lineage.key)
        setHandleAccent(
          handleAccentsByNode,
          edge.targetNode.id,
          edge.targetHandle.uuid,
          lineage.accent
        )
        setHandleLineage(
          handleLineagesByNode,
          edge.targetNode.id,
          edge.targetHandle.uuid,
          lineage.key
        )
        setHandleRole(
          handleRolesByNode,
          edge.targetNode.id,
          edge.targetHandle.uuid,
          lineage.materialRole
        )
        addMaterialChip(chipsByNode, edge.targetNode.id, {
          handleUuid: edge.targetHandle.uuid,
          sourceNodeUuid: lineage.sourceNodeUuid,
          sourceNodeName: lineage.sourceNodeName,
          sourceHandleName: lineage.sourceHandleName,
          accent: lineage.accent,
          ...(lineage.shape ? { shape: lineage.shape } : {})
        })

        // Boundary bridge segments reuse the declared parent Handle through a
        // transparent reverse React Flow Handle. Re-enqueueing that identity
        // makes the next segment explicit instead of visually jumping across
        // the expanded Composite.
        queue.push({ node: edge.targetNode, handle: edge.targetHandle })
        const passThrough = edge.targetHandle.ioType === 'target'
          ? passThroughHandles(edge.targetNode, edge.targetHandle)
          : []
        for (const nextHandle of passThrough) {
          setHandleAccent(
            handleAccentsByNode,
            edge.targetNode.id,
            nextHandle.uuid,
            lineage.accent
          )
          setHandleLineage(
            handleLineagesByNode,
            edge.targetNode.id,
            nextHandle.uuid,
            lineage.key
          )
          setHandleRole(
            handleRolesByNode,
            edge.targetNode.id,
            nextHandle.uuid,
            lineage.materialRole
          )
          queue.push({ node: edge.targetNode, handle: nextHandle })
        }
      }
    }
  }

  for (const node of nodes) {
    if (node.type !== 'material_source') continue
    for (const handle of node.handles ?? []) {
      if (handle.ioType !== 'source' || !isResourceSlotHandle(handle)) continue
      const lineage = rootLineage(node, handle, true, accentFor)
      materialSourceAccents.set(node.id, lineage.accent)
      traceFrom(node, handle, lineage)
    }
  }

  // 先从没有未追踪同字段输入的上游输出开始，再沿透传链向下推进。
  // 这样即使 OS 返回的边顺序从下游到上游，也不会把同一物料拆成多个身份。
  let untraced = materialEdges.filter((edge) => !edgeAccents.has(edge.index))
  while (untraced.length > 0) {
    const root = untraced.find((edge) =>
      !hasUntracedPassThroughPredecessor(edge, untraced)
    ) ?? untraced[0]
    traceFrom(
      root.sourceNode,
      root.sourceHandle,
      rootLineage(root.sourceNode, root.sourceHandle, false, accentFor)
    )
    untraced = materialEdges.filter((edge) => !edgeAccents.has(edge.index))
  }

  return {
    edgeAccents,
    edgeLineages,
    handleAccentsByNode,
    handleLineagesByNode,
    handleRolesByNode,
    materialSourceAccents,
    chipsByNode,
    lineages
  }
}

/**
 * 判断一条未追踪物料边的来源输出是否仍在等待同字段上游输入。
 *
 * @param edge 当前候选物料边。
 * @param untraced 尚未归属物料身份的全部物料边。
 * @returns 存在会透传到该输出的未追踪输入边时返回真。
 */
function hasUntracedPassThroughPredecessor(
  edge: MaterialEdge,
  untraced: readonly MaterialEdge[]
): boolean {
  const sourceKey = edge.sourceHandle.dataKey ?? edge.sourceHandle.handleKey
  const inputHandleUuids = new Set(
    (edge.sourceNode.handles ?? [])
      .filter((handle) =>
        handle.ioType === 'target' &&
        isResourceSlotHandle(handle) &&
        (handle.dataKey ?? handle.handleKey) === sourceKey
      )
      .map((handle) => handle.uuid)
  )
  return untraced.some((candidate) =>
    candidate.targetNode.id === edge.sourceNode.id &&
    inputHandleUuids.has(candidate.targetHandle.uuid)
  )
}

/**
 * 查找与输入 Handle 共享同一字段的 ResourceSlot 输出。
 *
 * @param node 当前操作节点。
 * @param targetHandle 已收到上游物料身份的输入 Handle。
 * @returns 承载同一物料身份的同字段输出 Handle。
 */
function passThroughHandles(
  node: WorkflowNode,
  targetHandle: WorkflowHandlePort
): WorkflowHandlePort[] {
  const targetKey = targetHandle.dataKey ?? targetHandle.handleKey
  return (node.handles ?? []).filter((handle) =>
    handle.ioType === 'source' &&
    isResourceSlotHandle(handle) &&
    (handle.dataKey ?? handle.handleKey) === targetKey
  )
}

export function isResourceSlotHandle(handle: WorkflowHandlePort): boolean {
  if (handle.valueType === 'ResourceSlot') return true
  return isResourceSlotSchema(handle.valueSchema)
}

function isResourceSlotSchema(value: unknown): boolean {
  if (!isRecord(value)) return false
  if (value.$slot === 'ResourceSlot') return true
  if (!Array.isArray(value.anyOf)) return false
  return value.anyOf.some((candidate) =>
    isRecord(candidate) && candidate.$slot === 'ResourceSlot'
  )
}

function rootLineage(
  node: WorkflowNode,
  handle: WorkflowHandlePort,
  materialSource: boolean,
  accentFor: (lineageKey: string) => string
): WorkflowMaterialLineage {
  const key = materialSource ? node.id : `${node.id}:${handle.uuid}`
  return {
    key,
    sourceNodeUuid: node.id,
    sourceNodeName: node.name,
    sourceHandleName: handle.displayName || handle.handleKey,
    materialRole: materialSource
      ? node.materialSource?.flowRole || 'unclassified'
      : 'derived',
    accent: accentFor(key),
    ...(materialSource && node.materialSource?.shape
      ? { shape: node.materialSource.shape }
      : {})
  }
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const saturationRatio = saturation / 100
  const lightnessRatio = lightness / 100
  const chroma = (1 - Math.abs(2 * lightnessRatio - 1)) * saturationRatio
  const segment = hue / 60
  const secondary = chroma * (1 - Math.abs((segment % 2) - 1))
  const [red, green, blue] = segment < 1
    ? [chroma, secondary, 0]
    : segment < 2
      ? [secondary, chroma, 0]
      : segment < 3
        ? [0, chroma, secondary]
        : segment < 4
          ? [0, secondary, chroma]
          : segment < 5
            ? [secondary, 0, chroma]
            : [chroma, 0, secondary]
  const match = lightnessRatio - chroma / 2
  return `#${[red, green, blue].map((channel) =>
    Math.round((channel + match) * 255).toString(16).padStart(2, '0')
  ).join('')}`
}

/**
 * 记录一个句柄当前承载的物料流身份；已有身份优先，避免合流时静默改写。
 *
 * @param lineages 按节点和句柄组织的物料流身份索引。
 * @param nodeUuid 工作流节点 UUID。
 * @param handleUuid 物料占位符句柄 UUID。
 * @param lineageKey 物料流身份键。
 * @returns 无返回值；索引在原位置更新。
 */
function setHandleLineage(
  lineages: Map<string, Map<string, string>>,
  nodeUuid: string,
  handleUuid: string,
  lineageKey: string
): void {
  const nodeLineages = lineages.get(nodeUuid) ?? new Map<string, string>()
  if (!nodeLineages.has(handleUuid)) nodeLineages.set(handleUuid, lineageKey)
  lineages.set(nodeUuid, nodeLineages)
}

/**
 * 记录句柄承载的物料流角色（MaterialFlowRole），供只读画布投影分层使用。
 *
 * @param roles 按节点和句柄组织的物料流角色索引。
 * @param nodeUuid 工作流（Workflow）节点 UUID。
 * @param handleUuid 物料占位符（ResourceSlot）句柄 UUID。
 * @param materialRole 当前物料链的物料流角色。
 * @returns 无返回值；索引在原位置更新。
 */
function setHandleRole(
  roles: Map<string, Map<string, string>>,
  nodeUuid: string,
  handleUuid: string,
  materialRole: string
): void {
  // `nodeRoles` 保留同一句柄最先解析出的权威物料角色，合流时不静默覆盖。
  const nodeRoles = roles.get(nodeUuid) ?? new Map<string, string>()
  if (!nodeRoles.has(handleUuid)) nodeRoles.set(handleUuid, materialRole)
  roles.set(nodeUuid, nodeRoles)
}

function setHandleAccent(
  accents: Map<string, Map<string, string>>,
  nodeUuid: string,
  handleUuid: string,
  accent: string
): void {
  const nodeAccents = accents.get(nodeUuid) ?? new Map<string, string>()
  if (!nodeAccents.has(handleUuid)) nodeAccents.set(handleUuid, accent)
  accents.set(nodeUuid, nodeAccents)
}

function addMaterialChip(
  chipsByNode: Map<string, WorkflowMaterialChip[]>,
  nodeUuid: string,
  chip: WorkflowMaterialChip
): void {
  const chips = chipsByNode.get(nodeUuid) ?? []
  if (!chips.some((candidate) =>
    candidate.handleUuid === chip.handleUuid &&
    candidate.sourceNodeUuid === chip.sourceNodeUuid
  )) chips.push(chip)
  chipsByNode.set(nodeUuid, chips)
}

function handleIdentity(nodeUuid: string, handleUuid: string): string {
  return `${nodeUuid}:${handleUuid}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
