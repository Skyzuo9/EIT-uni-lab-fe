import { ServiceError } from './errors'
import { workflowEnvelopeBusinessError } from './workflowEnvelope'

/** 严格解包工作流运行（Workflow Runtime）接口响应。 */
export function strictRuntimeData<Value>(raw: unknown): Value {
  const businessError = workflowEnvelopeBusinessError(raw)
  if (businessError) throw businessError
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw invalidRuntimeResponse()
  }
  const envelope = raw as Record<string, unknown>
  if (
    envelope.code !== 0 ||
    !Object.prototype.hasOwnProperty.call(envelope, 'data') ||
    Object.prototype.hasOwnProperty.call(envelope, 'error')
  ) {
    throw invalidRuntimeResponse()
  }
  return envelope.data as Value
}

/** 构造统一、不可重试的运行响应错误。 */
function invalidRuntimeResponse(): ServiceError {
  return new ServiceError({
    code: 'INVALID_API_RESPONSE',
    message: 'Workflow Runtime 服务返回了无效响应',
    retryable: false
  })
}
