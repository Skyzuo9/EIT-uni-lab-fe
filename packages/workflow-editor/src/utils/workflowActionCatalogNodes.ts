import type {
  WorkflowActionCatalogSnapshot,
  WorkflowAuthoringGraph
} from '@unilab/services'

import {
  appendCatalogRecords,
  cloneRecord,
  handleTemplateWireValue,
  nodeTemplateWireValue,
  publishedNodeTemplateWireValue,
  publishedWorkflowTemplate,
  typedActionTemplate
} from './workflowActionCatalogModel'

export function createTypedActionNode(
  catalog: WorkflowActionCatalogSnapshot,
  graph: WorkflowAuthoringGraph,
  input: { nodeUuid: string; templateUuid: string; name: string }
): WorkflowAuthoringGraph {
  const template = typedActionTemplate(catalog, input.templateUuid)
  if (graph.nodes.some((node) => node.uuid === input.nodeUuid)) {
    throw new Error('工作流节点 UUID 已存在')
  }
  if (!input.name || graph.nodes.some((node) => node.name === input.name)) {
    throw new Error('工作流节点名称无效或重复')
  }
  const nodeType = typeof template.wireValue?.node_type === 'string' &&
    template.wireValue.node_type
    ? template.wireValue.node_type
    : 'device'
  return {
    ...graph,
    nodes: [
      ...graph.nodes,
      {
        uuid: input.nodeUuid,
        workflow_node_template_uuid: template.uuid,
        name: input.name,
        status: 'idle',
        type: nodeType,
        pose: {},
        param: {},
        action_name: template.name,
        execution_policy: {},
        disabled: false,
        minimized: false,
        meta_data: {
          unilab: {
            input_bindings: {}
          }
        }
      }
    ],
    node_templates: appendCatalogRecords(
      graph.node_templates,
      [cloneRecord(template.wireValue ?? nodeTemplateWireValue(template))],
      'Workflow NodeTemplate'
    ),
    handle_templates: appendCatalogRecords(
      graph.handle_templates,
      template.handles.map((handle) =>
        cloneRecord(handle.wireValue ?? handleTemplateWireValue(handle))
      ),
      'Workflow HandleTemplate'
    )
  }
}

export function createPublishedWorkflowNode(
  catalog: WorkflowActionCatalogSnapshot,
  graph: WorkflowAuthoringGraph,
  input: { nodeUuid: string; templateUuid: string; name: string }
): WorkflowAuthoringGraph {
  const template = publishedWorkflowTemplate(catalog, input.templateUuid)
  if (graph.nodes.some((node) => node.uuid === input.nodeUuid)) {
    throw new Error('工作流节点 UUID 已存在')
  }
  if (!input.name || graph.nodes.some((node) => node.name === input.name)) {
    throw new Error('工作流节点名称无效或重复')
  }
  return {
    ...graph,
    nodes: [
      ...graph.nodes,
      {
        uuid: input.nodeUuid,
        workflow_node_template_uuid: template.uuid,
        name: input.name,
        status: 'idle',
        type: 'workflow',
        pose: {},
        param: {},
        execution_policy: {},
        disabled: false,
        minimized: false,
        meta_data: {
          unilab: {
            input_bindings: {}
          }
        }
      }
    ],
    node_templates: appendCatalogRecords(
      graph.node_templates,
      [cloneRecord(template.wireValue ?? publishedNodeTemplateWireValue(
        template
      ))],
      'Workflow NodeTemplate'
    ),
    handle_templates: appendCatalogRecords(
      graph.handle_templates,
      template.handles.map((handle) =>
        cloneRecord(handle.wireValue ?? handleTemplateWireValue(handle))
      ),
      'Workflow HandleTemplate'
    )
  }
}

