import type { DeviceCardAgentErrorCode, DeviceCardAgentErrorPayload } from '@unilab/device-card-sdk'

export class DeviceCardAuthoringError extends Error {
  readonly code: DeviceCardAgentErrorCode
  readonly retryable: boolean
  readonly details: Record<string, unknown>

  constructor(
    code: DeviceCardAgentErrorCode,
    message: string,
    options: {
      retryable?: boolean
      details?: Record<string, unknown>
      cause?: unknown
    } = {}
  ) {
    super(message, { cause: options.cause })
    this.name = 'DeviceCardAuthoringError'
    this.code = code
    this.retryable = options.retryable ?? false
    this.details = options.details ?? {}
  }
}


export function toDeviceCardAgentError(error: unknown): DeviceCardAgentErrorPayload {
  if (error instanceof DeviceCardAuthoringError) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      details: structuredClone(error.details)
    }
  }
  return {
    code: 'INTERNAL_ERROR',
    message: error instanceof Error ? error.message : String(error),
    retryable: false,
    details: {}
  }
}


export function authoringError(
  code: DeviceCardAgentErrorCode,
  message: string,
  details: Record<string, unknown> = {},
  cause?: unknown,
  retryable = false
): DeviceCardAuthoringError {
  return new DeviceCardAuthoringError(code, message, {
    retryable,
    details,
    cause
  })
}

