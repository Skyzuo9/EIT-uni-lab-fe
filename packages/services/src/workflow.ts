import type { BackendConfig } from './backends'
import type { HttpClient } from './http'
import { ServiceError } from './errors'

export type WorkflowRevision = Record<string, unknown> & {
  schema_version: '2'
  revision_id: string
  workflow_id: string
  invocations: Array<Record<string, unknown> & {
    node_id: string
    action_ref: string
    node_type?: string
    name?: string
  }>
  control_edges: Array<Record<string, unknown> & {
    source: string
    target: string
    branch?: string | null
  }>
  layout?: Record<string, unknown>
}

export interface WorkflowDocument {
  definition: {
    id: string
    name: string
  }
  revision: {
    id: string
    contentHash: string
    canonical: WorkflowRevision
    nodes: Array<Record<string, unknown>>
    edges: Array<Record<string, unknown>>
  }
}

export interface WorkflowValidationIssue {
  code: string
  message: string
  severity: 'error' | 'warning'
}

export interface WorkflowValidationResult {
  valid: boolean
  issues: WorkflowValidationIssue[]
  workflowRevisionHash?: string
  nodeCount?: number
  edgeCount?: number
}

export interface WorkflowAuthoringDiagnosticSourceRange {
  start_line: number
  start_column: number
  end_line: number
  end_column: number
}

export interface WorkflowAuthoringDiagnostic {
  severity: 'error' | 'warning'
  code: string
  message: string
  node_id?: string
  source_range?: WorkflowAuthoringDiagnosticSourceRange
}

export type WorkflowAuthoringCandidate = Record<string, unknown> & {
  revision_id: string
  parent_revision_id: string
  canonical_ir: WorkflowRevision
  python_source: string
  source_map?: Array<{
    node_id: string
    start_line: number
    start_column?: number
    end_line?: number
    end_column?: number
  }>
  diagnostics: WorkflowAuthoringDiagnostic[]
}

export interface WorkflowAuthoringResult {
  base_revision_id: string
  candidate: WorkflowAuthoringCandidate | null
  diagnostics: WorkflowAuthoringDiagnostic[]
}

export type WorkflowAuthoringState =
  | 'draft_missing'
  | 'compiling'
  | 'draft_invalid'
  | 'candidate_stale'
  | 'unapplied_source_only'
  | 'unapplied_graph'
  | 'applied'
  | 'applied_source_stale'

export interface WorkflowAuthoringSourceMapEntry {
  workflow_node_uuid: string
  start_line: number
  start_column: number
  end_line: number
  end_column: number
}

export interface WorkflowAuthoringGraph {
  workflow: Record<string, unknown>
  nodes: Array<Record<string, unknown>>
  edges: Array<Record<string, unknown>>
  node_templates: Array<Record<string, unknown>>
  handle_templates: Array<Record<string, unknown>>
}

export interface WorkflowAuthoringDraft {
  source_uri: string
  python_source: string
  draft_hash: string
  update_time: string
  diagnostics: WorkflowAuthoringDiagnostic[]
}

export interface WorkflowPersistentAuthoringCandidate {
  candidate_hash: string
  draft_hash: string
  base_workflow_revision: number
  graph: WorkflowAuthoringGraph
  normalized_python_source: string
  source_map: WorkflowAuthoringSourceMapEntry[]
  diagnostics: WorkflowAuthoringDiagnostic[]
  changeset: Record<string, unknown>
  compiler_version: string
  template_catalog_fingerprint: string
}

export interface WorkflowAppliedSource {
  python_source: string
  source_hash: string
  source_map: WorkflowAuthoringSourceMapEntry[]
  workflow_revision: number
  compiler_version: string
  template_catalog_fingerprint: string
  update_time: string
}

export interface WorkflowAuthoringAggregate {
  workflow_uuid: string
  workflow_revision: number
  state: WorkflowAuthoringState
  applied_graph: WorkflowAuthoringGraph
  draft: WorkflowAuthoringDraft | null
  candidate: WorkflowPersistentAuthoringCandidate | null
  applied_source: WorkflowAppliedSource | null
}

export interface WorkflowAuthoringDraftWriteRequest {
  python_source: string
  expected_draft_hash: string | null
  expected_workflow_revision: number
}

export interface WorkflowAuthoringApplyRequest {
  candidate_hash: string
}

