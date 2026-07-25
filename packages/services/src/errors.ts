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
