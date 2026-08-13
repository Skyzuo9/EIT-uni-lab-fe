import { ServiceError } from './errors'

/** 将 OS 的 HTTP 200 业务错误 envelope 保留为可行动的服务错误。 */
export function workflowEnvelopeBusinessError(raw: unknown): ServiceError | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const envelope = raw as Record<string, unknown>
  if (typeof envelope.code !== 'number' || envelope.code === 0) return null
  if (!envelope.error || typeof envelope.error !== 'object' ||
    Array.isArray(envelope.error)) return null
  const error = envelope.error as Record<string, unknown>
  if (typeof error.msg !== 'string' || !error.msg.trim()) return null
  return new ServiceError({
    code: `OS_${envelope.code}`,
    message: error.msg,
    retryable: false
  })
}