export interface WorkflowAuthoringApplyResult {
  kind: 'graph' | 'source_only'
  previous_workflow_revision: number
  workflow_revision: number
  applied_candidate_hash: string
  applied_source_hash: string
  warnings: unknown[]
}

export interface WorkflowAuthoringApplyResponse {
  apply_result: WorkflowAuthoringApplyResult
  authoring: WorkflowAuthoringAggregate
}

export interface WorkflowAuthoringTransformResult {
  diagnostics: WorkflowAuthoringDiagnostic[]
  graph: WorkflowAuthoringGraph | null
  normalized_python_source: string | null
  source_map: WorkflowAuthoringSourceMapEntry[]
  changeset: Record<string, unknown> | null
  compiler_version: string
  template_catalog_fingerprint: string
}

export interface WorkflowAuthoringGeneratePythonRequest {
  workflow_uuid: string
  revision: number
  source_uri: string
  graph: WorkflowAuthoringGraph
}

export interface WorkflowAuthoringChangedEvent {
  id: string
  event: 'workflow.authoring.changed'
  data: {
    workflow_uuid: string
    cause: string
    workflow_revision: number
    draft_hash: string | null
    candidate_hash: string | null
  }
}

export interface WorkflowAuthoringSubscriptionOptions {
  lastEventId?: string
  onError?: (error: Error) => void
}

export type WorkflowTaskStatus =
  | 'pending'
  | 'running'
  | 'canceling'
  | 'succeeded'
  | 'failed'
  | 'canceled'
  | 'timeout'

export type WorkflowTaskRunMode = 'normal' | 'step' | 'single_node'

export type WorkflowTaskControlStatus =
  | 'active'
  | 'paused'
  | 'waiting_reconciliation'

export type WorkflowTaskCleanupStatus =
  | 'none'
  | 'pending'
  | 'canceling'
  | 'settled'
  | 'requires_attention'

export interface WorkflowTaskCreateRequest {
  workflow_uuid: string
  run_mode?: WorkflowTaskRunMode
  target_node_uuid?: string | null
  input?: Record<string, unknown>
  description?: string | null
  meta_data?: Record<string, unknown>
}

export interface WorkflowTaskListQuery {
  page?: number
  page_size?: number
  workflow_uuid?: string
  status?: WorkflowTaskStatus
  cleanup_status?: WorkflowTaskCleanupStatus
}

export interface WorkflowTask {
  uuid: string
  create_time: string
  update_time: string
  description?: string
  meta_data: Record<string, unknown>
  workflow_uuid: string
  status: WorkflowTaskStatus
  workflow_snapshot: Record<string, unknown>
  execution_plan: Record<string, unknown>
  run_mode: WorkflowTaskRunMode
  target_node_uuid?: string
  control_status: WorkflowTaskControlStatus
  cleanup_status: WorkflowTaskCleanupStatus
  trace_context: Record<string, unknown>
  input: Record<string, unknown>
  output: Record<string, unknown>
  error_info: unknown[]
  timeout_at?: string
  attention_reason?: string
  terminal_ghost_detected_at?: string
  reconciliation_resume_control_status?: 'active' | 'paused'
  started_at?: string
  finished_at?: string
}

export interface WorkflowTaskPage {
  items: WorkflowTask[]
  total: number
  page: number
  page_size: number
}

export type WorkflowNodeJobStatus =
  | 'pending'
  | 'dispatched'
  | 'running'
  | 'intervention_required'
  | 'cancel_requested'
  | 'execution_unknown'
  | 'succeeded'
  | 'failed'
  | 'skipped'
  | 'canceled'
  | 'timeout'

export interface WorkflowNodeJob {
  uuid: string
  create_time: string
  update_time: string
  description?: string
  meta_data: Record<string, unknown>
  workflow_task_uuid: string
  workflow_node_uuid: string
  material_uuid?: string
  edge_uuid?: string
  edge_command_uuid?: string
  feedback_sequence: number
  topological_index: number
  executor_kind: string
  execution_policy: Record<string, unknown>
  execution_timeout_seconds: number
  status: WorkflowNodeJobStatus
  attempt: number
  param: Record<string, unknown>
  feedback_data: Record<string, unknown>
  return_info: Record<string, unknown>
  control_data: Record<string, unknown>
  error_info: unknown[]
  dispatch_deadline_at?: string
  execution_deadline_at?: string
  cancel_command_uuid?: string
  cancel_ack_deadline_at?: string
  cancel_complete_deadline_at?: string
  uncertainty_reason?: string
  started_at?: string
  finished_at?: string
}

