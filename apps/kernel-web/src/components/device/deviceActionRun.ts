import type {
  DeviceAction,
  DeviceActionInputSchema,
  WorkflowActionCatalogSnapshot,
  WorkflowActionNodeTemplate
} from '@unilab/services'

export type DeviceActionArgumentDraft = Record<string, string | boolean>

export function matchDeviceActionTemplate(
  catalog: WorkflowActionCatalogSnapshot,
  action: DeviceAction
): WorkflowActionNodeTemplate | null {
  const matches = catalog.actionTemplates.filter((template) =>
    template.name === action.actionName &&
    template.actionType === action.typeName
  )
  return matches.length === 1 ? matches[0] ?? null : null
}

export function supportsD1AS1(
  template: WorkflowActionNodeTemplate
): boolean {
  return template.handles.every((handle) =>
    handle.editorControl !== 'material_port' &&
    handle.editorControl !== 'site_selector' &&
    !handle.implicitPassthrough &&
    !containsUnsupportedContract(handle.valueSchema)
  ) && !containsUnsupportedContract(template.schema)
}

export function serializeDeviceActionInput(
  action: DeviceAction,
  draft: DeviceActionArgumentDraft
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(action.inputSchema).flatMap(([name, schema]) => {
      const value = draft[name]
      if (value === '' || value === undefined) {
        if (schema.required) throw new Error(`${fieldLabel(name, schema)} 为必填项`)
        return []
      }
      return [[name, parseField(name, schema, value)]]
    })
  )
}

function parseField(
  name: string,
  schema: DeviceActionInputSchema,
  value: string | boolean
): unknown {
  const label = fieldLabel(name, schema)
  if (schema.type === 'boolean') {
    if (typeof value !== 'boolean') throw new Error(`${label} 必须是布尔值`)
    return value
  }
  if (typeof value !== 'string') throw new Error(`${label} 的输入格式不正确`)
  if (schema.type === 'integer') {
    const parsed = Number(value)
    if (!Number.isInteger(parsed)) throw new Error(`${label} 必须是整数`)
    assertNumberRange(label, schema, parsed)
    return parsed
  }
  if (schema.type === 'number') {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) throw new Error(`${label} 必须是数字`)
    assertNumberRange(label, schema, parsed)
    return parsed
  }
  if (schema.type === 'array' || schema.type === 'object') {
    let parsed: unknown
    try {
      parsed = JSON.parse(value) as unknown
    } catch {
      throw new Error(`${label} 必须是有效 JSON`)
    }
    if (schema.type === 'array' && !Array.isArray(parsed)) {
      throw new Error(`${label} 必须是数组`)
    }
    if (
      schema.type === 'object' &&
      (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    ) {
      throw new Error(`${label} 必须是对象`)
    }
    return parsed
  }
  return value
}

function assertNumberRange(
  label: string,
  schema: DeviceActionInputSchema,
  value: number
): void {
  if (schema.minimum !== undefined && value < schema.minimum) {
    throw new Error(`${label} 不能小于 ${schema.minimum}`)
  }
  if (schema.maximum !== undefined && value > schema.maximum) {
    throw new Error(`${label} 不能大于 ${schema.maximum}`)
  }
}

function fieldLabel(name: string, schema: DeviceActionInputSchema): string {
  return schema.title || name
}

function containsUnsupportedContract(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsUnsupportedContract)
  if (!value || typeof value !== 'object') return value === 'ResourceSlot'
  const record = value as Record<string, unknown>
  if (
    record.$slot === 'ResourceSlot' ||
    record.editor_control === 'material_port' ||
    record.editor_control === 'site_selector' ||
    record.implicit_passthrough === true
  ) {
    return true
  }
  return Object.values(record).some(containsUnsupportedContract)
}
