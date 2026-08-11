import { ServiceError } from './errors'
import type { HttpClient } from './http'

export interface DeviceActionTaskCreateRequest {
  material_uuid: string
  workflow_node_template_uuid: string
  param: Record<string, unknown>
  execution_policy?: Record<string, unknown>
  idempotency_key: string
  description?: string
  meta_data?: Record<string, unknown>
}

export interface DeviceActionTaskView {
  task_uuid: string
  job_uuid: string
  status: string
  control_status: string
  cleanup_status: string
  output: Record<string, unknown>
  error_info: unknown[]
  job_status: string
  feedback_cursor: number
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
  ): Promise<unknown> => {
    const raw = await http.request<unknown>(path, init)
    return parseEnvelopeData(raw)
  }

  return {
    createDeviceActionTask: async (body) => parseActionRunResult(
      await request('/api/v1/device-action-runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
    ),
    getDeviceActionTask: async (taskUuid) => {
      const encodedTaskUuid = encodeURIComponent(taskUuid)
      const [task, jobsValue] = await Promise.all([
        request(`/api/v1/workflow-tasks/${encodedTaskUuid}`),
        request(`/api/v1/workflow-tasks/${encodedTaskUuid}/jobs`)
      ])
      const jobs = array(jobsValue)
      if (jobs.length !== 1) throw invalidResponse()
      return parseTaskAndJob(task, jobs[0])
    }
  }
}

/** 读取 Uni-Lab OS 的统一响应包并保留可处理的服务错误。 */
function parseEnvelopeData(raw: unknown): unknown {
  const envelope = record(raw)
  if (envelope.code !== 0) {
    const businessCode = integer(envelope.code)
    const error = record(envelope.error)
    const message = string(error.message) || string(error.msg)
    if (message) {
      throw new ServiceError({
        code: string(error.code) ||
          `DEVICE_ACTION_RUN_REJECTED_${businessCode}`,
        message,
        retryable: businessCode >= 5000
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
  return envelope.data
}

/** 把 Backend 标准任务与作业创建结果投影为设备页所需的紧凑运行视图。 */
function parseActionRunResult(raw: unknown): DeviceActionTaskView {
  const result = record(raw)
  if (typeof result.created !== 'boolean') throw invalidResponse()
  return parseTaskAndJob(result.task, result.job)
}

/** 校验同一设备单动作运行的任务与唯一作业，并生成前端只读投影。 */
function parseTaskAndJob(
  taskValue: unknown,
  jobValue: unknown
): DeviceActionTaskView {
  const task = record(taskValue)
  const job = record(jobValue)
  const taskUuid = requiredString(task.uuid)
  if (requiredString(job.workflow_task_uuid ?? taskUuid) !== taskUuid) {
    throw invalidResponse()
  }
  const feedbackCursor = integer(job.feedback_sequence)
  const taskErrors = array(task.error_info)
  const jobErrors = array(job.error_info)
  const parsed: DeviceActionTaskView = {
    task_uuid: taskUuid,
    job_uuid: requiredString(job.uuid),
    status: requiredString(task.status),
    control_status: requiredString(task.control_status),
    cleanup_status: requiredString(task.cleanup_status),
    output: record(job.return_info),
    error_info: jobErrors.length > 0 ? jobErrors : taskErrors,
    job_status: requiredString(job.status),
    feedback_cursor: feedbackCursor
  }
  if (feedbackCursor < 0) {
    throw invalidResponse()
  }
  return parsed
}

/** 校验并复制服务端数组，避免后续修改原始响应。 */
function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw invalidResponse()
  return [...value]
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

function integer(value: unknown): number {
  if (!Number.isInteger(value)) throw invalidResponse()
  return value as number
}

function invalidResponse(): never {
  throw new ServiceError({
    code: 'INVALID_DEVICE_ACTION_TASK_RESPONSE',
    message: '设备单动作服务返回了无效响应',
    retryable: false
  })
}
