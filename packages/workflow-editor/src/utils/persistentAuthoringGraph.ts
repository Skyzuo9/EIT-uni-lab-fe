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
  const nodes: WorkflowNode[] = graph.nodes.map((node) => {
    const template = templates.get(
      String(node.workflow_node_template_uuid || '')
    )
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
      ...position
    }
  })
  const links: WorkflowLink[] = graph.edges.map((edge) => {
    const metaData = isRecord(edge.meta_data) ? edge.meta_data : {}
    return {
      source: String(edge.source_node_uuid),
      target: String(edge.target_node_uuid),
      type: 'control',
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
