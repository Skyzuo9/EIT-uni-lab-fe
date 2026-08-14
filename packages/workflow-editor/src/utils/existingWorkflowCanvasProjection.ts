import type { WorkflowRunPreparation } from '@unilab/services'

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
      ...(node.material_source
        ? {
            materialSource: {
              mode: node.material_source.mode,
              flowRole: node.material_source.flow_role,
              mountUuid: node.material_source.mount_uuid,
              resourceTemplateUuid:
                node.material_source.resource_template_uuid
            }
          }
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