export interface WorkflowNodeJobFeedback {
  uuid: string
  create_time: string
  update_time: string
  description?: string
  meta_data: Record<string, unknown>
  workflow_node_job_uuid: string
  sequence: number
  feedback_type: string
  data: Record<string, unknown>
  observed_at: string
  received_at: string
  published_at?: string
  idempotency_key: string
}

export interface WorkflowNodeJobFeedbackQuery {
  after_sequence?: number
  limit?: number
}

export interface WorkflowNodeJobFeedbackPage {
  items: WorkflowNodeJobFeedback[]
  next_cursor: number
  has_more: boolean
}

export interface WorkflowRuntimeChangedEvent {
  id: string
  event: 'workflow.runtime.changed'
  data: {
    workflow_task_uuid: string
  }
}

export interface WorkflowRuntimeSubscriptionOptions {
  lastEventId?: string
  onError?: (error: Error) => void
}

export type WorkflowTaskCommandType = 'step' | 'pause' | 'resume' | 'cancel'

export interface WorkflowTaskCommandRequest {
  type: WorkflowTaskCommandType
  target_node_uuid?: string | null
  idempotency_key: string
  description?: string | null
  meta_data?: Record<string, unknown>
}

export interface WorkflowTaskCommand {
  uuid: string
  create_time: string
  update_time: string
  description?: string
  meta_data: Record<string, unknown>
  workflow_task_uuid: string
  type: WorkflowTaskCommandType
  target_node_uuid?: string
  idempotency_key: string
  status: 'pending' | 'succeeded' | 'rejected'
  result: Record<string, unknown>
  trace_context: Record<string, unknown>
  consumed_at?: string
}

export interface WorkflowDebugProjection {
  enabled: boolean
  status:
    | 'disabled'
    | 'pending'
    | 'running'
    | 'pause_pending'
    | 'paused'
    | 'stepping'
    | 'completed'
    | 'failed'
    | 'cancelled'
    | 'terminated'
  breakpoints?: string[]
  startNodeId?: string | null
  pausedBeforeNodeId?: string | null
  runToNodeId?: string | null
  stopReason?: 'terminate' | 'emergency_stop' | null
  stateVersion?: number
  semantics?: string
}

/** @deprecated UI1 Runtime 不得使用 Run identity；待旧 panel 调用方移除后删除。 */
export interface WorkflowRun {
  id: string
  status:
    | 'pending'
    | 'running'
    | 'completed'
    | 'failed'
    | 'cancelled'
    | 'cancel_requested'
    | 'reconciling'
    | 'dispatch_unknown'
  workflowRevisionHash?: string
  debug?: WorkflowDebugProjection
}

/** @deprecated UI1 Runtime 必须读取 WorkflowNodeJob 权威投影。 */
export interface WorkflowRunNode {
  nodeId: string
  sourceNodeId: string
  nodeType: string
  deviceId: string
  action: string
  state: string
  result: Record<string, unknown>
  attempt: number
}

/** @deprecated UI1 Runtime 只使用全局 SSE invalidation 后的 REST 补读。 */
export interface WorkflowRunEvent {
  seq: number
  runId: string
  type: string
  nodeId: string | null
  timestamp: number
  payload: Record<string, unknown>
}

/** @deprecated 共享 command 只有 step/pause/resume/cancel。 */
export type WorkflowDebugCommand =
  | 'set_breakpoints'
  | 'pause'
  | 'continue'
  | 'step'
  | 'step_over'
  | 'step_into'
  | 'run_to'
  | 'terminate'
  | 'emergency_stop'

export interface WorkflowRunRequest {
  source: {
    format: 'workflow_revision_v2'
    revision: WorkflowRevision
  }
  parameters?: Record<string, unknown>
  client_request_id?: string
  debug?: {
    pause_on_start?: boolean
    breakpoints?: string[]
    start_node_id?: string
  }
}

export interface WorkflowEventSubscription {
  dispose: () => void
}

