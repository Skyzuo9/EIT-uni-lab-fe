import { ServiceError } from './errors'
import type { HttpClient } from './http'

export interface DeviceActionTaskCreateRequest {
  authority_id: string
  template_catalog_fingerprint: string
  workflow_node_template_uuid: string
  device_id: string
  input: Record<string, unknown>
  idempotency_key: string
  description?: string
}

export interface DeviceActionTaskView {
  task_uuid: string
  job_uuid: string
  authority_id: string
  template_catalog_fingerprint: string
  workflow_node_template_uuid: string
  name: string
  display_name: string
  device_id: string
  status: string
  control_status: string
  cleanup_status: string
  input: Record<string, unknown>
  output: Record<string, unknown>
  error_info: unknown[]
  job_status: string
  feedback_cursor: number
  create_time: string
  update_time: string
  started_at: string | null
  finished_at: string | null
}

export interface DeviceActionTaskRuntimePort {
  createDeviceActionTask: (
    request: DeviceActionTaskCreateRequest
  ) => Promise<DeviceActionTaskView>
  getDeviceActionTask: (taskUuid: string) => Promise<DeviceActionTaskView>
}

export function createDeviceActionTaskRuntime(
  http: HttpClient
): DeviceActionTaskRuntimePort {
  const request = async (
    path: string,
    init?: RequestInit
  ): Promise<DeviceActionTaskView> => {
    const raw = await http.request<unknown>(path, init)
    return parseEnvelope(raw)
  }

  return {
    createDeviceActionTask: (body) => request(
      '/api/v1/device-action-tasks',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }
    ),
    getDeviceActionTask: (taskUuid) => request(
      `/api/v1/device-action-tasks/${encodeURIComponent(taskUuid)}`
    )
  }
}

const VIEW_KEYS = new Set([
  'task_uuid',
  'job_uuid',
  'authority_id',
  'template_catalog_fingerprint',
  'workflow_node_template_uuid',
  'name',
  'display_name',
  'device_id',
  'status',
  'control_status',
  'cleanup_status',
  'input',
  'output',
  'error_info',
  'job_status',
  'feedback_cursor',
  'create_time',
  'update_time',
  'started_at',
  'finished_at'
])

function parseEnvelope(raw: unknown): DeviceActionTaskView {
  const envelope = record(raw)
  if (envelope.code !== 0) {
    const error = record(envelope.error)
    const code = string(error.code)
    const message = string(error.message)
    if (code && message) {
      throw new ServiceError({
        code,
        message,
        status: integer(envelope.code),
        retryable: integer(envelope.code) >= 500
      })
    }
    throw invalidResponse()
  }
  if (
    !Object.prototype.hasOwnProperty.call(envelope, 'data') ||
    Object.prototype.hasOwnProperty.call(envelope, 'error')
  ) {
    throw invalidResponse()
  }
  return parseView(envelope.data)
}

function parseView(raw: unknown): DeviceActionTaskView {
  const value = record(raw)
  if (
    Object.keys(value).some((key) => !VIEW_KEYS.has(key)) ||
    Object.keys(value).length !== VIEW_KEYS.size
  ) {
    throw invalidResponse()
  }
  const input = record(value.input)
  const output = record(value.output)
  const errorInfo = value.error_info
  const feedbackCursor = integer(value.feedback_cursor)
  const parsed: DeviceActionTaskView = {
    task_uuid: requiredString(value.task_uuid),
    job_uuid: requiredString(value.job_uuid),
    authority_id: requiredString(value.authority_id),
    template_catalog_fingerprint: fingerprint(
      value.template_catalog_fingerprint
    ),
    workflow_node_template_uuid: requiredString(
      value.workflow_node_template_uuid
    ),
    name: requiredString(value.name),
    display_name: requiredString(value.display_name),
    device_id: requiredString(value.device_id),
    status: requiredString(value.status),
    control_status: requiredString(value.control_status),
    cleanup_status: requiredString(value.cleanup_status),
    input,
    output,
    error_info: Array.isArray(errorInfo) ? [...errorInfo] : invalidResponse(),
    job_status: requiredString(value.job_status),
    feedback_cursor: feedbackCursor,
    create_time: requiredString(value.create_time),
    update_time: requiredString(value.update_time),
    started_at: nullableString(value.started_at),
    finished_at: nullableString(value.finished_at)
  }
  if (feedbackCursor < 0) {
    throw invalidResponse()
  }
  return parsed
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw invalidResponse()
  }
  return value as Record<string, unknown>
}

function string(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function requiredString(value: unknown): string {
  const parsed = string(value)
  if (!parsed) throw invalidResponse()
  return parsed
}

function nullableString(value: unknown): string | null {
  if (value === null) return null
  return requiredString(value)
}

function integer(value: unknown): number {
  if (!Number.isInteger(value)) throw invalidResponse()
  return value as number
}

function fingerprint(value: unknown): string {
  const parsed = requiredString(value)
  if (!/^sha256:[0-9a-f]{64}$/.test(parsed)) throw invalidResponse()
  return parsed
}

function invalidResponse(): never {
  throw new ServiceError({
    code: 'INVALID_DEVICE_ACTION_TASK_RESPONSE',
    message: '设备 Action Task 服务返回了无效响应',
    retryable: false
  })
}
