import type { WorkflowAuthoringGraph } from '@unilab/services'

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
    throw new Error('导入的工作流编辑数据缺少 workflow.uuid')
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

export function nodePosition(value: unknown): { x?: number; y?: number } {
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

export function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
