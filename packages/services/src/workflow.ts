import type { BackendConfig } from './backends'
import type { HttpClient } from './http'

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

export interface WorkflowAuthoringDiagnostic {
  severity: 'error' | 'warning'
  code: string
  message: string
  node_id?: string
  start_line?: number
  start_column?: number
  end_line?: number
  end_column?: number
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

  const port: WorkflowRuntimePort = {
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

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}