export interface WorkflowRuntimePort {
  getWorkflowAuthoring: (
    workflowUuid: string
  ) => Promise<WorkflowAuthoringAggregate>
  saveWorkflowAuthoringDraft: (
    workflowUuid: string,
    request: WorkflowAuthoringDraftWriteRequest
  ) => Promise<WorkflowAuthoringAggregate>
  applyWorkflowAuthoring: (
    workflowUuid: string,
    request: WorkflowAuthoringApplyRequest
  ) => Promise<WorkflowAuthoringApplyResponse>
  subscribeWorkflowAuthoring: (
    workflowUuid: string,
    onInvalidate: (event: WorkflowAuthoringChangedEvent) => void,
    options?: WorkflowAuthoringSubscriptionOptions
  ) => WorkflowEventSubscription
  generateWorkflowAuthoringPython: (
    request: WorkflowAuthoringGeneratePythonRequest
  ) => Promise<WorkflowAuthoringTransformResult>
  getWorkflow: (workflowId: string) => Promise<WorkflowDocument>
  saveWorkflow: (
    workflowId: string,
    revision: WorkflowRevision,
    expectedRevisionId?: string
  ) => Promise<WorkflowDocument>
  validateWorkflow: (
    revision: WorkflowRevision,
    parameters?: Record<string, unknown>
  ) => Promise<WorkflowValidationResult>
  compilePythonWorkflow: (
    baseRevisionId: string,
    pythonSource: string,
    sourceUri: string
  ) => Promise<WorkflowAuthoringResult>
  generatePythonWorkflow: (
    baseRevisionId: string,
    revision: WorkflowRevision,
    sourceUri: string
  ) => Promise<WorkflowAuthoringResult>
  validateAuthoringCandidate: (
    baseRevisionId: string,
    candidate: WorkflowAuthoringCandidate
  ) => Promise<WorkflowAuthoringResult>
  createWorkflowTask: (
    request: WorkflowTaskCreateRequest
  ) => Promise<WorkflowTask>
  listWorkflowTasks: (
    query?: WorkflowTaskListQuery
  ) => Promise<WorkflowTaskPage>
  getWorkflowTask: (taskUuid: string) => Promise<WorkflowTask>
  listWorkflowTaskJobs: (
    taskUuid: string
  ) => Promise<WorkflowNodeJob[]>
  commandWorkflowTask: (
    taskUuid: string,
    request: WorkflowTaskCommandRequest
  ) => Promise<WorkflowTaskCommand>
  getWorkflowNodeJob: (jobUuid: string) => Promise<WorkflowNodeJob>
  listWorkflowNodeJobFeedback: (
    jobUuid: string,
    query?: WorkflowNodeJobFeedbackQuery
  ) => Promise<WorkflowNodeJobFeedbackPage>
  subscribeWorkflowRuntime: (
    onInvalidate: (event: WorkflowRuntimeChangedEvent) => void,
    options?: WorkflowRuntimeSubscriptionOptions
  ) => WorkflowEventSubscription
  /** @deprecated UI1 Runtime 使用 createWorkflowTask。 */
  createRun: (request: WorkflowRunRequest) => Promise<WorkflowRun>
  /** @deprecated UI1 Runtime 使用 getWorkflowTask。 */
  getRun: (runId: string) => Promise<WorkflowRun>
  /** @deprecated UI1 Runtime 使用 listWorkflowTaskJobs。 */
  listRunNodes: (runId: string) => Promise<WorkflowRunNode[]>
  /** @deprecated 不得使用 Task-scoped event page。 */
  listRunEvents: (
    runId: string,
    afterSeq?: number
  ) => Promise<{ events: WorkflowRunEvent[]; nextSeq: number }>
  /** @deprecated UI1 Runtime 使用 commandWorkflowTask。 */
  command: (
    runId: string,
    command: WorkflowDebugCommand,
    payload?: Record<string, unknown>
  ) => Promise<WorkflowRun>
  /** @deprecated cancel 是 WorkflowTask command。 */
  cancelRun: (runId: string) => Promise<WorkflowRun>
  /** @deprecated UI1 Runtime 只订阅全局 SSE。 */
  subscribeRunEvents: (
    runId: string,
    onEvent: (event: WorkflowRunEvent) => void,
    options?: {
      afterSeq?: number
      onError?: (error: Error) => void
    }
  ) => WorkflowEventSubscription
  dispose: () => void
}

