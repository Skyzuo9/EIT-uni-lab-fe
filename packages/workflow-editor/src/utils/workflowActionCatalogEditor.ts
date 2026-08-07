import type {
  WorkflowActionCatalogSnapshot,
  WorkflowActionHandleTemplate,
  WorkflowAuthoringDiagnostic,
  WorkflowAuthoringGraph
} from '@unilab/services'
import { v5 as uuidV5 } from 'uuid'

import {
  acceptsValue,
  assertParentBoundaryNode,
  clearTypedActionProvider,
  enumValues,
  escapeJsonPointer,
  isNullable,
  orderedTargetHandles,
  recordOrNull,
  recordValue,
  requireNodeHandle,
  requiredString,
  typedTemplate,
  workflowInputNames
} from './workflowActionCatalogModel'

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

export function projectTypedActionEditor(
  catalog: WorkflowActionCatalogSnapshot,
  graph: WorkflowAuthoringGraph,
  nodeUuid: string,
  osDiagnostics: ReadonlyArray<WorkflowAuthoringDiagnostic>
): TypedActionEditorProjection {
  const node = graph.nodes.find((item) => item.uuid === nodeUuid)
  if (!node) throw new Error('工作流节点不存在')
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
      throw new Error('工作流入参绑定与当前参数配置不一致')
    }
    const providerCount = Number(hasValue) + Number(edgeProvided) +
      Number(workflowInput !== null)
    if (providerCount > 1) throw new Error('操作目标端口存在多个数据来源')
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
  assertParentBoundaryNode(graph, nodeUuid)
  const node = graph.nodes.find((item) => item.uuid === nodeUuid)
  if (!node) throw new Error('工作流节点不存在')
  const template = typedTemplate(
    catalog,
    requiredString(node.workflow_node_template_uuid)
  )
  const handle = template.handles.find((item) => item.uuid === handleUuid)
  if (!handle || handle.ioType !== 'target') {
    throw new Error('操作目标端口不存在')
  }
  const dataKey = requiredString(handle.dataKey)
  if (value === undefined) {
    return clearTypedActionProvider(graph, nodeUuid, handleUuid, dataKey)
  }
  if (!acceptsValue(handle.valueSchema, value)) {
    throw new Error(`${handle.displayName} 的值不符合操作参数规范`)
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
  assertParentBoundaryNode(graph, nodeUuid)
  const handle = requireNodeHandle(
    catalog,
    graph,
    nodeUuid,
    handleUuid,
    'target'
  )
  if (!workflowInputNames(graph).includes(parameter)) {
    throw new Error('工作流入参不存在')
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
  assertParentBoundaryNode(graph, input.sourceNodeUuid)
  assertParentBoundaryNode(graph, input.targetNodeUuid)
  const sourceHandle = requireNodeHandle(
    catalog,
    graph,
    input.sourceNodeUuid,
    input.sourceHandleUuid,
    'source'
  )
  return connectTypedActionTarget(
    catalog,
    graph,
    input,
    sourceHandle.valueType,
    null
  )
}

export function connectFrameworkSourceToTypedActionEdge(
  catalog: WorkflowActionCatalogSnapshot,
  graph: WorkflowAuthoringGraph,
  input: {
    sourceNodeUuid: string
    sourceHandleUuid: string
    targetNodeUuid: string
    targetHandleUuid: string
  },
  source: {
    nodeType: string
    nodeTemplateUuid: string
    handleUuid: string
    valueType: string
    resourceTemplateUuid: string | null
  }
): WorkflowAuthoringGraph {
  assertParentBoundaryNode(graph, input.sourceNodeUuid)
  assertParentBoundaryNode(graph, input.targetNodeUuid)
  const sourceNode = graph.nodes.find(
    (node) => node.uuid === input.sourceNodeUuid
  )
  if (
    !sourceNode ||
    sourceNode.type !== source.nodeType ||
    sourceNode.workflow_node_template_uuid !== source.nodeTemplateUuid ||
    input.sourceHandleUuid !== source.handleUuid
  ) throw new Error('框架来源节点与端口标识不匹配')
  const graphHandle = graph.handle_templates.find(
    (handle) => handle.uuid === input.sourceHandleUuid
  )
  if (
    !graphHandle ||
    graphHandle.workflow_node_template_uuid !== source.nodeTemplateUuid ||
    graphHandle.io_type !== 'source' ||
    graphHandle.type !== source.valueType
  ) throw new Error('框架来源端口不在候选工作流中')
  return connectTypedActionTarget(
    catalog,
    graph,
    input,
    source.valueType,
    source.resourceTemplateUuid
  )
}

function connectTypedActionTarget(
  catalog: WorkflowActionCatalogSnapshot,
  graph: WorkflowAuthoringGraph,
  input: {
    sourceNodeUuid: string
    sourceHandleUuid: string
    targetNodeUuid: string
    targetHandleUuid: string
  },
  sourceValueType: string,
  sourceResourceTemplateUuid: string | null
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
    throw new Error('操作目标端口已有数据来源')
  }
  if (graph.edges.some((edge) => edge.uuid === edgeUuid)) {
    throw new Error('工作流连线 UUID 已存在')
  }
  const targetHandle = requireNodeHandle(
    catalog,
    graph,
    input.targetNodeUuid,
    input.targetHandleUuid,
    'target'
  )
  if (sourceValueType !== targetHandle.valueType) {
    throw new Error('工作流连线两端的端口类型不兼容')
  }
  if (
    sourceResourceTemplateUuid &&
    targetHandle.allowedResourceTemplateUuids?.length &&
    !targetHandle.allowedResourceTemplateUuids.includes(
      sourceResourceTemplateUuid
    )
  ) throw new Error('物料来源的资源模板不被操作目标接受')
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

