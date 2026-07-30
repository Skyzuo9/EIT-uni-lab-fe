import type {
  ActionRunStatus,
  DeviceActionSchema,
  JobResult
} from '@unilab/services'

export type ActionLogLevel = 'info' | 'warning' | 'error' | 'result'

export interface ActionLogLine {
  level: ActionLogLevel
  message: string
}

const STORAGE_PREFIX = 'unilab.device.action-parameters.v1'

export function actionDraftStorageKey(
  backendId: string,
  apiUrl: string,
  deviceId: string,
  actionName: string
): string {
  return [
    STORAGE_PREFIX,
    encodeURIComponent(backendId),
    encodeURIComponent(apiUrl),
    encodeURIComponent(deviceId),
    encodeURIComponent(actionName)
  ].join(':')
}

export function readActionDraft(
  storage: Pick<Storage, 'getItem'> | null,
  key: string,
  fallback: string
): string {
  if (!storage) return fallback
  try {
    return storage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

export function writeActionDraft(
  storage: Pick<Storage, 'setItem'> | null,
  key: string,
  value: string
): void {
  if (!storage) return
  try {
    storage.setItem(key, value)
  } catch {
    // Parameter editing must keep working when storage is unavailable.
  }
}

export function defaultActionParameters(
  actionSchema: DeviceActionSchema
): string {
  const defaults = Object.keys(actionSchema.goalDefault).length > 0
    ? actionSchema.goalDefault
    : defaultsFromSchema(goalSchema(actionSchema.schema))
  return JSON.stringify(defaults, null, 2)
}

export function parseActionParameters(
  value: string
): Record<string, unknown> {
  const parsed: unknown = JSON.parse(value)
  if (!isRecord(parsed)) {
    throw new Error('动作参数必须是 JSON 对象')
  }
  return parsed
}

export function jobStatusLabel(status: ActionRunStatus): string {
  return {
    unknown: '状态未知',
    pending: '等待运行',
    running: '运行中',
    completed: '已完成',
    failed: '失败',
    cancelled: '已终止',
    cancel_requested: '终止中',
    reconciling: '状态确认中',
    dispatch_unknown: '下发状态待确认'
  }[status]
}

export function isActiveJobStatus(status: ActionRunStatus | null): boolean {
  return status != null && ![
    'completed',
    'failed',
    'cancelled'
  ].includes(status)
}

export function projectJobLogs(job: JobResult): ActionLogLine[] {
  const lines: ActionLogLine[] = []
  collectLogValue(job.feedback, 'feedback', lines)
  collectLogValue(job.result, 'result', lines)
  return lines
}

function goalSchema(
  schema: Record<string, unknown>
): Record<string, unknown> {
  const properties = recordOrEmpty(schema.properties)
  return isRecord(properties.goal) ? properties.goal : schema
}

function defaultsFromSchema(
  schema: Record<string, unknown>
): Record<string, unknown> {
  const properties = recordOrEmpty(schema.properties)
  return Object.fromEntries(
    Object.entries(properties).map(([name, rawDefinition]) => {
      const definition = recordOrEmpty(rawDefinition)
      return [name, defaultForDefinition(definition)]
    })
  )
}

function defaultForDefinition(
  definition: Record<string, unknown>
): unknown {
  if (Object.prototype.hasOwnProperty.call(definition, 'default')) {
    return definition.default
  }
  if (Array.isArray(definition.enum) && definition.enum.length > 0) {
    return definition.enum[0]
  }
  switch (definition.type) {
    case 'number':
    case 'integer':
      return 0
    case 'boolean':
      return false
    case 'array':
      return []
    case 'object':
      return defaultsFromSchema(definition)
    default:
      return ''
  }
}

function collectLogValue(
  value: unknown,
  path: string,
  target: ActionLogLine[]
): void {
  if (value == null) return
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectLogValue(item, `${path}[${index}]`, target)
    )
    return
  }
  if (isRecord(value)) {
    Object.entries(value).forEach(([key, item]) =>
      collectLogValue(item, `${path}.${key}`, target)
    )
    return
  }

  const message = typeof value === 'string'
    ? value
    : JSON.stringify(value)
  target.push({
    level: logLevel(path, message),
    message: `${path}: ${message}`
  })
}

function logLevel(path: string, message: string): ActionLogLevel {
  const normalized = `${path} ${message}`.toLowerCase()
  if (
    normalized.includes('traceback') ||
    normalized.includes('exception') ||
    normalized.includes('error') ||
    normalized.includes('stderr') ||
    normalized.includes('failed')
  ) {
    return 'error'
  }
  if (normalized.includes('warning') || normalized.includes('warn')) {
    return 'warning'
  }
  if (
    normalized.includes('info') ||
    normalized.includes('log') ||
    normalized.includes('message') ||
    normalized.includes('stdout') ||
    normalized.includes('feedback')
  ) {
    return 'info'
  }
  return 'result'
}

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}
