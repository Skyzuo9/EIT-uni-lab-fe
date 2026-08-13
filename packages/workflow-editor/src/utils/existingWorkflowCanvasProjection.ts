import type {
  BackendWorkflowGraph,
  WorkflowRunPreparation
} from '@unilab/services'

import type { WorkflowStructure } from './parseWorkflow'

/**
 * 把 Backend 已有工作流的只读定义快照投影到 dev 工作流画布使用的统一结构。
 *
 * @param preparation Backend 权威读取的工作流修订、节点、端口与有向边。
 * @returns 不具备创作写权限的工作流画布结构；运行状态由任务投影另行覆盖。
 */
export function projectExistingWorkflowCanvas(
  preparation: WorkflowRunPreparation | null
): WorkflowStructure {
  if (!preparation) return { nodes: [], links: [], steps: [], error: null }
  return {
    nodes: preparation.nodes.map((node) => ({
      id: node.workflow_node_uuid,
      name: node.name,
      ...(node.description ? { description: node.description } : {}),
      type: node.type,
      className: node.action_type || node.action_name || node.type,
      labNodeType: node.type,
      disabled: node.disabled,
      authoringReadOnly: true,
      authoringReadOnlyReason: 'Backend 画布当前仅用于查看和运行已有工作流',
      ...(node.position
        ? { x: node.position.x, y: node.position.y }
        : {}),
      handles: node.handles.map((handle) => ({
        uuid: handle.uuid,
        handleKey: handle.handle_key,
        displayName: handle.display_name,
        ioType: handle.io_type,
        valueType: handle.value_type,
        dataKey: handle.data_key ?? null
      }))
    })),
    links: preparation.edges.map((edge) => ({
      id: edge.uuid,
      source: edge.source_node_uuid,
      target: edge.target_node_uuid,
      type: 'control',
      sourceHandleUuid: edge.source_handle_uuid,
      targetHandleUuid: edge.target_handle_uuid
    })),
    steps: preparation.nodes.map((node) => ({
      action: node.action_name || node.type,
      args: {},
      schema: null
    })),
    error: null
  }
}

/** 把 Go Backend 完整图投影为允许直接画布编辑的统一结构。 */
export function projectEditableBackendWorkflowCanvas(
  graph: BackendWorkflowGraph | null
): WorkflowStructure {
  if (!graph) return { nodes: [], links: [], steps: [], error: null }
  const handlesByTemplate = new Map<string, Array<Record<string, unknown>>>()
  for (const handle of graph.handle_templates) {
    const templateUuid = text(handle.workflow_node_template_uuid)
    if (!templateUuid) continue
    const handles = handlesByTemplate.get(templateUuid) ?? []
    handles.push(handle)
    handlesByTemplate.set(templateUuid, handles)
  }
  return {
    nodes: graph.nodes.map(node => {
      const templateUuid = text(node.workflow_node_template_uuid)
      const position = canvasPosition(node.pose)
      const description = text(node.description)
      const actionType = text(node.action_type)
      const actionName = text(node.action_name)
      return {
        id: node.uuid,
        name: node.name,
        ...(description ? { description } : {}),
        type: node.type,
        className: actionType || actionName || node.type,
        labNodeType: node.type,
        disabled: node.disabled,
        ...(position ? position : {}),
        handles: (templateUuid
          ? handlesByTemplate.get(templateUuid) ?? []
          : []).flatMap(handle => {
          const uuid = text(handle.uuid)
          const handleKey = text(handle.handle_key)
          const displayName = text(handle.display_name)
          const ioType = handle.io_type
          const valueType = text(handle.type)
          if (
            !uuid || !handleKey || !displayName || !valueType ||
            (ioType !== 'source' && ioType !== 'target')
          ) return []
          return [{
            uuid,
            handleKey,
            displayName,
            ioType,
            valueType,
            dataKey: text(handle.data_key)
          }]
        })
      }
    }),
    links: graph.edges.map(edge => ({
      id: edge.uuid,
      source: edge.source_node_uuid,
      target: edge.target_node_uuid,
      type: 'control',
      sourceHandleUuid: edge.source_handle_uuid,
      targetHandleUuid: edge.target_handle_uuid
    })),
    steps: graph.nodes.map(node => ({
      action: text(node.action_name) || node.type,
      args: record(node.param),
      schema: null
    })),
    error: null
  }
}

function canvasPosition(value: unknown): { x: number; y: number } | null {
  const pose = record(value)
  const nested = record(pose.position)
  const x = finite(pose.x) ?? finite(nested.x)
  const y = finite(pose.y) ?? finite(nested.y)
  return x === null || y === null ? null : { x, y }
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
