export type WorkflowJsonValue =
  | null
  | boolean
  | number
  | string
  | WorkflowJsonValue[]
  | { [key: string]: WorkflowJsonValue }

export type WorkflowValueSchema =
  | {
      type: 'string'
      enum?: string[]
      minLength?: number
      maxLength?: number
      'x-unilabos-editor-control'?: 'site_selector'
    }
  | {
      type: 'integer' | 'number'
      enum?: number[]
      minimum?: number
      maximum?: number
    }
  | { type: 'boolean'; enum?: boolean[] }
  | { type: 'object' }
  | {
      type: 'array'
      items: Exclude<WorkflowValueSchema, { type: 'array' }>
      minItems?: number
      maxItems?: number
    }
  | {
      $slot: 'ResourceSlot'
      allowed_resource_template_uuids?: string[]
    }
  | {
      anyOf: [
        Exclude<WorkflowValueSchema, { anyOf: unknown }>,
        { type: 'null' }
      ]
    }

export interface WorkflowInputDescriptor {
  name: string
  schema: WorkflowValueSchema
  required: boolean
  default?: WorkflowJsonValue
  title?: string
  description?: string
}

export interface WorkflowOutputDescriptor {
  name: string
  schema: WorkflowValueSchema
  title?: string
  description?: string
  implicit: boolean
}

export interface WorkflowInputContract {
  version: 1
  parameters: WorkflowInputDescriptor[]
}

export interface WorkflowOutputContract {
  version: 1
  outputs: WorkflowOutputDescriptor[]
}

export type WorkflowOutputBinding =
  | { kind: 'workflow_input'; parameter: string }
  | {
      kind: 'node_output'
      workflow_node_uuid: string
      source_handle_uuid: string
    }

export interface WorkflowIoMetadata {
  input_contract: WorkflowInputContract
  output_contract: WorkflowOutputContract
  output_bindings: Record<string, WorkflowOutputBinding>
}

export function decodeWorkflowIoMetadata(value: unknown): WorkflowIoMetadata {
  const metadata = record(value)
  const inputContract = decodeInputContract(metadata.input_contract)
  const outputContract = decodeOutputContract(metadata.output_contract)
  const rawBindings = record(metadata.output_bindings)
  const outputNames = new Set(outputContract.outputs.map(({ name }) => name))
  if (!sameKeys(rawBindings, outputNames)) invalid()

  const outputBindings: Record<string, WorkflowOutputBinding> = {}
  for (const [name, value] of Object.entries(rawBindings)) {
    outputBindings[name] = decodeOutputBinding(value)
  }
  return {
    input_contract: inputContract,
    output_contract: outputContract,
    output_bindings: outputBindings
  }
}

function decodeInputContract(value: unknown): WorkflowInputContract {
  const contract = exactRecord(value, ['version', 'parameters'])
  if (contract.version !== 1 || !Array.isArray(contract.parameters)) invalid()
  const names = new Set<string>()
  const parameters = contract.parameters.map((value) => {
    const descriptor = record(value)
    if (!hasExactOptionalKeys(
      descriptor,
      ['name', 'schema', 'required'],
      ['default', 'title', 'description']
    )) invalid()
    const name = nonEmptyString(descriptor.name)
    if (names.has(name) || typeof descriptor.required !== 'boolean') invalid()
    names.add(name)
    optionalString(descriptor.title)
    optionalString(descriptor.description)
    const schema = decodeValueSchema(descriptor.schema, true, true)
    const hasDefault = Object.hasOwn(descriptor, 'default')
    const nullable = 'anyOf' in schema
    if (
      (descriptor.required && (hasDefault || nullable)) ||
      (!descriptor.required && !hasDefault) ||
      (!descriptor.required && nullable && descriptor.default !== null) ||
      (!descriptor.required && !nullable && descriptor.default === null)
    ) invalid()
    if (hasDefault && !isWorkflowJsonValue(descriptor.default)) invalid()
    return descriptor as unknown as WorkflowInputDescriptor
  })
  return { version: 1, parameters }
}

function decodeOutputContract(value: unknown): WorkflowOutputContract {
  const contract = exactRecord(value, ['version', 'outputs'])
  if (contract.version !== 1 || !Array.isArray(contract.outputs)) invalid()
  const names = new Set<string>()
  const outputs = contract.outputs.map((value) => {
    const descriptor = record(value)
    if (!hasExactOptionalKeys(
      descriptor,
      ['name', 'schema'],
      ['title', 'description', 'implicit']
    )) invalid()
    const name = nonEmptyString(descriptor.name)
    if (names.has(name)) invalid()
    names.add(name)
    optionalString(descriptor.title)
    optionalString(descriptor.description)
    if (
      descriptor.implicit !== undefined &&
      typeof descriptor.implicit !== 'boolean'
    ) invalid()
    decodeValueSchema(descriptor.schema, true, true)
    return {
      ...descriptor,
      implicit: descriptor.implicit ?? false
    } as unknown as WorkflowOutputDescriptor
  })
  return { version: 1, outputs }
}

