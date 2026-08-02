import type {
  WorkflowActionCatalogSnapshot,
  WorkflowActionHandleTemplate,
  WorkflowActionNodeTemplate,
  WorkflowAuthoringDiagnostic,
  WorkflowAuthoringGraph
} from '@unilab/services'
import { v5 as uuidV5 } from 'uuid'

export interface TypedActionFieldProjection {
  handleUuid: string
  dataKey: string
  displayName: string
  required: boolean
  hasDefault: boolean
  defaultValue: unknown
  nullable: boolean
  editorControl: WorkflowActionHandleTemplate['editorControl']
  valueSchema: Record<string, unknown>
  valueState: 'missing' | 'null' | 'value'
  value: unknown
  enumValues: unknown[] | null
  providerKind: 'missing' | 'literal' | 'workflow_input' | 'upstream_output'
  workflowInput: string | null
  workflowInputOptions: string[]
}

export interface TypedActionFieldDiagnostic {
  handleUuid: string
  fieldPath: string
  severity: 'error' | 'warning'
  code: string
  message: string
}

export interface TypedActionEditorProjection {
  nodeUuid: string
  templateUuid: string
  fields: TypedActionFieldProjection[]
  diagnostics: TypedActionFieldDiagnostic[]
}

export function createTypedActionNode(
  catalog: WorkflowActionCatalogSnapshot,
  graph: WorkflowAuthoringGraph,
  input: { nodeUuid: string; templateUuid: string; name: string }
): WorkflowAuthoringGraph {
  const template = typedTemplate(catalog, input.templateUuid)
  if (graph.nodes.some((node) => node.uuid === input.nodeUuid)) {
    throw new Error('Workflow Node UUID 已存在')
  }
  if (!input.name || graph.nodes.some((node) => node.name === input.name)) {
    throw new Error('Workflow Node 名称无效或重复')
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

function appendCatalogRecords(
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

export function projectTypedActionEditor(
  catalog: WorkflowActionCatalogSnapshot,
  graph: WorkflowAuthoringGraph,
  nodeUuid: string,
  osDiagnostics: ReadonlyArray<WorkflowAuthoringDiagnostic>
): TypedActionEditorProjection {
  const node = graph.nodes.find((item) => item.uuid === nodeUuid)
  if (!node) throw new Error('Workflow Node 不存在')
  const templateUuid = requiredString(node.workflow_node_template_uuid)
  const template = typedTemplate(catalog, templateUuid)
  const param = recordValue(node.param)
  const targetHandles = orderedTargetHandles(template)
  const providedHandleUuids = new Set(
    graph.edges
      .filter((edge) => edge.target_node_uuid === nodeUuid)
      .map((edge) => requiredString(edge.target_handle_uuid))
  )
  const metaData = recordOrNull(node.meta_data) ?? {}
  const unilab = recordOrNull(metaData.unilab) ?? {}
  const inputBindings = recordOrNull(unilab.input_bindings) ?? {}
  const workflowInputOptions = workflowInputNames(graph)
  const fields = targetHandles.map((handle) => {
    const dataKey = requiredString(handle.dataKey)
    const hasValue = Object.prototype.hasOwnProperty.call(param, dataKey)
    const value = hasValue ? param[dataKey] : undefined
    const hasDefault = Object.prototype.hasOwnProperty.call(
      handle.valueSchema,
      'default'
    )
    const edgeProvided = graph.edges.some((edge) =>
      edge.target_node_uuid === nodeUuid &&
      edge.target_handle_uuid === handle.uuid
    )
    const rawBinding = inputBindings[handle.uuid]
    const binding = rawBinding === undefined ? null : recordValue(rawBinding)
    const workflowInput = binding === null
      ? null
      : requiredString(binding.parameter)
    if (binding && (
      Object.keys(binding).some((key) => key !== 'parameter') ||
      !workflowInputOptions.includes(workflowInput as string)
    )) {
      throw new Error('Workflow input binding 不符合当前合同')
    }
    const providerCount = Number(hasValue) + Number(edgeProvided) +
      Number(workflowInput !== null)
    if (providerCount > 1) throw new Error('Action target Handle 有多个 provider')
    const providerKind = hasValue
      ? 'literal'
      : workflowInput !== null
        ? 'workflow_input'
        : edgeProvided
          ? 'upstream_output'
          : 'missing'
    if (providerKind !== 'missing') providedHandleUuids.add(handle.uuid)
    return {
      handleUuid: handle.uuid,
      dataKey,
      displayName: handle.displayName,
      required: handle.required,
      hasDefault,
      defaultValue: hasDefault ? handle.valueSchema.default : undefined,
      nullable: isNullable(handle.valueSchema),
      editorControl: handle.editorControl,
      valueSchema: handle.valueSchema,
      valueState: !hasValue ? 'missing' : value === null ? 'null' : 'value',
      value,
      enumValues: enumValues(handle.valueSchema),
      providerKind,
      workflowInput,
      workflowInputOptions
    } satisfies TypedActionFieldProjection
  })
  const diagnostics: TypedActionFieldDiagnostic[] = fields
    .filter((field) =>
      field.required &&
      field.valueState === 'missing' &&
      !providedHandleUuids.has(field.handleUuid)
    )
    .map((field) => ({
      handleUuid: field.handleUuid,
      fieldPath: `/param/${escapeJsonPointer(field.dataKey)}`,
      severity: 'error',
      code: 'required_action_parameter_missing',
      message: `${field.displayName}为必填参数`
    }))
  for (const diagnostic of osDiagnostics) {
    if (diagnostic.node_id !== nodeUuid) continue
    const handleUuid = diagnostic.workflow_handle_template_uuid || ''
    if (
      handleUuid &&
      !targetHandles.some((handle) => handle.uuid === handleUuid)
    ) continue
    diagnostics.push({
      handleUuid,
      fieldPath: diagnostic.path || '/param',
      severity: diagnostic.severity,
      code: diagnostic.code,
      message: diagnostic.message
    })
  }
  return { nodeUuid, templateUuid, fields, diagnostics }
}

export function updateTypedActionLiteral(
  catalog: WorkflowActionCatalogSnapshot,
  graph: WorkflowAuthoringGraph,
  nodeUuid: string,
  handleUuid: string,
  value: unknown
): WorkflowAuthoringGraph {
  const node = graph.nodes.find((item) => item.uuid === nodeUuid)
  if (!node) throw new Error('Workflow Node 不存在')
  const template = typedTemplate(
    catalog,
    requiredString(node.workflow_node_template_uuid)
  )
  const handle = template.handles.find((item) => item.uuid === handleUuid)
  if (!handle || handle.ioType !== 'target') {
    throw new Error('Action target Handle 不存在')
  }
  const dataKey = requiredString(handle.dataKey)
  if (value === undefined) {
    return clearTypedActionProvider(graph, nodeUuid, handleUuid, dataKey)
  }
  if (!acceptsValue(handle.valueSchema, value)) {
    throw new Error(`${handle.displayName}的值不符合 typed Action schema`)
  }
  return {
    ...graph,
    nodes: graph.nodes.map((item) => {
      if (item.uuid !== nodeUuid) return item
      const metaData = recordOrNull(item.meta_data) ?? {}
      const unilab = recordOrNull(metaData.unilab) ?? {}
      const inputBindings = {
        ...(recordOrNull(unilab.input_bindings) ?? {})
      }
      delete inputBindings[handleUuid]
      return {
        ...item,
        param: { ...recordValue(item.param), [dataKey]: value },
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

export function bindTypedActionWorkflowInput(
  catalog: WorkflowActionCatalogSnapshot,
  graph: WorkflowAuthoringGraph,
  nodeUuid: string,
  handleUuid: string,
  parameter: string
): WorkflowAuthoringGraph {
  const handle = requireNodeHandle(
    catalog,
    graph,
    nodeUuid,
    handleUuid,
    'target'
  )
  if (!workflowInputNames(graph).includes(parameter)) {
    throw new Error('Workflow input 不存在')
  }
  const dataKey = requiredString(handle.dataKey)
  const cleared = clearTypedActionProvider(
    graph,
    nodeUuid,
    handleUuid,
    dataKey
  )
  return {
    ...cleared,
    nodes: cleared.nodes.map((node) => {
      if (node.uuid !== nodeUuid) return node
      const metaData = recordOrNull(node.meta_data) ?? {}
      const unilab = recordOrNull(metaData.unilab) ?? {}
      return {
        ...node,
        meta_data: {
          ...metaData,
          unilab: {
            ...unilab,
            input_bindings: {
              ...(recordOrNull(unilab.input_bindings) ?? {}),
              [handleUuid]: { parameter }
            }
          }
        }
      }
    })
  }
}

export function connectTypedActionEdge(
  catalog: WorkflowActionCatalogSnapshot,
  graph: WorkflowAuthoringGraph,
  input: {
    sourceNodeUuid: string
    sourceHandleUuid: string
    targetNodeUuid: string
    targetHandleUuid: string
  }
): WorkflowAuthoringGraph {
  const edgeUuid = uuidV5(
    `authoring-edge:${input.sourceNodeUuid}:${input.sourceHandleUuid}:` +
      `${input.targetNodeUuid}:${input.targetHandleUuid}`,
    requiredString(graph.workflow.uuid)
  )
  if (graph.edges.some(
    (edge) =>
      edge.target_node_uuid === input.targetNodeUuid &&
      edge.target_handle_uuid === input.targetHandleUuid
  )) {
    throw new Error('Action target Handle 已有 provider')
  }
  if (graph.edges.some((edge) => edge.uuid === edgeUuid)) {
    throw new Error('Workflow Edge UUID 已存在')
  }
  requireNodeHandle(
    catalog,
    graph,
    input.sourceNodeUuid,
    input.sourceHandleUuid,
    'source'
  )
  requireNodeHandle(
    catalog,
    graph,
    input.targetNodeUuid,
    input.targetHandleUuid,
    'target'
  )
  const targetNode = graph.nodes.find(
    (node) => node.uuid === input.targetNodeUuid
  )
  if (!targetNode) throw new Error('Workflow target Node 不存在')
  const targetTemplate = typedTemplate(
    catalog,
    requiredString(targetNode.workflow_node_template_uuid)
  )
  const targetHandle = targetTemplate.handles.find(
    (handle) => handle.uuid === input.targetHandleUuid
  )
  if (!targetHandle) throw new Error('Action target Handle 不存在')
  const dataKey = requiredString(targetHandle.dataKey)
  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      if (node.uuid !== input.targetNodeUuid) return node
      const param = { ...recordValue(node.param) }
      delete param[dataKey]
      const metaData = recordOrNull(node.meta_data) ?? {}
      const unilab = recordOrNull(metaData.unilab) ?? {}
      const inputBindings = {
        ...(recordOrNull(unilab.input_bindings) ?? {})
      }
      delete inputBindings[input.targetHandleUuid]
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
    edges: [
      ...graph.edges,
      {
        uuid: edgeUuid,
        source_node_uuid: input.sourceNodeUuid,
        source_handle_uuid: input.sourceHandleUuid,
        target_node_uuid: input.targetNodeUuid,
        target_handle_uuid: input.targetHandleUuid,
        meta_data: {}
      }
    ]
  }
}

export function rehydrateTypedActionGraph(
  catalog: WorkflowActionCatalogSnapshot,
  graph: WorkflowAuthoringGraph
): WorkflowAuthoringGraph {
  const nodeUuids = new Set<string>()
  const referencedTemplateUuids = new Set<string>()
  for (const node of graph.nodes) {
    const nodeUuid = requiredString(node.uuid)
    if (nodeUuids.has(nodeUuid)) throw new Error('Workflow Node UUID 重复')
    nodeUuids.add(nodeUuid)
    const templateUuid = requiredString(node.workflow_node_template_uuid)
    typedTemplate(catalog, templateUuid)
    referencedTemplateUuids.add(templateUuid)
    recordValue(node.param)
  }
  const edgeUuids = new Set<string>()
  for (const edge of graph.edges) {
    const edgeUuid = requiredString(edge.uuid)
    if (edgeUuids.has(edgeUuid)) throw new Error('Workflow Edge UUID 重复')
    edgeUuids.add(edgeUuid)
    requireNodeHandle(
      catalog,
      graph,
      requiredString(edge.source_node_uuid),
      requiredString(edge.source_handle_uuid),
      'source'
    )
    requireNodeHandle(
      catalog,
      graph,
      requiredString(edge.target_node_uuid),
      requiredString(edge.target_handle_uuid),
      'target'
    )
  }
  const referencedTemplates = catalog.actionTemplates.filter((template) =>
    referencedTemplateUuids.has(template.uuid)
  )
  return {
    ...graph,
    node_templates: referencedTemplates.map((template) =>
      cloneRecord(template.wireValue ?? nodeTemplateWireValue(template))
    ),
    handle_templates: referencedTemplates.flatMap((template) =>
      template.handles.map((handle) =>
        cloneRecord(handle.wireValue ?? handleTemplateWireValue(handle))
      )
    )
  }
}

function nodeTemplateWireValue(
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

function handleTemplateWireValue(
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

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return structuredClone(value)
}

function clearTypedActionProvider(
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

function workflowInputNames(graph: WorkflowAuthoringGraph): string[] {
  const workflow = recordValue(graph.workflow)
  const metaData = recordOrNull(workflow.meta_data) ?? {}
  const unilab = recordOrNull(metaData.unilab) ?? {}
  const contract = recordOrNull(unilab.input_contract)
  if (!contract) return []
  if (contract.version !== 1 || !Array.isArray(contract.parameters)) {
    throw new Error('Workflow input contract 不符合当前合同')
  }
  const names = contract.parameters.map((value) =>
    requiredString(recordValue(value).name)
  )
  if (new Set(names).size !== names.length) {
    throw new Error('Workflow input contract 存在重复参数')
  }
  return names
}

function typedTemplate(
  catalog: WorkflowActionCatalogSnapshot,
  templateUuid: string
): WorkflowActionNodeTemplate {
  const template = catalog.actionTemplates.find((item) => item.uuid === templateUuid)
  const extension = template && recordOrNull(
    template.schema['x-unilabos-action-contract']
  )
  if (!template || extension?.version !== 1) {
    throw new Error('Typed Action template 不存在')
  }
  return template
}

function orderedTargetHandles(
  template: WorkflowActionNodeTemplate
): WorkflowActionHandleTemplate[] {
  const extension = recordValue(
    template.schema['x-unilabos-action-contract']
  )
  const order = stringArray(extension.input_order)
  const handles = new Map(
    template.handles
      .filter((handle) =>
        handle.ioType === 'target' && handle.structuralRole === null
      )
      .map((handle) => [requiredString(handle.dataKey), handle])
  )
  if (handles.size !== order.length) {
    throw new Error('Typed Action target Handles 与 schema 不一致')
  }
  return order.map((dataKey) => {
    const handle = handles.get(dataKey)
    if (!handle) throw new Error('Typed Action target Handle 缺失')
    return handle
  })
}

function requireNodeHandle(
  catalog: WorkflowActionCatalogSnapshot,
  graph: WorkflowAuthoringGraph,
  nodeUuid: string,
  handleUuid: string,
  ioType: 'source' | 'target'
): WorkflowActionHandleTemplate {
  const node = graph.nodes.find((item) => item.uuid === nodeUuid)
  if (!node) throw new Error('Workflow Edge 引用了未知 Node')
  const template = typedTemplate(
    catalog,
    requiredString(node.workflow_node_template_uuid)
  )
  const handle = template.handles.find((item) => item.uuid === handleUuid)
  if (!handle || handle.ioType !== ioType) {
    throw new Error(`Workflow Edge 引用了未知 ${ioType} Handle`)
  }
  return handle
}

function acceptsValue(schema: Record<string, unknown>, value: unknown): boolean {
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

function nonNullSchema(schema: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(schema.anyOf)) return schema
  return schema.anyOf.find((item) => {
    const member = recordOrNull(item)
    return member && member.type !== 'null'
  }) as Record<string, unknown> || {}
}

function isNullable(schema: Record<string, unknown>): boolean {
  return Array.isArray(schema.anyOf) && schema.anyOf.some((item) =>
    recordOrNull(item)?.type === 'null'
  )
}

function enumValues(schema: Record<string, unknown>): unknown[] | null {
  const base = nonNullSchema(schema)
  return Array.isArray(base.enum) ? [...base.enum] : null
}

function recordValue(value: unknown): Record<string, unknown> {
  const record = recordOrNull(value)
  if (!record) throw new Error('Typed Action value 必须是 object')
  return record
}

function recordOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function requiredString(value: unknown): string {
  if (typeof value !== 'string' || !value) {
    throw new Error('Typed Action identity 缺失')
  }
  return value
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error('Typed Action order 无效')
  }
  return value as string[]
}

function escapeJsonPointer(value: string): string {
  return value.replaceAll('~', '~0').replaceAll('/', '~1')
}
