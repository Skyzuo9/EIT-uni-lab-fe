import type { HttpClient } from './http'
import { ServiceError } from './errors'

export type WorkflowActionEditorControl =
  | 'material_port'
  | 'site_selector'
  | 'variable_selector'

export interface WorkflowActionHandleTemplate {
  uuid: string
  workflowNodeTemplateUuid: string
  handleKey: string
  ioType: 'source' | 'target'
  displayName: string
  valueType: string
  required: boolean
  dataSource: string | null
  dataKey: string | null
  valueSchema: Record<string, unknown>
  editorControl: WorkflowActionEditorControl
  allowedResourceTemplateUuids: string[] | null
  implicitPassthrough: boolean
  structuralRole: 'ready' | null
  wireValue?: Record<string, unknown>
}

export interface WorkflowActionNodeTemplate {
  uuid: string
  resourceTemplateUuid: string
  name: string
  displayName: string
  actionClass: string | null
  actionType: string
  schema: Record<string, unknown>
  goal: Record<string, unknown>
  goalDefault: Record<string, unknown>
  handles: WorkflowActionHandleTemplate[]
  wireValue?: Record<string, unknown>
}

export interface WorkflowActionCatalogSnapshot {
  authorityId: string
  authorityKind: 'local' | 'backend'
  fingerprint: string
  nodeTemplates: WorkflowActionNodeTemplate[]
}

export async function loadWorkflowActionCatalog(
  http: HttpClient
): Promise<WorkflowActionCatalogSnapshot> {
  const list = catalogEnvelope(
    await http.request<unknown>('/api/v1/workflow-node-templates')
  )
  const authority = authorityValue(list.authority)
  const fingerprint = fingerprintValue(list.catalog_fingerprint)
  const summaries = recordArray(list.items)
  const nodeUuids = new Set<string>()
  const summaryValues = summaries.map((summary) => {
    const uuid = uuidValue(summary.uuid)
    if (nodeUuids.has(uuid)) invalidCatalog()
    nodeUuids.add(uuid)
    const resource = recordValue(summary.resource_template)
    return {
      uuid,
      name: stringValue(summary.name),
      displayName: stringValue(summary.display_name),
      actionType: stringValue(summary.type),
      resourceTemplateUuid: uuidValue(resource.uuid)
    }
  })

  const details = await Promise.all(summaryValues.map(async (summary) => {
    const data = catalogEnvelope(await http.request<unknown>(
      `/api/v1/workflow-node-templates/${encodeURIComponent(summary.uuid)}`
    ))
    if (
      !sameAuthority(authority, authorityValue(data.authority)) ||
      fingerprintValue(data.catalog_fingerprint) !== fingerprint
    ) {
      invalidCatalog()
    }
    const template = recordValue(data.template)
    const uuid = uuidValue(template.uuid)
    const resourceTemplateUuid = uuidValue(template.resource_template_uuid)
    if (
      uuid !== summary.uuid ||
      resourceTemplateUuid !== summary.resourceTemplateUuid ||
      stringValue(template.name) !== summary.name ||
      stringValue(template.display_name) !== summary.displayName ||
      stringValue(template.type) !== summary.actionType
    ) {
      invalidCatalog()
    }
    const schema = recordValue(template.schema)
    assertTypedActionSchema(schema)
    return attachWireValue({
      uuid,
      resourceTemplateUuid,
      name: summary.name,
      displayName: summary.displayName,
      actionClass: nullableString(template.class),
      actionType: summary.actionType,
      schema,
      goal: recordValue(template.goal),
      goalDefault: recordValue(template.goal_default),
      handles: recordArray(data.handles).map((handle) =>
        projectHandle(handle, uuid)
      )
    }, template)
  }))

  const handleUuids = new Set<string>()
  for (const detail of details) {
    for (const handle of detail.handles) {
      if (handleUuids.has(handle.uuid)) invalidCatalog()
      handleUuids.add(handle.uuid)
    }
  }
  return {
    authorityId: authority.authorityId,
    authorityKind: authority.kind,
    fingerprint,
    nodeTemplates: details
  }
}

