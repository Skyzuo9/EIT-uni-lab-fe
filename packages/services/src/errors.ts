import type { ServerCapability } from './capabilities'

export class ServiceError extends Error {
  readonly code: string
  readonly status?: number
  readonly retryable: boolean

  constructor(options: {
    code: string
    message: string
    status?: number
    retryable?: boolean
  }) {
    super(options.message)
    this.name = 'ServiceError'
    this.code = options.code
    this.status = options.status
    this.retryable = options.retryable ?? false
  }
}

export class UnsupportedCapabilityError extends ServiceError {
  readonly capability: ServerCapability

  constructor(capability: ServerCapability, reason: string) {
    super({
      code: 'UNSUPPORTED_CAPABILITY',
      message: reason,
      retryable: false
    })
    this.name = 'UnsupportedCapabilityError'
    this.capability = capability
  }
}

export function assertCapability(
  status: { available: boolean; reason?: string },
  capability: ServerCapability
): void {
  if (status.available) return
  throw new UnsupportedCapabilityError(
    capability,
    status.reason ?? `当前服务不支持 ${capability}`
  )
}
