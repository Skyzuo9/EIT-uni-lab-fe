import type {
  WorkflowActionCatalogSnapshot,
  WorkflowActionHandleTemplate,
  WorkflowActionNodeTemplate,
  WorkflowAuthoringGraph,
  WorkflowPublishedNodeTemplate
} from '@unilab/services'

export function appendCatalogRecords(
  existing: Array<Record<string, unknown>>,
  additions: Array<Record<string, unknown>>,
  label: string
): Array<Record<string, unknown>> {
  const identities = new Set<string>()
  for (const item of existing) {
    const uuid = requiredString(item.uuid)
    if (identities.has(uuid)) throw new Error(`${label} UUID 重复`)
    identities.add(uuid)
  }
  const appended = [...existing]
  for (const item of additions) {
    const uuid = requiredString(item.uuid)
    if (identities.has(uuid)) continue
    identities.add(uuid)
    appended.push(item)
  }
  return appended
}

export function nodeTemplateWireValue(
  template: WorkflowActionNodeTemplate
): Record<string, unknown> {
  return {
    uuid: template.uuid,
    resource_template_uuid: template.resourceTemplateUuid,
    name: template.name,
    display_name: template.displayName,
    class: template.actionClass,
    type: template.actionType,
    schema: template.schema,
    goal: template.goal,
    goal_default: template.goalDefault
  }
}

export function executableNodeTemplateWireValue(
  template: ExecutableNodeTemplate
): Record<string, unknown> {
  return 'workflowUuid' in template
    ? publishedNodeTemplateWireValue(template)
    : nodeTemplateWireValue(template)
}

export function publishedNodeTemplateWireValue(
  template: WorkflowPublishedNodeTemplate
): Record<string, unknown> {
  return {
    uuid: template.uuid,
    resource_template_uuid: template.resourceTemplateUuid,
    name: template.name,
    display_name: template.displayName,
    class: template.workflowClass,
    type: 'workflow',
    node_type: 'workflow',
    schema: template.schema,
    goal: template.goal,
    goal_default: template.goalDefault,
    feedback: {},
    result: template.result,
    meta_data: {
      unilab: {
        framework_owner_only: true,
        workflow_source: {
          kind: template.source.kind,
          definition_fqid: template.source.definitionFqid,
          module: template.source.module,
          symbol: template.source.symbol,
          package_catalog_digest: template.source.packageCatalogDigest,
          definition_content_hash: template.source.definitionContentHash
        }
      }
    }
  }
}

export function handleTemplateWireValue(
  handle: WorkflowActionHandleTemplate
): Record<string, unknown> {
  return {
    uuid: handle.uuid,
    workflow_node_template_uuid: handle.workflowNodeTemplateUuid,
    handle_key: handle.handleKey,
    io_type: handle.ioType,
    display_name: handle.displayName,
    type: handle.valueType,
    required: handle.required,
    data_source: handle.dataSource,
    data_key: handle.dataKey,
    meta_data: {
      unilab: {
        value_schema: handle.valueSchema,
        editor_control: handle.editorControl,
        allowed_resource_template_uuids:
          handle.allowedResourceTemplateUuids,
        implicit_passthrough: handle.implicitPassthrough,
        structural_role: handle.structuralRole
      }
    }
  }
}

export function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return structuredClone(value)
}

export function clearTypedActionProvider(
  graph: WorkflowAuthoringGraph,
  nodeUuid: string,
  handleUuid: string,
  dataKey: string
): WorkflowAuthoringGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      if (node.uuid !== nodeUuid) return node
      const param = { ...recordValue(node.param) }
      delete param[dataKey]
      const metaData = recordOrNull(node.meta_data) ?? {}
      const unilab = recordOrNull(metaData.unilab) ?? {}
      const inputBindings = {
        ...(recordOrNull(unilab.input_bindings) ?? {})
      }
      delete inputBindings[handleUuid]
      return {
        ...node,
        param,
        meta_data: {
          ...metaData,
          unilab: {
            ...unilab,
            input_bindings: inputBindings
          }
        }
      }
    }),
    edges: graph.edges.filter((edge) => !(
      edge.target_node_uuid === nodeUuid &&
      edge.target_handle_uuid === handleUuid
    ))
  }
}

export function workflowInputNames(graph: WorkflowAuthoringGraph): string[] {
  const workflow = recordValue(graph.workflow)
  const metaData = recordOrNull(workflow.meta_data) ?? {}
  const unilab = recordOrNull(metaData.unilab) ?? {}
  const contract = recordOrNull(unilab.input_contract)
  if (!contract) return []
  if (contract.version !== 1 || !Array.isArray(contract.parameters)) {
    throw new Error('工作流入参定义与当前版本不一致')
  }
  const names = contract.parameters.map((value) =>
    requiredString(recordValue(value).name)
  )
  if (new Set(names).size !== names.length) {
    throw new Error('工作流入参存在重复参数')
  }
  return names
}

export type ExecutableNodeTemplate =
  | WorkflowActionNodeTemplate
  | WorkflowPublishedNodeTemplate