function decodeOutputBinding(value: unknown): WorkflowOutputBinding {
  const binding = record(value)
  if (binding.kind === 'workflow_input') {
    if (!sameKeys(binding, new Set(['kind', 'parameter']))) invalid()
    return {
      kind: 'workflow_input',
      parameter: nonEmptyString(binding.parameter)
    }
  }
  if (binding.kind === 'node_output') {
    if (!sameKeys(
      binding,
      new Set(['kind', 'workflow_node_uuid', 'source_handle_uuid'])
    )) invalid()
    return {
      kind: 'node_output',
      workflow_node_uuid: nonEmptyString(binding.workflow_node_uuid),
      source_handle_uuid: nonEmptyString(binding.source_handle_uuid)
    }
  }
  return invalid()
}

function decodeValueSchema(
  value: unknown,
  allowArray: boolean,
  allowNullable: boolean
): WorkflowValueSchema {
  const schema = record(value)
  if (Object.hasOwn(schema, 'anyOf')) {
    if (
      !allowNullable ||
      !sameKeys(schema, new Set(['anyOf'])) ||
      !Array.isArray(schema.anyOf) ||
      schema.anyOf.length !== 2
    ) invalid()
    const nullMember = exactRecord(schema.anyOf[1], ['type'])
    if (nullMember.type !== 'null') invalid()
    decodeValueSchema(schema.anyOf[0], true, false)
    return schema as unknown as WorkflowValueSchema
  }
  if (Object.hasOwn(schema, '$slot')) {
    if (!hasExactOptionalKeys(
      schema,
      ['$slot'],
      ['allowed_resource_template_uuids']
    ) || schema.$slot !== 'ResourceSlot') invalid()
    if (schema.allowed_resource_template_uuids !== undefined && (
      !Array.isArray(schema.allowed_resource_template_uuids) ||
      schema.allowed_resource_template_uuids.length === 0 ||
      schema.allowed_resource_template_uuids.some(
        (item) => typeof item !== 'string' || item.length === 0
      )
    )) invalid()
    return schema as unknown as WorkflowValueSchema
  }

  const kind = schema.type
  const optionalByKind: Record<string, string[]> = {
    string: ['enum', 'minLength', 'maxLength', 'x-unilabos-editor-control'],
    integer: ['enum', 'minimum', 'maximum'],
    number: ['enum', 'minimum', 'maximum'],
    boolean: ['enum'],
    object: [],
    array: ['items', 'minItems', 'maxItems']
  }
  if (typeof kind !== 'string' || !(kind in optionalByKind)) invalid()
  if (kind === 'array' && !allowArray) invalid()
  if (!hasExactOptionalKeys(schema, ['type'], optionalByKind[kind] ?? [])) {
    invalid()
  }
  if (kind === 'array') {
    if (!Object.hasOwn(schema, 'items')) invalid()
    decodeValueSchema(schema.items, false, false)
  }
  if (
    schema.enum !== undefined &&
    (!Array.isArray(schema.enum) || schema.enum.length === 0)
  ) invalid()
  return schema as unknown as WorkflowValueSchema
}

function exactRecord(value: unknown, keys: string[]): Record<string, unknown> {
  const result = record(value)
  if (!sameKeys(result, new Set(keys))) invalid()
  return result
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid()
  return value as Record<string, unknown>
}

function hasExactOptionalKeys(
  value: Record<string, unknown>,
  required: string[],
  optional: string[]
): boolean {
  const keys = new Set(Object.keys(value))
  return required.every((key) => keys.has(key)) &&
    [...keys].every((key) => required.includes(key) || optional.includes(key))
}

function sameKeys(
  value: Record<string, unknown>,
  expected: Set<string>
): boolean {
  const keys = Object.keys(value)
  return keys.length === expected.size && keys.every((key) => expected.has(key))
}

function nonEmptyString(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) invalid()
  return value
}

function optionalString(value: unknown): void {
  if (value !== undefined && typeof value !== 'string') invalid()
}

function isWorkflowJsonValue(value: unknown): value is WorkflowJsonValue {
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'string'
  ) return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.every(isWorkflowJsonValue)
  if (value && typeof value === 'object') {
    return Object.values(value).every(isWorkflowJsonValue)
  }
  return false
}

function invalid(): never {
  throw new TypeError('Invalid Workflow I/O contract')
}
