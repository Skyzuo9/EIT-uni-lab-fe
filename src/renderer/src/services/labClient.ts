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
import type {
  ApiEnvelope,
  DeviceAction,
  JobRequest,
  JobResult,
  OnlineDevice,
  ResourceNode
} from '../data/lab'

// 默认请求超时(毫秒)
const REQUEST_TIMEOUT_MS = 8000

// 带超时的 fetch,并解包 { code, data, message }
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    if (!response.ok) {
      throw new Error(`请求失败: ${response.status} ${response.statusText}`)
    }
    const envelope = (await response.json()) as ApiEnvelope<T>
    if (envelope.code !== 0) {
      throw new Error(envelope.message || `后端返回错误码 ${envelope.code}`)
    }
    return envelope.data
  } finally {
    clearTimeout(timer)
  }
}

// REST 客户端:所有方法基于传入的 baseUrl 构造
export function createLabClient(baseUrl: string) {
  const api = `${baseUrl.replace(/\/$/, '')}/api/v1`

  return {
    // 健康探测:拉一次在线设备列表判定连通性
    async ping(): Promise<boolean> {
      try {
        await request<unknown>(`${api}/online-devices`)
        return true
      } catch {
        return false
      }
    },

    // 在线设备列表
    async getOnlineDevices(): Promise<OnlineDevice[]> {
      const raw = await request<Record<string, unknown>[]>(`${api}/online-devices`)
      return raw.map(mapOnlineDevice)
    },

    // 单设备可用动作
    async getDeviceActions(deviceId: string): Promise<DeviceAction[]> {
      const raw = await request<Record<string, unknown>[]>(
        `${api}/devices/${encodeURIComponent(deviceId)}/actions`
      )
      return raw.map(mapDeviceAction)
    },

    // 单个动作的 JSON Schema
    async getActionSchema(
      deviceId: string,
      actionName: string
    ): Promise<Record<string, unknown>> {
      return request<Record<string, unknown>>(
        `${api}/devices/${encodeURIComponent(deviceId)}/actions/${encodeURIComponent(actionName)}/schema`
      )
    },

    // 资源(物料)列表
    async getResources(): Promise<ResourceNode[]> {
      const raw = await request<Record<string, unknown>[]>(`${api}/resources`)
      return raw.map(mapResource)
    },

    // 提交任务
    async addJob(job: JobRequest): Promise<JobResult> {
      const raw = await request<Record<string, unknown>>(`${api}/job/add`, {
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

    // 查询任务状态(注意:后端首次查询后自动删除)
    async getJobStatus(jobId: string): Promise<JobResult> {
      const raw = await request<Record<string, unknown>>(
        `${api}/job/${encodeURIComponent(jobId)}/status`
      )
      return mapJobResult(raw)
    }
  }
}

export type LabClient = ReturnType<typeof createLabClient>

// ============ 字段映射(snake_case -> camelCase) ============

function mapOnlineDevice(raw: Record<string, unknown>): OnlineDevice {
  return {
    deviceKey: str(raw.device_key),
    namespace: str(raw.namespace),
    machineName: str(raw.machine_name),
    uuid: str(raw.uuid),
    nodeName: str(raw.node_name)
  }
}

function mapDeviceAction(raw: Record<string, unknown>): DeviceAction {
  return {
    actionName: str(raw.action_name ?? raw.name),
    typeName: str(raw.type_name),
    isBusy: Boolean(raw.is_busy),
    currentJobId: raw.current_job_id == null ? null : str(raw.current_job_id),
    schema: isRecord(raw.schema) ? raw.schema : null
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
    children: Array.isArray(raw.children) ? raw.children.map((c) => mapResource(asRecord(c))) : []
  }
}

function mapJobResult(raw: Record<string, unknown>): JobResult {
  const code = Number(raw.status)
  return {
    jobId: str(raw.jobId ?? raw.job_id),
    status: (Number.isInteger(code) && code >= 0 && code <= 6 ? code : 0) as JobResult['status'],
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
