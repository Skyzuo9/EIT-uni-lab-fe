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
  typeName: string
  isBusy: boolean
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

export interface JobRequest {
  deviceId: string
  action: string
  actionArgs: Record<string, unknown>
}

export type JobStatusCode = 0 | 1 | 2 | 3 | 4 | 5 | 6

export interface JobResult {
  jobId: string
  status: JobStatusCode
  result: Record<string, unknown> | null
}

export function createLaboratoryService(http: HttpClient) {
  return {
    async ping(): Promise<boolean> {
      try {
        await http.request<unknown>('/health')
        return true
      } catch {
        return false
      }
    },

    async getOnlineDevices(): Promise<OnlineDevice[]> {
      const raw = await http.request<unknown>(
        '/api/v1/devices'
      )
      const payload = unwrapRecord(raw)
      const items = Array.isArray(payload.items) ? payload.items : []
      return items.map((item) => mapOnlineDevice(asRecord(item)))
    },

    async getDeviceActions(deviceId: string): Promise<DeviceAction[]> {
      const devices = await this.getOnlineDevices()
      return devices.find((device) => device.id === deviceId)?.actions ?? []
    },

    async getActionSchema(
      deviceId: string,
      actionName: string
    ): Promise<Record<string, unknown>> {
      const action = (await this.getDeviceActions(deviceId))
        .find((candidate) => candidate.actionName === actionName)
      return action?.inputSchema ?? {}
    },

    async getResources(): Promise<ResourceNode[]> {
      const raw = await requestData<Record<string, unknown>[]>(http, '/api/v1/resources')
      return raw.map(mapResource)
    },

    async addJob(job: JobRequest): Promise<JobResult> {
      const raw = await requestData<Record<string, unknown>>(http, '/api/v1/job/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_id: job.deviceId,
          action: job.action,
          action_args: job.actionArgs
        })
      })
      return mapJobResult(raw)
    },

    async getJobStatus(jobId: string): Promise<JobResult> {
      const raw = await requestData<Record<string, unknown>>(
        http,
        `/api/v1/job/${encodeURIComponent(jobId)}/status`
      )
      return mapJobResult(raw)
    }
  }
}

export type LaboratoryService = ReturnType<typeof createLaboratoryService>

// ============ 字段映射(snake_case -> camelCase) ============

function mapOnlineDevice(raw: Record<string, unknown>): OnlineDevice {
  return {
    id: str(raw.id),
    deviceKey: str(raw.deviceKey ?? raw.device_key),
    namespace: str(raw.namespace),
    machineName: str(raw.name ?? raw.machine_name ?? raw.id),
    online: Boolean(raw.online ?? raw.is_online),
    actions: Array.isArray(raw.actions)
      ? raw.actions.map((action) => mapDeviceAction(asRecord(action)))
      : []
  }
}

function mapDeviceAction(raw: Record<string, unknown>): DeviceAction {
  return {
    actionName: str(raw.id ?? raw.action_name),
    actionRef: str(raw.actionRef ?? raw.action_ref),
    displayName: str(raw.name ?? raw.label ?? raw.id ?? raw.action_name),
    typeName: str(raw.typeName ?? raw.type_name),
    isBusy: Boolean(raw.busy ?? raw.is_busy),
    inputSchema: mapActionSchema(raw.inputSchema ?? raw.input_schema),
    outputSchema: mapActionSchema(raw.outputSchema ?? raw.output_schema)
  }
}

function mapActionSchema(
  raw: unknown
): Record<string, DeviceActionInputSchema> {
  if (!isRecord(raw)) return {}
  return Object.fromEntries(
    Object.entries(raw).map(([name, value]) => [
      name,
      isRecord(value) ? value as DeviceActionInputSchema : {}
    ])
  )
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
    children: Array.isArray(raw.children) ? raw.children.map((c) => mapResource(asRecord(c))) : []
  }
}

function mapJobResult(raw: Record<string, unknown>): JobResult {
  const code = Number(raw.status)
  return {
    jobId: str(raw.jobId ?? raw.job_id),
    status: (Number.isInteger(code) && code >= 0 && code <= 6 ? code : 0) as JobStatusCode,
    result: isRecord(raw.result) ? raw.result : null
  }
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

function unwrapRecord(raw: unknown): Record<string, unknown> {
  const record = asRecord(raw)
  return isRecord(record.data) ? record.data : record
}
