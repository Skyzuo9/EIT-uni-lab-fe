import type { WorkflowRevision } from '@unilab/services'
import type { WorkflowStructure } from './parseWorkflow'
import { parseCanonicalWorkflow } from './canonicalWorkflow'

export interface CloudWorkflowMigrationResult {
  revision: WorkflowRevision | null
  warnings: string[]
  error: string | null
}

interface CloudNode {
  id: string
  name: string
  actionRef: string
  parameters: Record<string, unknown>
  x?: number
  y?: number
  parentId: string
}

interface CloudEdge {
  source: string
  target: string
  sourceHandle: string
  targetHandle: string
  sourceIo: string
  targetIo: string
}

interface MigratedInvocation {
  [key: string]: unknown
  node_id: string
  action_ref: string
  name: string
  input_bindings: Record<string, Record<string, unknown>>
}

/**
 * Strictly migrate one Uni-Lab-Cloud workflow export into the only runnable
 * frontend format: Canonical WorkflowRevision v2.
 *
 * The migration is intentionally fail-closed. Unknown actions are checked by
 * OS validation after import; ambiguous graph semantics are rejected here
 * before a runnable revision is produced.
 */
export function migrateCloudWorkflowJson(
  text: string
): CloudWorkflowMigrationResult {
  const failure = (error: string): CloudWorkflowMigrationResult => ({
    revision: null,
    warnings: [],
    error
  })
  let document: unknown
  try {
    document = JSON.parse(text)
  } catch (error) {
    return failure(
      error instanceof Error ? error.message : 'Cloud JSON 解析失败'
    )
  }
  if (!isRecord(document)) return failure('Cloud 工作流必须是 JSON 对象')

  const data = isRecord(document.data) ? document.data : document
  if (!Array.isArray(data.nodes)) {
    return failure('未找到 data.nodes，不是可识别的 Cloud 工作流导出')
  }
  if (data.nodes.length === 0) {
    return failure('Cloud 工作流没有节点，不能生成可运行修订版本')
  }
  if (!Array.isArray(data.edges)) {
    return failure('未找到 data.edges，Cloud 工作流导出不完整')
  }

  const workflowId = requiredString(
    data.workflow_uuid ?? document.workflow_uuid
  )
  if (!workflowId) {
    return failure('Cloud 工作流缺少 data.workflow_uuid，无法建立稳定工作流身份')
  }

  const nodes: CloudNode[] = []
  const nodeIds = new Set<string>()
  const warnings: string[] = []
  let hasVisualGroups = false
  for (const [index, value] of data.nodes.entries()) {
    if (!isRecord(value)) {
      return failure(`Cloud 节点 ${index + 1} 不是对象`)
    }
    const id = requiredString(value.uuid)
    if (!id) return failure(`Cloud 节点 ${index + 1} 缺少 uuid`)
    if (nodeIds.has(id)) return failure(`Cloud 工作流存在重复节点 UUID：${id}`)
    if (value.disabled === true) {
      return failure(
        `节点 ${id} 已禁用；Cloud 的禁用/旁路语义无法无损映射到 Canonical v2`
      )
    }
    const nodeType = requiredString(value.type)
    const labNodeType = requiredString(value.lab_node_type)
    if (
      nodeType.toLowerCase() === 'group' ||
      labNodeType.toLowerCase() === 'group'
    ) {
      return failure(
        `节点 ${id} 是 Cloud Group；请先在 Cloud 中展开为显式控制流后再导入`
      )
    }
    const deviceName = requiredString(value.device_name)
    const actionName = requiredString(value.template_name)
    if (!deviceName || !actionName) {
      return failure(
        `节点 ${id} 缺少 device_name 或 template_name，无法生成 action_ref`
      )
    }
    const parameters = value.param == null
      ? {}
      : isRecord(value.param)
        ? value.param
        : null
    if (!parameters) return failure(`节点 ${id} 的 param 必须是 JSON 对象`)

    const pose = isRecord(value.pose) ? value.pose : {}
    const position = isRecord(pose.position) ? pose.position : {}
    const parentId = requiredString(value.parent_uuid)
    hasVisualGroups ||= Boolean(parentId)
    nodeIds.add(id)
    nodes.push({
      id,
      name: requiredString(value.name) || actionName,
      actionRef: `${deviceName}.${actionName}`,
      parameters,
      x: finite(position.x),
      y: finite(position.y),
      parentId
    })
  }
  if (hasVisualGroups) {
    warnings.push('Cloud 的 parent_uuid 仅用于画布分组，迁移后已展开为平面执行 DAG')
  }

  const edges: CloudEdge[] = []
  for (const [index, value] of data.edges.entries()) {
    if (!isRecord(value)) return failure(`Cloud 边 ${index + 1} 不是对象`)
    const edge: CloudEdge = {
      source: requiredString(value.source_node_uuid),
      target: requiredString(value.target_node_uuid),
      sourceHandle: requiredString(value.source_handle_key),
      targetHandle: requiredString(value.target_handle_key),
      sourceIo: requiredString(value.source_handle_io),
      targetIo: requiredString(value.target_handle_io)
    }
    if (!edge.source || !edge.target) {
      return failure(`Cloud 边 ${index + 1} 缺少源节点或目标节点 UUID`)
    }
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      return failure(
        `Cloud 边 ${index + 1} 引用了不存在的节点：${edge.source} → ${edge.target}`
      )
    }
    if (!edge.sourceHandle || !edge.targetHandle) {
      return failure(`Cloud 边 ${index + 1} 缺少 handle_key，不能推断边语义`)
    }
    if (
      (edge.sourceIo && edge.sourceIo !== 'source') ||
      (edge.targetIo && edge.targetIo !== 'target')
    ) {
      return failure(
        `Cloud 边 ${index + 1} 的 handle 方向无效：${edge.sourceIo || '-'} → ${
          edge.targetIo || '-'
        }`
      )
    }
    edges.push(edge)
  }

  const invocations: MigratedInvocation[] = nodes.map((node) => ({
    node_id: node.id,
    action_ref: node.actionRef,
    name: node.name,
    input_bindings: Object.fromEntries(
      Object.entries(node.parameters).map(([name, value]) => [
        name,
        { kind: 'literal', value }
      ])
    )
  }))
  const invocationById = new Map(
    invocations.map((invocation) => [invocation.node_id, invocation])
  )
  const controlEdges: WorkflowRevision['control_edges'] = []
  const dataEdges: Array<Record<string, unknown>> = []
  const edgeKeys = new Set<string>()
  const dataTargets = new Set<string>()
  const dependencies: Array<[string, string]> = []

  for (const [index, edge] of edges.entries()) {
    const edgeId = `cloud-edge-${index + 1}`
    const edgeKey = JSON.stringify([
      edge.source,
      edge.sourceHandle,
      edge.target,
      edge.targetHandle
    ])
    if (edgeKeys.has(edgeKey)) {
      return failure(`Cloud 工作流存在重复连接：${edgeKey}`)
    }
    edgeKeys.add(edgeKey)
    dependencies.push([edge.source, edge.target])

    if (edge.sourceHandle === 'ready' && edge.targetHandle === 'ready') {
      controlEdges.push({
        edge_id: edgeId,
        source: edge.source,
        target: edge.target
      })
      continue
    }
    if (edge.sourceHandle === 'ready' || edge.targetHandle === 'ready') {
      return failure(
        `Cloud 边 ${index + 1} 混合了控制 handle 与数据 handle，无法无歧义迁移`
      )
    }

    const targetKey = `${edge.target}.${edge.targetHandle}`
    if (dataTargets.has(targetKey)) {
      return failure(`多个 Cloud 数据边写入同一输入：${targetKey}`)
    }
    const targetInvocation = invocationById.get(edge.target)
    if (!targetInvocation) return failure(`找不到数据边目标节点：${edge.target}`)
    if (Object.hasOwn(targetInvocation.input_bindings, edge.targetHandle)) {
      return failure(
        `输入 ${targetKey} 同时存在字面量参数和数据连接，无法决定优先级`
      )
    }
    dataTargets.add(targetKey)
    targetInvocation.input_bindings[edge.targetHandle] = {
      kind: 'node_output',
      node_id: edge.source,
      output: edge.sourceHandle
    }
    dataEdges.push({
      edge_id: edgeId,
      source: edge.source,
      source_output: edge.sourceHandle,
      target: edge.target,
      target_input: edge.targetHandle
    })
  }

  const cycle = findDependencyCycle(nodes.map((node) => node.id), dependencies)
  if (cycle) {
    return failure(`Cloud 工作流包含依赖环：${cycle.join(' → ')}`)
  }

  const layoutNodes = Object.fromEntries(
    nodes
      .filter((node) => node.x !== undefined || node.y !== undefined)
      .map((node) => [
        node.id,
        {
          ...(node.x !== undefined ? { x: node.x } : {}),
          ...(node.y !== undefined ? { y: node.y } : {})
        }
      ])
  )
  const revision: WorkflowRevision = {
    schema_version: '2',
    revision_id: `cloud-import-${stableHash(text)}`,
    workflow_id: workflowId,
    invocations,
    control_edges: controlEdges,
    data_edges: dataEdges,
    layout: { nodes: layoutNodes }
  }
  return { revision, warnings, error: null }
}

