/**
 * ============================================================
 * AI-GENERATED CODE METADATA
 * ============================================================
 * Model: Claude Opus 4.8
 * Generation Date: 2026-07-22
 * Prompt Summary: Uni-Lab-OS REST 客户端封装(设备/资源/任务)
 * Context: 对接 http://localhost:8002/api/v1,统一 { code, data, message } 解包
 * Human Review Status: [ ] Pending  [ ] Reviewed  [ ] Approved
 * ============================================================
 */
import { requestData, type HttpClient } from './http'
import { ServiceError } from './errors'
import type { BackendConfig } from './backends'

export interface DeviceActionTarget {
  deviceId: string
  label: string
}

export interface OnlineDevice {
  id: string
  deviceKey: string
  namespace: string
  machineName: string
  online: boolean
  actions: DeviceAction[]
}

export interface DeviceAction {
  actionName: string
  actionRef: string
  displayName: string
  label: string
  typeName: string
  isBusy: boolean
  currentJobId: string | null
  schema: Record<string, unknown> | null
  inputSchema: Record<string, DeviceActionInputSchema>
  outputSchema: Record<string, DeviceActionInputSchema>
}

export interface DeviceActionInputSchema {
  type?: string
  title?: string
  description?: string
  default?: unknown
  enum?: unknown[]
  required?: boolean
  minimum?: number
  maximum?: number
}

export interface DeviceActionSchema {
  schema: Record<string, unknown>
  goalDefault: Record<string, unknown>
  actionType: string
  isBusy: boolean
  currentJobId: string | null
}

export interface DeviceStatus {
  deviceId: string
  status: Record<string, unknown>
  timestamp: number
}

export interface ResourceNode {
  id: string
  uuid: string
  name: string
  type: string
  className: string
  parent: string | null
  config: Record<string, unknown>
  data: Record<string, unknown>
  position: { x: number; y: number; z: number }
  children: ResourceNode[]
}

interface RuntimeActionTemplate {
  actionRef: string
  actionName: string
  deviceId: string
  label: string
  inputSchema: Record<string, unknown>
  outputSchema: Record<string, unknown>
}

export function createLaboratoryService(
  http: HttpClient,
  backend: BackendConfig
) {
  return {
    async ping(): Promise<boolean> {
      try {
        await http.request<unknown>(
          backend.serverKind === 'edge' ? '/api/v1/health' : '/health'
        )
        return true
      } catch {
        return false
      }
    },

    async getActionDevices(): Promise<DeviceActionTarget[]> {
      const templates = await getRuntimeActionTemplates(http)
      return [...new Set(templates.map((template) => template.deviceId))]
        .sort()
        .map((deviceId) => ({ deviceId, label: deviceId }))
    },

    async getOnlineDevices(): Promise<OnlineDevice[]> {
      const templates = await getRuntimeActionTemplates(http)
      const actionsByDevice = new Map<string, RuntimeActionTemplate[]>()
      for (const template of templates) {
        const actions = actionsByDevice.get(template.deviceId) ?? []
        actions.push(template)
        actionsByDevice.set(template.deviceId, actions)
      }
      return [...actionsByDevice.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([deviceId, actions]) => ({
          id: deviceId,
          deviceKey: `/devices/${deviceId}`,
          namespace: '/devices',
          machineName: 'Uni-Lab OS',
          online: true,
          actions: actions.map(mapDeviceAction)
        }))
    },

    async getDeviceActions(deviceId: string): Promise<DeviceAction[]> {
      const templates = await getRuntimeActionTemplates(http)
      return templates
        .filter((template) => template.deviceId === deviceId)
        .map(mapDeviceAction)
    },

    async getActionSchema(
      deviceId: string,
      actionName: string
    ): Promise<DeviceActionSchema> {
      const actionRef = `${deviceId}.${actionName}`
      const template = (await getRuntimeActionTemplates(http)).find(
        (candidate) => candidate.actionRef === actionRef
      )
      if (!template) {
        throw new ServiceError({
          code: 'ACTION_NOT_FOUND',
          message: `未找到 Action：${actionRef}`,
          status: 404,
          retryable: false
        })
      }
      return mapDeviceActionSchema(template)
    },

    async getResources(): Promise<ResourceNode[]> {
      const raw = await requestData<Record<string, unknown>[]>(
        http,
        '/api/v1/resources'
      )
      return raw.map(mapResource)
    }
  }
}