export function typedTemplate(
  catalog: WorkflowActionCatalogSnapshot,
  templateUuid: string
): ExecutableNodeTemplate {
  const action = catalog.actionTemplates.find((item) =>
    item.uuid === templateUuid
  )
  if (action) {
    const extension = recordOrNull(
      action.schema['x-unilabos-action-contract']
    )
    if (isSupportedTypedActionContract(extension)) return action
  }
  const workflow = catalog.workflowTemplates.find((item) =>
    item.uuid === templateUuid
  )
  if (workflow) {
    const extension = recordOrNull(
      workflow.schema['x-unilabos-workflow-contract']
    )
    if (extension?.version === 1) return workflow
  }
  throw new Error('类型化操作或工作流模板不存在')
}

/** 判断操作（Action）合同是否属于当前前端支持的持久版本。 */
function isSupportedTypedActionContract(
  extension: Record<string, unknown> | null
): boolean {
  return extension?.version === 1 || extension?.version === 2
}

export function publishedWorkflowTemplate(
  catalog: WorkflowActionCatalogSnapshot,
  templateUuid: string
): WorkflowPublishedNodeTemplate {
  const template = catalog.workflowTemplates.find((item) =>
    item.uuid === templateUuid
  )
  const extension = template && recordOrNull(
    template.schema['x-unilabos-workflow-contract']
  )
  if (!template || extension?.version !== 1) {
    throw new Error('已发布工作流模板不存在')
  }
  return template
}

export function typedActionTemplate(
  catalog: WorkflowActionCatalogSnapshot,
  templateUuid: string
): WorkflowActionNodeTemplate {
  const template = typedTemplate(catalog, templateUuid)
  if ('workflowUuid' in template) {
    throw new Error('类型化操作模板不存在')
  }
  return template
}

export function orderedTargetHandles(
  template: ExecutableNodeTemplate
): WorkflowActionHandleTemplate[] {
  const order = 'workflowUuid' in template
    ? template.inputOrder
    : stringArray(recordValue(
      template.schema['x-unilabos-action-contract']
    ).input_order)
  const handles = new Map(
    template.handles
      .filter((handle) =>
        handle.ioType === 'target' && handle.structuralRole === null
      )
      .map((handle) => [requiredString(handle.dataKey), handle])
  )
  if (handles.size !== order.length) {
    throw new Error('类型化操作的目标端口与参数规范不一致')
  }
  return order.map((dataKey) => {
    const handle = handles.get(dataKey)
    if (!handle) throw new Error('类型化操作的目标端口缺失')
    return handle
  })
}

export function assertParentBoundaryNode(
  graph: WorkflowAuthoringGraph,
  nodeUuid: string
): void {
  const node = graph.nodes.find((item) => item.uuid === nodeUuid)
  if (!node) throw new Error('工作流节点不存在')
  if (node.parent_uuid !== undefined && node.parent_uuid !== null) {
    throw new Error('Composite internal/private Node 只读；请编辑 invocation boundary')
  }
}

export function requireNodeHandle(
  catalog: WorkflowActionCatalogSnapshot,
  graph: WorkflowAuthoringGraph,
  nodeUuid: string,
  handleUuid: string,
  ioType: 'source' | 'target'
): WorkflowActionHandleTemplate {
  const node = graph.nodes.find((item) => item.uuid === nodeUuid)
  if (!node) throw new Error('工作流连线引用了未知节点')
  const template = typedTemplate(
    catalog,
    requiredString(node.workflow_node_template_uuid)
  )
  const handle = template.handles.find((item) => item.uuid === handleUuid)
  if (!handle || handle.ioType !== ioType) {
    throw new Error(`工作流连线引用了未知的 ${ioType} 端口`)
  }
  return handle
}

export function acceptsValue(schema: Record<string, unknown>, value: unknown): boolean {
  if (value === null) return isNullable(schema)
  const base = nonNullSchema(schema)
  const values = enumValues(base)
  if (values && !values.some((item) => Object.is(item, value))) return false
  if (base.$slot === 'ResourceSlot') {
    return recordOrNull(value) !== null
  }
  switch (base.type) {
    case 'string': return typeof value === 'string'
    case 'number': return typeof value === 'number' && Number.isFinite(value)
    case 'integer': return typeof value === 'number' && Number.isInteger(value)
    case 'boolean': return typeof value === 'boolean'
    case 'array': return Array.isArray(value)
    case 'object': return recordOrNull(value) !== null
    default: return false
  }
}

export function nonNullSchema(schema: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(schema.anyOf)) return schema
  return schema.anyOf.find((item) => {
    const member = recordOrNull(item)
    return member && member.type !== 'null'
  }) as Record<string, unknown> || {}
}

export function isNullable(schema: Record<string, unknown>): boolean {
  return Array.isArray(schema.anyOf) && schema.anyOf.some((item) =>
    recordOrNull(item)?.type === 'null'
  )
}

export function enumValues(schema: Record<string, unknown>): unknown[] | null {
  const base = nonNullSchema(schema)
  return Array.isArray(base.enum) ? [...base.enum] : null
}

export function recordValue(value: unknown): Record<string, unknown> {
  const record = recordOrNull(value)
  if (!record) throw new Error('类型化操作的值必须是对象')
  return record
}

export function recordOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

export function requiredString(value: unknown): string {
  if (typeof value !== 'string' || !value) {
    throw new Error('类型化操作标识缺失')
  }
  return value
}

export function stringArray(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error('类型化操作顺序无效')
  }
  return value as string[]
}

export function escapeJsonPointer(value: string): string {
  return value.replaceAll('~', '~0').replaceAll('/', '~1')
}