function projectHandle(
  raw: Record<string, unknown>,
  parentUuid: string
): WorkflowActionHandleTemplate {
  const uuid = uuidValue(raw.uuid)
  const workflowNodeTemplateUuid = uuidValue(
    raw.workflow_node_template_uuid
  )
  if (workflowNodeTemplateUuid !== parentUuid) invalidCatalog()
  const ioType = stringValue(raw.io_type)
  if (ioType !== 'source' && ioType !== 'target') invalidCatalog()
  if (typeof raw.required !== 'boolean') invalidCatalog()
  const unilab = recordValue(recordValue(raw.meta_data).unilab)
  const control = stringValue(unilab.editor_control)
  if (
    control !== 'material_port' &&
    control !== 'site_selector' &&
    control !== 'variable_selector'
  ) {
    invalidCatalog()
  }
  const allowlist = allowlistValue(unilab.allowed_resource_template_uuids)
  return attachWireValue({
    uuid,
    workflowNodeTemplateUuid,
    handleKey: stringValue(raw.handle_key),
    ioType,
    displayName: stringValue(raw.display_name),
    valueType: stringValue(raw.type),
    required: raw.required,
    dataSource: nullableString(raw.data_source),
    dataKey: nullableString(raw.data_key),
    valueSchema: recordValue(unilab.value_schema),
    editorControl: control,
    allowedResourceTemplateUuids: allowlist,
    implicitPassthrough: booleanValue(unilab.implicit_passthrough),
    structuralRole: structuralRoleValue(unilab.structural_role)
  }, raw)
}

function attachWireValue<T extends object>(
  value: T,
  wireValue: Record<string, unknown>
): T & { wireValue: Record<string, unknown> } {
  Object.defineProperty(value, 'wireValue', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: { ...wireValue }
  })
  return value as T & { wireValue: Record<string, unknown> }
}

function assertTypedActionSchema(schema: Record<string, unknown>): void {
  const extension = recordValue(schema['x-unilabos-action-contract'])
  if (extension.version !== 1) invalidCatalog()
  const inputOrder = stringArray(extension.input_order)
  const outputOrder = stringArray(extension.output_order)
  if (
    new Set(inputOrder).size !== inputOrder.length ||
    new Set(outputOrder).size !== outputOrder.length
  ) {
    invalidCatalog()
  }
}

function catalogEnvelope(raw: unknown): Record<string, unknown> {
  const envelope = recordValue(raw)
  if (
    envelope.code !== 0 ||
    !Object.prototype.hasOwnProperty.call(envelope, 'data') ||
    Object.prototype.hasOwnProperty.call(envelope, 'error')
  ) {
    invalidCatalog()
  }
  return recordValue(envelope.data)
}

function authorityValue(raw: unknown): {
  authorityId: string
  kind: 'local' | 'backend'
} {
  const authority = recordValue(raw)
  const authorityId = stringValue(authority.authority_id)
  const kind = stringValue(authority.kind)
  if (kind !== 'local' && kind !== 'backend') invalidCatalog()
  return { authorityId, kind }
}

function sameAuthority(
  left: { authorityId: string; kind: string },
  right: { authorityId: string; kind: string }
): boolean {
  return left.authorityId === right.authorityId && left.kind === right.kind
}

function fingerprintValue(raw: unknown): string {
  const value = stringValue(raw)
  if (!/^sha256:[0-9a-f]{64}$/.test(value)) invalidCatalog()
  return value
}

function uuidValue(raw: unknown): string {
  const value = stringValue(raw)
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(value)
  ) {
    invalidCatalog()
  }
  return value.toLowerCase()
}

function allowlistValue(raw: unknown): string[] | null {
  if (raw === null) return null
  const values = stringArray(raw).map(uuidValue)
  if (values.length === 0 || new Set(values).size !== values.length) {
    invalidCatalog()
  }
  return values
}

function recordValue(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) invalidCatalog()
  return raw as Record<string, unknown>
}

function recordArray(raw: unknown): Record<string, unknown>[] {
  if (!Array.isArray(raw)) invalidCatalog()
  return raw.map(recordValue)
}

function stringArray(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.some((item) => typeof item !== 'string')) {
    invalidCatalog()
  }
  return raw as string[]
}

function stringValue(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length === 0) invalidCatalog()
  return raw
}

function nullableString(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null
  return stringValue(raw)
}

function booleanValue(raw: unknown): boolean {
  if (typeof raw !== 'boolean') invalidCatalog()
  return raw
}

function structuralRoleValue(raw: unknown): 'ready' | null {
  if (raw === undefined || raw === null) return null
  if (raw !== 'ready') invalidCatalog()
  return raw
}

function invalidCatalog(): never {
  throw new ServiceError({
    code: 'INVALID_API_RESPONSE',
    message: 'Workflow Action Catalog 返回了无效响应',
    retryable: false
  })
}