export function createWorkflowRuntime(
  http: HttpClient,
  backend: BackendConfig
): WorkflowRuntimePort {
  const subscriptions = new Set<WorkflowEventSubscription>()

  const request = async <Value>(
    path: string,
    init?: RequestInit
  ): Promise<Value> => unwrap<Value>(await http.request<unknown>(path, init))

  const authoringRequest = async <Value>(
    path: string,
    init?: RequestInit
  ): Promise<Value> => strictAuthoringData<Value>(
    await http.request<unknown>(path, init)
  )

  const runtimeRequest = async <Value>(
    path: string,
    init?: RequestInit
  ): Promise<Value> => strictRuntimeData<Value>(
    await http.request<unknown>(path, init)
  )

  const port: WorkflowRuntimePort = {
    getWorkflowAuthoring: (workflowUuid) =>
      authoringRequest(
        `/api/v1/workflows/${encodeURIComponent(workflowUuid)}/authoring`
      ),
    saveWorkflowAuthoringDraft: (workflowUuid, body) =>
      authoringRequest(
        `/api/v1/workflows/${encodeURIComponent(workflowUuid)}/authoring/draft`,
        {
          method: 'PUT',
          headers: jsonHeaders(),
          body: JSON.stringify(body)
        }
      ),
    applyWorkflowAuthoring: (workflowUuid, body) =>
      authoringRequest(
        `/api/v1/workflows/${encodeURIComponent(workflowUuid)}/authoring/apply`,
        {
          method: 'POST',
          headers: jsonHeaders(),
          body: JSON.stringify({ candidate_hash: body.candidate_hash })
        }
      ),
    subscribeWorkflowAuthoring: (
      workflowUuid,
      onInvalidate,
      options = {}
    ) => {
      let disposed = false
      let controller: AbortController | null = null
      let reconnectTimer: ReturnType<typeof globalThis.setTimeout> | null = null
      let cursor = options.lastEventId || ''
      const seenEventIds = new Set<string>()

      const scheduleReconnect = (): void => {
        if (disposed || reconnectTimer !== null) return
        reconnectTimer = globalThis.setTimeout(() => {
          reconnectTimer = null
          void connect()
        }, 3000)
      }

      const connect = async (): Promise<void> => {
        if (disposed) return
        controller = new AbortController()
        const headers = new Headers({ Accept: 'text/event-stream' })
        if (cursor) headers.set('Last-Event-ID', cursor)
        try {
          const response = await globalThis.fetch(
            workflowEventsUrl(backend),
            { headers, signal: controller.signal }
          )
          if (!response.ok || !response.body) {
            throw new Error(
              `Authoring SSE 连接失败: ${response.status} ${response.statusText}`
            )
          }
          await readSseStream(response.body, (frame) => {
            if (frame.id) cursor = frame.id
            if (frame.event !== 'workflow.authoring.changed') return
            const data = parseAuthoringChangedData(frame.data)
            if (!data || data.workflow_uuid !== workflowUuid) return
            if (frame.id && seenEventIds.has(frame.id)) return
            if (frame.id) {
              seenEventIds.add(frame.id)
              if (seenEventIds.size > 512) {
                const oldest = seenEventIds.values().next().value
                if (oldest !== undefined) seenEventIds.delete(oldest)
              }
            }
            onInvalidate({
              id: frame.id,
              event: 'workflow.authoring.changed',
              data
            })
          }, controller.signal)
          scheduleReconnect()
        } catch (error) {
          if (disposed || controller.signal.aborted) return
          options.onError?.(asError(error))
          scheduleReconnect()
        }
      }

      const subscription: WorkflowEventSubscription = {
        dispose: () => {
          if (disposed) return
          disposed = true
          controller?.abort()
          if (reconnectTimer !== null) {
            globalThis.clearTimeout(reconnectTimer)
          }
          subscriptions.delete(subscription)
        }
      }
      subscriptions.add(subscription)
      void connect()
      return subscription
    },
    generateWorkflowAuthoringPython: (body) =>
      authoringRequest('/api/v1/authoring/generate-python', {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify(body)
      }),
    getWorkflow: (workflowId) =>
      request(`/api/v1/workflows/${encodeURIComponent(workflowId)}/graph`),
    saveWorkflow: (workflowId, revision, expectedRevisionId) =>
      request(`/api/v1/workflows/${encodeURIComponent(workflowId)}/graph`, {
        method: 'PUT',
        headers: jsonHeaders(),
        body: JSON.stringify({
          revision,
          ...(expectedRevisionId ? { expectedRevisionId } : {})
        })
      }),
    validateWorkflow: (revision, parameters) =>
      request('/api/v1/workflows:validate', {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({ revision, parameters })
      }),
    compilePythonWorkflow: (baseRevisionId, pythonSource, sourceUri) =>
      request('/api/v1/authoring/compile', {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({
          base_revision_id: baseRevisionId,
          python_source: pythonSource,
          source_uri: sourceUri
        })
      }),
    generatePythonWorkflow: (baseRevisionId, revision, sourceUri) =>
      request('/api/v1/authoring/generate-python', {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({
          base_revision_id: baseRevisionId,
          canonical_ir: revision,
          source_uri: sourceUri
        })
      }),
    validateAuthoringCandidate: (baseRevisionId, candidate) =>
      request('/api/v1/authoring/validate', {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({
          base_revision_id: baseRevisionId,
          candidate
        })
      }),
    createWorkflowTask: (body) =>
      runtimeRequest('/api/v1/workflow-tasks', {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify(body)
      }),
    listWorkflowTasks: (query = {}) =>
      runtimeRequest(workflowTaskListPath(query)),
    getWorkflowTask: (taskUuid) =>
      runtimeRequest(
        `/api/v1/workflow-tasks/${encodeURIComponent(taskUuid)}`
      ),
    listWorkflowTaskJobs: (taskUuid) =>
      runtimeRequest(
        `/api/v1/workflow-tasks/${encodeURIComponent(taskUuid)}/jobs`
      ),
    commandWorkflowTask: (taskUuid, body) =>
      runtimeRequest(
        `/api/v1/workflow-tasks/${encodeURIComponent(taskUuid)}/commands`,
        {
          method: 'POST',
          headers: jsonHeaders(),
          body: JSON.stringify(body)
        }
      ),
    getWorkflowNodeJob: (jobUuid) =>
      runtimeRequest(
        `/api/v1/workflow-node-jobs/${encodeURIComponent(jobUuid)}`
      ),
    listWorkflowNodeJobFeedback: (jobUuid, query = {}) =>
      runtimeRequest(workflowNodeJobFeedbackPath(jobUuid, query)),
    subscribeWorkflowRuntime: (onInvalidate, options = {}) => {
      let disposed = false
      let controller: AbortController | null = null
      let reconnectTimer: ReturnType<typeof globalThis.setTimeout> | null = null
      let cursor = options.lastEventId || ''
      const seenEventIds = new Set<string>()

      const scheduleReconnect = (): void => {
        if (disposed || reconnectTimer !== null) return
        reconnectTimer = globalThis.setTimeout(() => {
          reconnectTimer = null
          void connect()
        }, 3000)
      }

      const connect = async (): Promise<void> => {
        if (disposed) return
        controller = new AbortController()
        const headers = new Headers({ Accept: 'text/event-stream' })
        if (cursor) headers.set('Last-Event-ID', cursor)
        try {
          const response = await globalThis.fetch(
            workflowEventsUrl(backend),
            { headers, signal: controller.signal }
          )
          if (!response.ok || !response.body) {
            throw new Error(
              `Workflow Runtime SSE 连接失败: ${response.status} ${response.statusText}`
            )
          }
          await readSseStream(response.body, (frame) => {
            if (frame.id) cursor = frame.id
            if (frame.event !== 'workflow.runtime.changed') return
            if (frame.id && seenEventIds.has(frame.id)) return
            if (frame.id) {
              seenEventIds.add(frame.id)
              if (seenEventIds.size > 512) {
                const oldest = seenEventIds.values().next().value
                if (oldest !== undefined) seenEventIds.delete(oldest)
              }
            }
            const data = parseRuntimeChangedData(frame.data)
            if (!data) {
              options.onError?.(
                new Error('Workflow Runtime SSE 返回了无效事件')
              )
              return
            }
            onInvalidate({
              id: frame.id,
              event: 'workflow.runtime.changed',
              data
            })
          }, controller.signal)
          scheduleReconnect()
        } catch (error) {
          if (disposed || controller.signal.aborted) return
          options.onError?.(asError(error))
          scheduleReconnect()
        }
      }

      const subscription: WorkflowEventSubscription = {
        dispose: () => {
          if (disposed) return
          disposed = true
          controller?.abort()
          if (reconnectTimer !== null) {
            globalThis.clearTimeout(reconnectTimer)
          }
          subscriptions.delete(subscription)
        }
      }
      subscriptions.add(subscription)
      void connect()
      return subscription
    },
    createRun: (body) =>
      request('/api/v1/runtime/runs', {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify(body)
      }),
    getRun: (runId) =>
      request(`/api/v1/runtime/runs/${encodeURIComponent(runId)}`),
    listRunNodes: async (runId) => {
      const result = await request<{ items: WorkflowRunNode[] }>(
        `/api/v1/runtime/runs/${encodeURIComponent(runId)}/nodes`
      )
      return result.items
    },
    listRunEvents: (runId, afterSeq = 0) =>
      request(
        `/api/v1/runtime/runs/${encodeURIComponent(runId)}/events?after_seq=${afterSeq}`
      ),
    command: async (runId, command, payload = {}) => {
      await request(`/api/v1/runtime/runs/${encodeURIComponent(runId)}/commands`, {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({ command, payload })
      })
      return port.getRun(runId)
    },
    cancelRun: (runId) =>
      request(`/api/v1/runtime/runs/${encodeURIComponent(runId)}/cancel`, {
        method: 'POST',
        headers: jsonHeaders()
      }),
    subscribeRunEvents: (runId, onEvent, options = {}) => {
      let disposed = false
      let socket: WebSocket | null = null
      let cursor = options.afterSeq ?? 0
      let fallbackTimer: ReturnType<typeof globalThis.setTimeout> | null = null
      let pollingStarted = false

      const poll = async (): Promise<void> => {
        if (disposed) return
        try {
          const page = await port.listRunEvents(runId, cursor)
          for (const event of page.events) onEvent(event)
          cursor = page.nextSeq
        } catch (error) {
          options.onError?.(asError(error))
        } finally {
          if (!disposed) fallbackTimer = globalThis.setTimeout(poll, 500)
        }
      }

      const startPolling = (): void => {
        if (disposed || pollingStarted) return
        pollingStarted = true
        void poll()
      }

      if (typeof WebSocket === 'function') {
        try {
          socket = new WebSocket(
            runtimeEventsUrl(backend, runId, cursor)
          )
          socket.onmessage = (message) => {
            try {
              const event = JSON.parse(String(message.data)) as WorkflowRunEvent
              cursor = Math.max(cursor, event.seq)
              onEvent(event)
            } catch (error) {
              options.onError?.(asError(error))
            }
          }
          socket.onerror = () => {
            startPolling()
          }
          socket.onclose = startPolling
        } catch (error) {
          options.onError?.(asError(error))
          startPolling()
        }
      } else {
        startPolling()
      }

      const subscription: WorkflowEventSubscription = {
        dispose: () => {
          disposed = true
          socket?.close()
          if (fallbackTimer != null) globalThis.clearTimeout(fallbackTimer)
          subscriptions.delete(subscription)
        }
      }
      subscriptions.add(subscription)
      return subscription
    },
    dispose: () => {
      for (const subscription of [...subscriptions]) subscription.dispose()
    }
  }
  return port
}

