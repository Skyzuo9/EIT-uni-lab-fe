import { ServiceError } from './errors'
import type {
  WorkflowAuthoringAggregate,
  WorkflowAuthoringTransformResult
} from './workflowAuthoringContracts'
import { decodeWorkflowIoMetadata } from './workflowIo'

/**
 * 严格解包工作流创作（Workflow Authoring）接口响应，并保留产品 Edge 的细分错误。
 *
 * @param raw 未信任的响应包络。
 * @returns 业务码为零时的权威响应数据。
 * @throws 响应结构无效时抛 `INVALID_API_RESPONSE`；服务拒绝时保留服务端错误码与消息。
 */
export function strictAuthoringData<Value>(raw: unknown): Value {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw invalidAuthoringResponse()
  }
  const envelope = raw as Record<string, unknown>
  if (envelope.code !== 0) {
    if (!Number.isInteger(envelope.code)) throw invalidAuthoringResponse()
    const problem = authoringRecord(envelope.error)
    if (typeof problem.msg !== 'string' || !problem.msg) {
      throw invalidAuthoringResponse()
    }
    throw new ServiceError({
      code: typeof problem.code === 'string' && problem.code
        ? problem.code
        : envelope.code === 3003 ? 'conflict' : 'API_REQUEST_REJECTED',
      message: problem.msg,
      retryable: false
    })
  }
  if (!Object.prototype.hasOwnProperty.call(envelope, 'data')) {
    throw invalidAuthoringResponse()
  }
  return envelope.data as Value
}

/** 校验并返回持久工作流创作聚合（Workflow Authoring Aggregate）。 */
export function decodeWorkflowAuthoringAggregate(
  value: unknown
): WorkflowAuthoringAggregate {
  try {
    const aggregate = authoringRecord(value)
    decodeWorkflowAuthoringGraph(aggregate.applied_graph)
    return aggregate as unknown as WorkflowAuthoringAggregate
  } catch (error) {
    if (error instanceof ServiceError) throw error
    throw invalidAuthoringResponse()
  }
}

/** 校验创作转换结果，防止前端接纳不完整的候选图。 */
export function decodeWorkflowAuthoringTransform(
  value: unknown
): WorkflowAuthoringTransformResult {
  try {
    const transform = authoringRecord(value)
    requireExactAuthoringKeys(transform, [
      'diagnostics',
      'graph',
      'normalized_python_source',
      'source_map',
      'changeset',
      'compiler_version',
      'template_catalog_fingerprint'
    ])
    if (!Array.isArray(transform.diagnostics)) throw invalidAuthoringResponse()
    for (const diagnostic of transform.diagnostics) {
      decodeAuthoringDiagnostic(diagnostic)
    }
    if (transform.graph !== null) decodeWorkflowAuthoringGraph(transform.graph)
    if (
      transform.normalized_python_source !== null &&
      typeof transform.normalized_python_source !== 'string'
    ) throw invalidAuthoringResponse()
    if (!Array.isArray(transform.source_map)) throw invalidAuthoringResponse()
    for (const entry of transform.source_map) decodeAuthoringSourceMap(entry)
    if (transform.changeset !== null) authoringRecord(transform.changeset)
    if (
      typeof transform.compiler_version !== 'string' ||
      !transform.compiler_version
    ) throw invalidAuthoringResponse()
    if (
      typeof transform.template_catalog_fingerprint !== 'string' ||
      !/^sha256:[0-9a-f]{64}$/.test(
        transform.template_catalog_fingerprint
      )
    ) throw invalidAuthoringResponse()
    return transform as unknown as WorkflowAuthoringTransformResult
  } catch (error) {
    if (error instanceof ServiceError) throw error
    throw invalidAuthoringResponse()
  }
}

/** 校验单条工作流创作诊断。 */
function decodeAuthoringDiagnostic(value: unknown): void {
  const diagnostic = authoringRecord(value)
  requireAllowedAuthoringKeys(
    diagnostic,
    ['severity', 'code', 'message'],
    ['node_id', 'path', 'workflow_handle_template_uuid', 'source_range']
  )
  if (
    (diagnostic.severity !== 'error' && diagnostic.severity !== 'warning') ||
    typeof diagnostic.code !== 'string' ||
    typeof diagnostic.message !== 'string'
  ) throw invalidAuthoringResponse()
  for (const key of [
    'node_id',
    'path',
    'workflow_handle_template_uuid'
  ]) {
    if (diagnostic[key] !== undefined && typeof diagnostic[key] !== 'string') {
      throw invalidAuthoringResponse()
    }
  }
  if (diagnostic.source_range !== undefined) {
    const range = authoringRecord(diagnostic.source_range)
    requireExactAuthoringKeys(range, [
      'start_line',
      'start_column',
      'end_line',
      'end_column'
    ])
    for (const key of [
      'start_line',
      'start_column',
      'end_line',
      'end_column'
    ]) {
      if (!Number.isInteger(range[key])) throw invalidAuthoringResponse()
    }
  }
}

/** 校验一条源代码映射。 */
function decodeAuthoringSourceMap(value: unknown): void {
  const entry = authoringRecord(value)
  requireExactAuthoringKeys(entry, [
    'workflow_node_uuid',
    'start_line',
    'start_column',
    'end_line',
    'end_column'
  ])
  if (typeof entry.workflow_node_uuid !== 'string') {
    throw invalidAuthoringResponse()
  }
  for (const key of [
    'start_line',
    'start_column',
    'end_line',
    'end_column'
  ]) {
    if (!Number.isInteger(entry[key])) throw invalidAuthoringResponse()
  }
}

/** 校验工作流创作图及其输入输出合同。 */
function decodeWorkflowAuthoringGraph(value: unknown): void {
  const graph = authoringRecord(value)
  for (const key of ['nodes', 'edges', 'node_templates', 'handle_templates']) {
    if (!Array.isArray(graph[key])) throw invalidAuthoringResponse()
  }
  const workflow = authoringRecord(graph.workflow)
  if (workflow.meta_data === undefined) return
  const metaData = authoringRecord(workflow.meta_data)
  if (metaData.unilab === undefined) return
  const unilab = authoringRecord(metaData.unilab)
  const ioKeys = ['input_contract', 'output_contract', 'output_bindings']
  if (!ioKeys.some((key) => Object.hasOwn(unilab, key))) return
  decodeWorkflowIoMetadata(unilab)
}

/** 要求对象精确包含给定字段。 */
function requireExactAuthoringKeys(
  value: Record<string, unknown>,
  keys: string[]
): void {
  if (
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(value, key))
  ) throw invalidAuthoringResponse()
}

/** 要求对象包含必填字段且不出现未声明字段。 */
function requireAllowedAuthoringKeys(
  value: Record<string, unknown>,
  required: string[],
  optional: string[]
): void {
  const allowed = new Set([...required, ...optional])
  if (
    required.some((key) => !Object.hasOwn(value, key)) ||
    Object.keys(value).some((key) => !allowed.has(key))
  ) throw invalidAuthoringResponse()
}

/** 将未知值收窄为创作接口对象。 */
function authoringRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw invalidAuthoringResponse()
  }
  return value as Record<string, unknown>
}

/** 构造统一、不可重试的创作响应错误。 */
function invalidAuthoringResponse(): ServiceError {
  return new ServiceError({
    code: 'INVALID_API_RESPONSE',
    message: 'Authoring 服务返回了无效响应',
    retryable: false
  })
}
