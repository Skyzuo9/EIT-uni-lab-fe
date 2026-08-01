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

export interface WorkflowRunEvent {
  seq: number
  runId: string
  type: string
  nodeId: string | null
  timestamp: number
  payload: Record<string, unknown>
}

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
  createRun: (request: WorkflowRunRequest) => Promise<WorkflowRun>
  getRun: (runId: string) => Promise<WorkflowRun>
  listRunNodes: (runId: string) => Promise<WorkflowRunNode[]>
  listRunEvents: (
    runId: string,
    afterSeq?: number
  ) => Promise<{ events: WorkflowRunEvent[]; nextSeq: number }>
  command: (
    runId: string,
    command: WorkflowDebugCommand,
    payload?: Record<string, unknown>
  ) => Promise<WorkflowRun>
  cancelRun: (runId: string) => Promise<WorkflowRun>
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

function invalidAuthoringResponse(): ServiceError {
  return new ServiceError({
    code: 'INVALID_API_RESPONSE',
    message: 'Authoring 服务返回了无效响应',
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
  if (data.length === 0) return null
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

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}