function unwrap<Value>(raw: unknown): Value {
  if (
    raw &&
    typeof raw === 'object' &&
    Object.prototype.hasOwnProperty.call(raw, 'data')
  ) {
    return (raw as { data: Value }).data
  }
  return raw as Value
}

function strictAuthoringData<Value>(raw: unknown): Value {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw invalidAuthoringResponse()
  }
  const envelope = raw as Record<string, unknown>
  if (
    envelope.code !== 0 ||
    !Object.prototype.hasOwnProperty.call(envelope, 'data')
  ) {
    throw invalidAuthoringResponse()
  }
  return envelope.data as Value
}

function strictRuntimeData<Value>(raw: unknown): Value {
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

function invalidAuthoringResponse(): ServiceError {
  return new ServiceError({
    code: 'INVALID_API_RESPONSE',
    message: 'Authoring 服务返回了无效响应',
    retryable: false
  })
}

function invalidRuntimeResponse(): ServiceError {
  return new ServiceError({
    code: 'INVALID_API_RESPONSE',
    message: 'Workflow Runtime 服务返回了无效响应',
    retryable: false
  })
}

function jsonHeaders(): HeadersInit {
  return { 'Content-Type': 'application/json' }
}

function runtimeEventsUrl(
  backend: BackendConfig,
  runId: string,
  afterSeq: number
): string {
  const base = backend.realtimeUrl || backend.apiUrl
  const url = new URL(base)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = `${url.pathname.replace(/\/$/, '')}/api/v1/runtime/events`
  url.search = new URLSearchParams({
    run_id: runId,
    after_seq: String(afterSeq)
  }).toString()
  return url.toString()
}

function workflowEventsUrl(backend: BackendConfig): string {
  const url = new URL(backend.apiUrl)
  url.pathname = `${url.pathname.replace(/\/$/, '')}/api/v1/events`
  url.search = ''
  url.hash = ''
  return url.toString()
}

function workflowTaskListPath(query: WorkflowTaskListQuery): string {
  const search = new URLSearchParams()
  for (const key of [
    'page',
    'page_size',
    'workflow_uuid',
    'status',
    'cleanup_status'
  ] as const) {
    const value = query[key]
    if (value !== undefined && value !== '') search.set(key, String(value))
  }
  const suffix = search.toString()
  return `/api/v1/workflow-tasks${suffix ? `?${suffix}` : ''}`
}

function workflowNodeJobFeedbackPath(
  jobUuid: string,
  query: WorkflowNodeJobFeedbackQuery
): string {
  const search = new URLSearchParams()
  if (query.after_sequence !== undefined) {
    search.set('after_sequence', String(query.after_sequence))
  }
  if (query.limit !== undefined) search.set('limit', String(query.limit))
  const suffix = search.toString()
  const base = `/api/v1/workflow-node-jobs/${
    encodeURIComponent(jobUuid)
  }/feedback`
  return `${base}${suffix ? `?${suffix}` : ''}`
}

interface ParsedSseFrame {
  id: string
  event: string
  data: string
}

async function readSseStream(
  stream: ReadableStream<Uint8Array>,
  onFrame: (frame: ParsedSseFrame) => void,
  signal: AbortSignal
): Promise<void> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (!signal.aborted) {
      const chunk = await reader.read()
      if (chunk.done) break
      buffer += decoder.decode(chunk.value, { stream: true })
      const frames = buffer.split(/\r?\n\r?\n/)
      buffer = frames.pop() || ''
      for (const value of frames) {
        const parsed = parseSseFrame(value)
        if (parsed) onFrame(parsed)
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
}

function parseSseFrame(value: string): ParsedSseFrame | null {
  let id = ''
  let event = 'message'
  const data: string[] = []
  for (const line of value.split(/\r?\n/)) {
    if (!line || line.startsWith(':')) continue
    const separator = line.indexOf(':')
    const field = separator < 0 ? line : line.slice(0, separator)
    const raw = separator < 0 ? '' : line.slice(separator + 1)
    const fieldValue = raw.startsWith(' ') ? raw.slice(1) : raw
    if (field === 'id') id = fieldValue
    else if (field === 'event') event = fieldValue
    else if (field === 'data') data.push(fieldValue)
  }
  if (data.length === 0 && id === '') return null
  return { id, event, data: data.join('\n') }
}

function parseAuthoringChangedData(
  value: string
): WorkflowAuthoringChangedEvent['data'] | null {
  try {
    const data = JSON.parse(value) as Record<string, unknown>
    if (
      typeof data.workflow_uuid !== 'string' ||
      typeof data.cause !== 'string' ||
      typeof data.workflow_revision !== 'number' ||
      !(
        data.draft_hash === null ||
        typeof data.draft_hash === 'string'
      ) ||
      !(
        data.candidate_hash === null ||
        typeof data.candidate_hash === 'string'
      )
    ) {
      return null
    }
    return {
      workflow_uuid: data.workflow_uuid,
      cause: data.cause,
      workflow_revision: data.workflow_revision,
      draft_hash: data.draft_hash,
      candidate_hash: data.candidate_hash
    }
  } catch {
    return null
  }
}

function parseRuntimeChangedData(
  value: string
): WorkflowRuntimeChangedEvent['data'] | null {
  try {
    const data = JSON.parse(value) as Record<string, unknown>
    if (
      Object.keys(data).length !== 1 ||
      typeof data.workflow_task_uuid !== 'string' ||
      data.workflow_task_uuid.trim() === ''
    ) {
      return null
    }
    return { workflow_task_uuid: data.workflow_task_uuid }
  } catch {
    return null
  }
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}
