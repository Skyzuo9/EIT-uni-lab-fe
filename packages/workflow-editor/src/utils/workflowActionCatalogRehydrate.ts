import type {
  WorkflowActionCatalogSnapshot,
  WorkflowAuthoringGraph
} from '@unilab/services'

import {
  cloneRecord,
  executableNodeTemplateWireValue,
  handleTemplateWireValue,
  recordValue,
  requireNodeHandle,
  requiredString,
  typedTemplate
} from './workflowActionCatalogModel'

export function rehydrateTypedActionGraph(
  catalog: WorkflowActionCatalogSnapshot,
  graph: WorkflowAuthoringGraph
): WorkflowAuthoringGraph {
  const nodeUuids = new Set<string>()
  const nodesByUuid = new Map<string, WorkflowAuthoringGraph['nodes'][number]>()
  const referencedActionTemplateUuids = new Set<string>()
  const referencedFrameworkTemplateUuids = new Set<string>()
  for (const node of graph.nodes) {
    const nodeUuid = requiredString(node.uuid)
    if (nodeUuids.has(nodeUuid)) throw new Error('工作流节点 UUID 重复')
    nodeUuids.add(nodeUuid)
    nodesByUuid.set(nodeUuid, node)
    const templateUuid = requiredString(node.workflow_node_template_uuid)
    if (node.type === 'material_source') {
      const wireTemplate = graph.node_templates.find(
        (template) => template.uuid === templateUuid
      )
      if (
        !wireTemplate ||
        (
          wireTemplate.type !== 'material_source' &&
          wireTemplate.node_type !== 'material_source'
        )
      ) throw new Error('物料来源框架模板不在候选工作流中')
      referencedFrameworkTemplateUuids.add(templateUuid)
    } else {
      typedTemplate(catalog, templateUuid)
      referencedActionTemplateUuids.add(templateUuid)
    }
    recordValue(node.param)
  }
  const edgeUuids = new Set<string>()
  for (const edge of graph.edges) {
    const edgeUuid = requiredString(edge.uuid)
    if (edgeUuids.has(edgeUuid)) throw new Error('工作流连线 UUID 重复')
    edgeUuids.add(edgeUuid)
    requireRehydratedNodeHandle(
      catalog, graph, nodesByUuid,
      requiredString(edge.source_node_uuid),
      requiredString(edge.source_handle_uuid),
      'source'
    )
    requireRehydratedNodeHandle(
      catalog, graph, nodesByUuid,
      requiredString(edge.target_node_uuid),
      requiredString(edge.target_handle_uuid),
      'target'
    )
  }
  const referencedTemplates = [
    ...catalog.actionTemplates,
    ...catalog.workflowTemplates
  ].filter((template) =>
    referencedActionTemplateUuids.has(template.uuid)
  )
  const frameworkTemplates = graph.node_templates.filter((template) =>
    referencedFrameworkTemplateUuids.has(requiredString(template.uuid))
  )
  const frameworkHandles = graph.handle_templates.filter((handle) =>
    typeof handle.workflow_node_template_uuid === 'string' &&
    referencedFrameworkTemplateUuids.has(handle.workflow_node_template_uuid)
  )
  return {
    ...graph,
    node_templates: [
      ...referencedTemplates.map((template) =>
        cloneRecord(template.wireValue ?? executableNodeTemplateWireValue(
          template
        ))
      ),
      ...frameworkTemplates.map(cloneRecord)
    ],
    handle_templates: [
      ...referencedTemplates.flatMap((template) =>
        template.handles.map((handle) =>
          cloneRecord(handle.wireValue ?? handleTemplateWireValue(handle))
        )
      ),
      ...frameworkHandles.map(cloneRecord)
    ]
  }
}

function requireRehydratedNodeHandle(
  catalog: WorkflowActionCatalogSnapshot,
  graph: WorkflowAuthoringGraph,
  nodesByUuid: ReadonlyMap<string, WorkflowAuthoringGraph['nodes'][number]>,
  nodeUuid: string,
  handleUuid: string,
  ioType: 'source' | 'target'
): void {
  const node = nodesByUuid.get(nodeUuid)
  if (!node) throw new Error('工作流连线引用了不存在的节点')
  if (node.type !== 'material_source') {
    requireNodeHandle(catalog, graph, nodeUuid, handleUuid, ioType)
    return
  }
  const handle = graph.handle_templates.find(
    (item) => item.uuid === handleUuid
  )
  if (
    !handle ||
    handle.workflow_node_template_uuid !== node.workflow_node_template_uuid ||
    handle.io_type !== ioType
  ) throw new Error('框架节点端口不在候选工作流中')
}

