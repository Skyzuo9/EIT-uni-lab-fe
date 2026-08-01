import type { WorkflowAuthoringGraph } from '@unilab/services'

import type {
  WorkflowLink,
  WorkflowNode,
  WorkflowStructure
} from './parseWorkflow'

export function projectPersistentAuthoringGraph(
  graph: WorkflowAuthoringGraph
): WorkflowStructure {
  const templates = new Map(
    graph.node_templates.map((template) => [
      String(template.uuid || ''),
      template
    ])
  )
  const handlesByTemplate = new Map<string, WorkflowNode['handles']>()
  for (const handle of graph.handle_templates) {
    const templateUuid = String(handle.workflow_node_template_uuid || '')
    const ioType = String(handle.io_type || '')
    if (!templateUuid || (ioType !== 'source' && ioType !== 'target')) continue
    const handles = handlesByTemplate.get(templateUuid) ?? []
    handles.push({
      uuid: String(handle.uuid || ''),
      handleKey: String(handle.handle_key || ''),
      displayName: String(handle.display_name || handle.handle_key || ''),
      ioType
    })
    handlesByTemplate.set(templateUuid, handles)
  }
  const nodes: WorkflowNode[] = graph.nodes.map((node) => {
    const templateUuid = String(node.workflow_node_template_uuid || '')
    const template = templates.get(templateUuid)
    const type = String(
      node.type || template?.node_type || template?.type || 'action'
    )
    const position = nodePosition(node.pose)
    return {
      id: String(node.uuid),
      name: String(
        node.name || template?.display_name || template?.name || node.uuid
      ),
      type,
      className: String(
        node.action_type || node.action_name || template?.class || type
      ),
      labNodeType: type,
      handles: handlesByTemplate.get(templateUuid) ?? [],
      ...position
    }
  })
  const links: WorkflowLink[] = graph.edges.map((edge) => {
    const metaData = isRecord(edge.meta_data) ? edge.meta_data : {}
    return {
      source: String(edge.source_node_uuid),
      target: String(edge.target_node_uuid),
      type: 'control',
      sourceHandleUuid: String(edge.source_handle_uuid || ''),
      targetHandleUuid: String(edge.target_handle_uuid || ''),
      branch: typeof metaData.branch === 'string'
        ? metaData.branch
        : null
    }
  })
  return {
    nodes,
    links,
    steps: graph.nodes.map((node) => ({
      action: String(node.action_name || node.type || 'action'),
      args: isRecord(node.param) ? node.param : {},
      schema: null
    })),
    error: null
  }
}

export function updatePersistentAuthoringNodeName(
  graph: WorkflowAuthoringGraph,
  nodeUuid: string,
  rawName: string
): WorkflowAuthoringGraph {
  const name = rawName.trim()
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error('节点名称必须是可生成 Python 的标识符')
  }
  if (graph.nodes.some(
    (node) => node.uuid !== nodeUuid && node.name === name
  )) {
    throw new Error('节点名称不能重复')
  }
  if (!graph.nodes.some((node) => node.uuid === nodeUuid)) {
    throw new Error('节点不存在或已被删除')
  }
  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      if (node.uuid !== nodeUuid) return node
      return {
        ...node,
        name
      }
    })
  }
}

export function parseWorkflowAuthoringGraphImport(
  content: string,
  workflowUuid: string
): WorkflowAuthoringGraph {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new Error('JSON 文件无法解析，请检查文件格式')
  }
  const root = isRecord(parsed) && isRecord(parsed.data)
    ? parsed.data
    : parsed
  const graph = importedGraphCandidate(root)
  if (!isWorkflowAuthoringGraph(graph)) {
    throw new Error(
      '当前持久 Authoring 只接受 OS WorkflowAuthoringGraph 导出；' +
      'Canonical v2/Cloud JSON 需要先提供 OS conversion contract'
    )
  }
  const importedWorkflowUuid = String(graph.workflow.uuid || '')
  if (!importedWorkflowUuid) {
    throw new Error('导入的 Authoring Graph 缺少 workflow.uuid')
  }
  if (importedWorkflowUuid !== workflowUuid) {
    throw new Error(
      `导入文件属于 Workflow ${importedWorkflowUuid}，` +
      `不能覆盖当前 Workflow ${workflowUuid}`
    )
  }
  return graph
}

function importedGraphCandidate(value: unknown): unknown {
  if (!isRecord(value)) return null
  if (isRecord(value.graph)) return value.graph
  if (isRecord(value.candidate) && isRecord(value.candidate.graph)) {
    return value.candidate.graph
  }
  if (isRecord(value.applied_graph)) return value.applied_graph
  return value
}

function isWorkflowAuthoringGraph(
  value: unknown
): value is WorkflowAuthoringGraph {
  if (!isRecord(value) || !isRecord(value.workflow)) return false
  return [
    value.nodes,
    value.edges,
    value.node_templates,
    value.handle_templates
  ].every((items) =>
    Array.isArray(items) && items.every((item) => isRecord(item))
  )
}

function nodePosition(value: unknown): { x?: number; y?: number } {
  const pose = isRecord(value) ? value : {}
  const position = isRecord(pose.position) ? pose.position : pose
  return {
    ...(finite(position.x) === undefined ? {} : { x: finite(position.x) }),
    ...(finite(position.y) === undefined ? {} : { y: finite(position.y) })
  }
}

function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