export type LaboratoryService = ReturnType<typeof createLaboratoryService>

function mapDeviceAction(template: RuntimeActionTemplate): DeviceAction {
  const schema = normalizeInputSchema(template.inputSchema)
  return {
    actionName: template.actionName,
    actionRef: template.actionRef,
    displayName: template.label,
    label: template.label,
    typeName: template.actionRef,
    isBusy: false,
    currentJobId: null,
    schema,
    inputSchema: mapActionSchema(schema.properties),
    outputSchema: mapActionSchema(template.outputSchema)
  }
}

function mapDeviceActionSchema(
  template: RuntimeActionTemplate
): DeviceActionSchema {
  const schema = normalizeInputSchema(template.inputSchema)
  return {
    schema,
    goalDefault: defaultsFromInputSchema(schema),
    actionType: template.actionRef,
    isBusy: false,
    currentJobId: null
  }
}

function mapResource(raw: Record<string, unknown>): ResourceNode {
  const pos = isRecord(raw.position) ? raw.position : {}
  return {
    id: str(raw.id),
    uuid: str(raw.uuid),
    name: str(raw.name),
    type: str(raw.type),
    className: str(raw.class),
    parent: raw.parent == null ? null : str(raw.parent),
    config: isRecord(raw.config) ? raw.config : {},
    data: isRecord(raw.data) ? raw.data : {},
    position: { x: num(pos.x), y: num(pos.y), z: num(pos.z) },
    children: Array.isArray(raw.children)
      ? raw.children.map((child) => mapResource(asRecord(child)))
      : []
  }
}

async function getRuntimeActionTemplates(
  http: HttpClient
): Promise<RuntimeActionTemplate[]> {
  const raw = await http.request<Record<string, unknown>>(
    '/api/v1/workflow-node-templates'
  )
  const items = Array.isArray(raw.items) ? raw.items : []
  return items.flatMap((value) => {
    const item = asRecord(value)
    if (item.kind !== 'action') return []
    const actionRef = str(item.id)
    const separator = actionRef.lastIndexOf('.')
    if (separator <= 0 || separator === actionRef.length - 1) return []
    return [
      {
        actionRef,
        deviceId: actionRef.slice(0, separator),
        actionName: actionRef.slice(separator + 1),
        label: str(item.label) || actionRef.slice(separator + 1),
        inputSchema: asRecord(item.inputSchema),
        outputSchema: asRecord(item.outputSchema)
      }
    ]
  })
}

function mapActionSchema(
  value: unknown
): Record<string, DeviceActionInputSchema> {
  const schema = asRecord(value)
  return Object.fromEntries(
    Object.entries(schema).map(([name, definition]) => [
      name,
      asRecord(definition) as DeviceActionInputSchema
    ])
  )
}

function normalizeInputSchema(
  inputSchema: Record<string, unknown>
): Record<string, unknown> {
  if (inputSchema.type === 'object' && isRecord(inputSchema.properties)) {
    return inputSchema
  }
  return {
    type: 'object',
    properties: inputSchema
  }
}

function defaultsFromInputSchema(
  schema: Record<string, unknown>
): Record<string, unknown> {
  const properties = asRecord(schema.properties)
  return Object.fromEntries(
    Object.entries(properties).flatMap(([name, value]) => {
      const definition = asRecord(value)
      return Object.prototype.hasOwnProperty.call(definition, 'default')
        ? [[name, definition.default]]
        : []
    })
  )
}

function str(value: unknown): string {
  return value == null ? '' : String(value)
}

function num(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}
