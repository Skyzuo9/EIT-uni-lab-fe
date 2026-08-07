import type {
  WorkflowAuthoringGraph,
  WorkflowInputDescriptor,
  WorkflowJsonValue,
  WorkflowOutputBinding,
  WorkflowOutputDescriptor,
  WorkflowValueSchema
} from '@unilab/services'

export type WorkflowIoSchemaMode =
  | 'string'
  | 'integer'
  | 'number'
  | 'boolean'
  | 'object'
  | 'array'
  | 'resource_slot'

export type NonNullableWorkflowIoSchema = Exclude<
  WorkflowValueSchema,
  { anyOf: unknown }
>
export type WorkflowIoArrayItemSchema = Exclude<
  NonNullableWorkflowIoSchema,
  { type: 'array' }
>

/** 读取工作流（Workflow）输入、输出与输出绑定契约。 */
export function readWorkflowIo(graph: WorkflowAuthoringGraph): {
  inputs: WorkflowInputDescriptor[]
  outputs: WorkflowOutputDescriptor[]
  outputBindings: Record<string, WorkflowOutputBinding>
} {
  const unilab = recordOrEmpty(graph.workflow.meta_data?.unilab)
  const inputContract = recordOrEmpty(unilab.input_contract)
  const outputContract = recordOrEmpty(unilab.output_contract)
  return {
    inputs: Array.isArray(inputContract.parameters)
      ? inputContract.parameters as WorkflowInputDescriptor[]
      : [],
    outputs: Array.isArray(outputContract.outputs)
      ? outputContract.outputs as WorkflowOutputDescriptor[]
      : [],
    outputBindings: recordOrEmpty(unilab.output_bindings) as Record<
      string,
      WorkflowOutputBinding
    >
  }
}

/** 归一化输入必填、可空与默认值不变量。 */
export function normalizeInputDescriptor(
  descriptor: WorkflowInputDescriptor
): WorkflowInputDescriptor {
  if (descriptor.required) {
    const next = { ...descriptor, schema: nonNullSchema(descriptor.schema) }
    delete next.default
    return next
  }
  if (isNullable(descriptor.schema)) return { ...descriptor, default: null }
  if (containsResourceSlot(descriptor.schema)) {
    throw new Error('资源位入参设为选填前，需要先开启“允许为空”')
  }
  if ('default' in descriptor && descriptor.default !== null) return descriptor
  return { ...descriptor, default: defaultValue(descriptor.schema) }
}

/** 从输入描述符移除默认值字段。 */
export function withoutDefault(
  descriptor: WorkflowInputDescriptor
): WorkflowInputDescriptor {
  const next = { ...descriptor }
  delete next.default
  return next
}

/** 为普通工作流输入模式生成安全默认值。 */
export function defaultValue(schema: WorkflowValueSchema): WorkflowJsonValue {
  const base = nonNullSchema(schema)
  if (
    '$slot' in base ||
    (base.type === 'array' && containsResourceSlot(base.items))
  ) {
    throw new Error('资源位入参不能由前端生成默认值')
  }
  switch (base.type) {
    case 'string': return ''
    case 'integer':
    case 'number': return 0
    case 'boolean': return false
    case 'object': return {}
    case 'array': return []
  }
  throw new Error('当前工作流入参类型不支持由前端生成默认值')
}

/** 把值模式映射为编辑器选择值。 */
export function schemaMode(
  schema: WorkflowValueSchema
): WorkflowIoSchemaMode {
  const base = nonNullSchema(schema)
  if ('$slot' in base) return 'resource_slot'
  return base.type
}

/** 生成人类可读的值模式摘要。 */
export function schemaSummary(schema: WorkflowValueSchema): string {
  const base = nonNullSchema(schema)
  const type = '$slot' in base
    ? '资源位'
    : base.type === 'array'
      ? `列表<${schemaSummary(base.items)}>`
      : schemaTypeLabel(base.type)
  return isNullable(schema) ? `${type} · 允许为空` : type
}

/** 根据编辑器选择创建非空工作流值模式。 */
export function schemaForMode(
  mode: WorkflowIoSchemaMode
): NonNullableWorkflowIoSchema {
  if (mode === 'resource_slot') return { $slot: 'ResourceSlot' }
  if (mode === 'array') return { type: 'array', items: { type: 'string' } }
  return { type: mode }
}

