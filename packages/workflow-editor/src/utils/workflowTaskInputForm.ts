import type {
  WorkflowAuthoringAggregate,
  WorkflowInputDescriptor,
  WorkflowJsonValue,
  WorkflowValueSchema
} from '@unilab/services'

export type WorkflowTaskInputFieldState =
  | { kind: 'untouched' }
  | { kind: 'explicit_null' }
  | { kind: 'value'; value: WorkflowJsonValue }

export interface WorkflowTaskInputField {
  descriptor: WorkflowInputDescriptor
  state: WorkflowTaskInputFieldState
}

export interface WorkflowTaskInputFormState {
  workflowUuid: string
  appliedRevision: number
  fields: WorkflowTaskInputField[]
}

export function createWorkflowTaskInputForm(
  aggregate: WorkflowAuthoringAggregate
): WorkflowTaskInputFormState {
  const parameters = aggregate.applied_graph.workflow.meta_data?.unilab
    ?.input_contract?.parameters ?? []
  return {
    workflowUuid: aggregate.workflow_uuid,
    appliedRevision: aggregate.workflow_revision,
    fields: parameters.map((descriptor) => ({
      descriptor: structuredClone(descriptor),
      state: { kind: 'untouched' }
    }))
  }
}

export function setWorkflowTaskInputField(
  form: WorkflowTaskInputFormState,
  name: string,
  state: WorkflowTaskInputFieldState
): WorkflowTaskInputFormState {
  const index = form.fields.findIndex(({ descriptor }) =>
    descriptor.name === name
  )
  if (index < 0) throw new Error(`Workflow input 不存在：${name}`)
  const field = form.fields[index]
  if (!field) throw new Error(`Workflow input 不存在：${name}`)
  validateFieldState(field.descriptor, state)
  return {
    ...form,
    fields: form.fields.map((current, currentIndex) =>
      currentIndex === index
        ? { ...current, state: cloneFieldState(state) }
        : current
    )
  }
}

export function buildWorkflowTaskInput(
  form: WorkflowTaskInputFormState
): Record<string, unknown> {
  const input: Record<string, unknown> = {}
  for (const { descriptor, state } of form.fields) {
    validateFieldState(descriptor, state)
    if (state.kind === 'untouched') {
      if (descriptor.required) {
        throw new Error(`必填 Workflow input 尚未填写：${descriptor.name}`)
      }
      continue
    }
    input[descriptor.name] = state.kind === 'explicit_null'
      ? null
      : structuredClone(state.value)
  }
  return input
}

export function isNullableWorkflowInputSchema(
  schema: WorkflowValueSchema
): boolean {
  return 'anyOf' in schema
}

export function containsResourceSlotInput(
  schema: WorkflowValueSchema
): boolean {
  if ('anyOf' in schema) return containsResourceSlotInput(schema.anyOf[0])
  if ('$slot' in schema) return true
  return schema.type === 'array' && containsResourceSlotInput(schema.items)
}

function validateFieldState(
  descriptor: WorkflowInputDescriptor,
  state: WorkflowTaskInputFieldState
): void {
  if (state.kind === 'untouched') return
  if (state.kind === 'explicit_null') {
    if (!isNullableWorkflowInputSchema(descriptor.schema)) {
      throw new Error(`${descriptor.name} 不是 nullable Workflow input`)
    }
    return
  }
  if (containsResourceSlotInput(descriptor.schema)) {
    throw new Error(
      `${descriptor.name} ResourceSlot selector 本轮尚不可用`
    )
  }
  requireSchemaValue(descriptor.schema, state.value, descriptor.name)
}

function requireSchemaValue(
  schema: WorkflowValueSchema,
  value: WorkflowJsonValue,
  path: string
): void {
  if ('anyOf' in schema) {
    if (value === null) {
      throw new Error(`${path} 的 null 必须使用 explicit_null 状态`)
    }
    requireSchemaValue(schema.anyOf[0], value, path)
    return
  }
  if ('$slot' in schema) {
    throw new Error(`${path} ResourceSlot selector 本轮尚不可用`)
  }
  switch (schema.type) {
    case 'string':
      if (typeof value !== 'string') typeError(path, 'string')
      if (schema.enum && !schema.enum.includes(value as string)) {
        throw new Error(`${path} 不在 string enum 中`)
      }
      if (
        schema.minLength !== undefined &&
        (value as string).length < schema.minLength
      ) throw new Error(`${path} 小于 minLength`)
      if (
        schema.maxLength !== undefined &&
        (value as string).length > schema.maxLength
      ) throw new Error(`${path} 大于 maxLength`)
      return
    case 'integer':
    case 'number': {
      if (
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        (schema.type === 'integer' && !Number.isInteger(value))
      ) typeError(path, schema.type)
      const numberValue = value as number
      if (schema.enum && !schema.enum.includes(numberValue)) {
        throw new Error(`${path} 不在 ${schema.type} enum 中`)
      }
      if (schema.minimum !== undefined && numberValue < schema.minimum) {
        throw new Error(`${path} 小于 minimum`)
      }
      if (schema.maximum !== undefined && numberValue > schema.maximum) {
        throw new Error(`${path} 大于 maximum`)
      }
      return
    }
    case 'boolean':
      if (typeof value !== 'boolean') typeError(path, 'boolean')
      if (schema.enum && !schema.enum.includes(value as boolean)) {
        throw new Error(`${path} 不在 boolean enum 中`)
      }
      return
    case 'object':
      if (!isJsonObject(value)) typeError(path, 'object')
      requireJsonValue(value, path)
      return
    case 'array':
      if (!Array.isArray(value)) typeError(path, 'array')
      if (schema.minItems !== undefined && value.length < schema.minItems) {
        throw new Error(`${path} 小于 minItems`)
      }
      if (schema.maxItems !== undefined && value.length > schema.maxItems) {
        throw new Error(`${path} 大于 maxItems`)
      }
      value.forEach((item, index) =>
        requireSchemaValue(schema.items, item, `${path}/${index}`)
      )
  }
}

function requireJsonValue(value: unknown, path: string): void {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) return
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${path} 不是 JSON number`)
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => requireJsonValue(item, `${path}/${index}`))
    return
  }
  if (isJsonObject(value)) {
    for (const [key, item] of Object.entries(value)) {
      requireJsonValue(item, `${path}/${key}`)
    }
    return
  }
  throw new Error(`${path} 不是 JSON value`)
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function typeError(path: string, expected: string): never {
  throw new Error(`${path} 类型错误：必须是 ${expected}`)
}

function cloneFieldState(
  state: WorkflowTaskInputFieldState
): WorkflowTaskInputFieldState {
  return state.kind === 'value'
    ? { kind: 'value', value: structuredClone(state.value) }
    : { ...state }
}