/**
 * Compatibility projection used by the legacy, non-exported preview component.
 * Runnable imports must call migrateCloudWorkflowJson and keep the revision.
 */
export function parseWorkflowJson(text: string): WorkflowStructure {
  const migrated = migrateCloudWorkflowJson(text)
  if (!migrated.revision) {
    return {
      nodes: [],
      links: [],
      steps: [],
      error: migrated.error
    }
  }
  return parseCanonicalWorkflow(JSON.stringify(migrated.revision))
}

function findDependencyCycle(
  nodeIds: string[],
  dependencies: Array<[string, string]>
): string[] | null {
  const adjacency = new Map(nodeIds.map((nodeId) => [nodeId, [] as string[]]))
  for (const [source, target] of dependencies) {
    adjacency.get(source)?.push(target)
  }
  const state = new Map<string, 0 | 1 | 2>()
  const stack: string[] = []
  const visit = (nodeId: string): string[] | null => {
    state.set(nodeId, 1)
    stack.push(nodeId)
    for (const target of adjacency.get(nodeId) || []) {
      if (state.get(target) === 1) {
        const start = stack.indexOf(target)
        return [...stack.slice(start), target]
      }
      if (state.get(target) !== 2) {
        const cycle = visit(target)
        if (cycle) return cycle
      }
    }
    stack.pop()
    state.set(nodeId, 2)
    return null
  }
  for (const nodeId of nodeIds) {
    if (!state.has(nodeId)) {
      const cycle = visit(nodeId)
      if (cycle) return cycle
    }
  }
  return null
}

function stableHash(value: string): string {
  let hash = 0xcbf29ce484222325n
  const prime = 0x100000001b3n
  const bytes = new TextEncoder().encode(value)
  for (const byte of bytes) {
    hash ^= BigInt(byte)
    hash = BigInt.asUintN(64, hash * prime)
  }
  return hash.toString(16).padStart(16, '0')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function requiredString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined
}