/** 根据编辑器选择创建列表项目模式。 */
export function schemaForItemMode(
  mode: WorkflowIoSchemaMode
): WorkflowIoArrayItemSchema {
  if (mode === 'array') throw new Error('当前版本不支持嵌套列表类型')
  return schemaForMode(mode) as WorkflowIoArrayItemSchema
}

/** 为值模式类型生成中文标签。 */
export function schemaTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    string: '文本', integer: '整数', number: '数值', boolean: '布尔值',
    object: '对象', array: '列表', null: '空值'
  }
  return labels[type] ?? type
}

/** 为工作流值模式增加 null 联合分支。 */
export function nullableSchema(
  schema: WorkflowValueSchema
): WorkflowValueSchema {
  if (isNullable(schema)) return schema
  return { anyOf: [nonNullSchema(schema), { type: 'null' }] }
}

/** 读取可空工作流值模式的非空分支。 */
export function nonNullSchema(
  schema: WorkflowValueSchema
): NonNullableWorkflowIoSchema {
  return 'anyOf' in schema ? schema.anyOf[0] : schema
}

/** 判断工作流值模式是否允许 null。 */
export function isNullable(schema: WorkflowValueSchema): boolean {
  return 'anyOf' in schema
}

/** 收窄列表工作流值模式。 */
export function isArraySchema(
  schema: NonNullableWorkflowIoSchema
): schema is Extract<NonNullableWorkflowIoSchema, { type: 'array' }> {
  return 'type' in schema && schema.type === 'array'
}

/** 判断值模式是否直接或在列表中引用物料占位符（ResourceSlot）。 */
export function containsResourceSlot(schema: WorkflowValueSchema): boolean {
  if ('anyOf' in schema) return containsResourceSlot(schema.anyOf[0])
  if ('$slot' in schema) return true
  return schema.type === 'array' && containsResourceSlot(schema.items)
}

/** 不可变地写入或删除值模式字段。 */
export function withSchemaField<T extends NonNullableWorkflowIoSchema>(
  schema: T,
  field: string,
  value: unknown
): T {
  const next = { ...schema } as Record<string, unknown>
  if (value === undefined) delete next[field]
  else next[field] = value
  return next as T
}

/** 把输出绑定编码为选择器稳定值。 */
export function bindingValue(
  binding: WorkflowOutputBinding | undefined
): string {
  if (!binding) return ''
  return binding.kind === 'workflow_input'
    ? `input:${binding.parameter}`
    : `node:${binding.workflow_node_uuid}:${binding.source_handle_uuid}`
}

/** 把输出来源编码为选择器稳定值。 */
export function sourceValue(source:
  | { kind: 'workflow_input'; parameter: string }
  | {
      kind: 'node_output'
      workflowNodeUuid: string
      sourceHandleUuid: string
    }
): string {
  return source.kind === 'workflow_input'
    ? `input:${source.parameter}`
    : `node:${source.workflowNodeUuid}:${source.sourceHandleUuid}`
}

/** 把节点输入目标编码为选择器稳定值。 */
export function inputTargetValue(target: {
  workflowNodeUuid: string
  targetHandleUuid: string
}): string {
  return `node:${target.workflowNodeUuid}:${target.targetHandleUuid}`
}

/** 生成人类可读的节点与句柄组合标签。 */
export function handleLabel(
  graph: WorkflowAuthoringGraph,
  nodeUuid: string,
  handleUuid: string
): string {
  const node = graph.nodes.find(({ uuid }) => uuid === nodeUuid)
  const handle = graph.handle_templates.find(({ uuid }) => uuid === handleUuid)
  const nodeLabel = String(node?.name || nodeUuid)
  const templateLabel = String(
    handle?.display_name || handle?.handle_key || handleUuid
  )
  return `${nodeLabel} · ${templateLabel}`
}

/** 在既有变量名中生成不重复的顺序名称。 */
export function uniqueName(names: string[], prefix: string): string {
  let suffix = 1
  while (names.includes(`${prefix}_${suffix}`)) suffix += 1
  return `${prefix}_${suffix}`
}

/** 不可变地写入或删除描述文本字段。 */
export function withOptionalText<T extends object>(
  value: T,
  key: 'title' | 'description',
  text: string
): T {
  const next = { ...value } as Record<string, unknown>
  if (text) next[key] = text
  else delete next[key]
  return next as T
}

/** 把任意 JSON 值编码为表单文本。 */
export function jsonValue(value: unknown): string {
  const encoded = JSON.stringify(value)
  return encoded === undefined ? '' : encoded
}

/** 把未知值安全收窄为普通记录。 */
export function recordOrEmpty(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}
