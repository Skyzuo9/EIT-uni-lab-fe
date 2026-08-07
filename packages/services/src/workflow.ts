import type { MaterialGraphPort } from '@unilab/material'

import type { BackendConfig } from './backends'
import { ServiceError } from './errors'
import type { HttpClient } from './http'
import type { HttpRequestTraceReporter } from './http'
import {
  loadWorkflowActionCatalog
} from './workflowActionCatalog'
import {
  decodeWorkflowAuthoringAggregate,
  decodeWorkflowAuthoringTransform,
  strictAuthoringData
} from './workflowAuthoringCodec'
import type {
  WorkflowAuthoringChangedEvent
} from './workflowAuthoringContracts'
import {
  parseAuthoringChangedData,
  parseDeviceActionTaskChangedData,
  parseDeviceCatalogChangedData,
  parseRuntimeChangedData
} from './workflowEventCodec'
import {
  loadWorkflowMaterialSourceCatalog
} from './workflowMaterialSource'
import {
  workflowEventsUrl,
  workflowListPath,
  workflowNodeJobFeedbackPath,
  workflowTaskListPath,
  workflowTaskRuntimeEventsPath
} from './workflowPaths'
import type { WorkflowRuntimePort } from './workflowPort'
import { strictRuntimeData } from './workflowRuntimeCodec'
import {
  createWorkflowSseTransport,
  createWorkflowSseSubscription,
  type WorkflowSseFrame,
  type WorkflowSseTransport
} from './workflowSse'
import type {
  WorkflowEventSubscription,
  WorkflowRuntimeInvalidationEvent,
  WorkflowRuntimeSubscriptionOptions
} from './workflowTaskContracts'

export type {
  WorkflowActionCatalogSnapshot,
  WorkflowActionEditorControl,
  WorkflowActionHandleTemplate,
  WorkflowActionNodeTemplate,
  WorkflowExecutableCatalogSnapshot,
  WorkflowPublishedNodeTemplate,
  WorkflowPublishedSource
} from './workflowActionCatalog'
export type {
  WorkflowAppliedSource,
  WorkflowAuthoringAggregate,
  WorkflowAuthoringApplyRequest,
  WorkflowAuthoringApplyResponse,
  WorkflowAuthoringApplyResult,
  WorkflowAuthoringCandidate,
  WorkflowAuthoringChangedEvent,
  WorkflowAuthoringDiagnostic,
  WorkflowAuthoringDiagnosticSourceRange,
  WorkflowAuthoringDraft,
  WorkflowAuthoringDraftWriteRequest,
  WorkflowAuthoringGeneratePythonRequest,
  WorkflowAuthoringGraph,
  WorkflowAuthoringResult,
  WorkflowAuthoringSourceMapEntry,
  WorkflowAuthoringState,
  WorkflowAuthoringSubscriptionOptions,
  WorkflowAuthoringTransformResult,
  WorkflowAuthoringValidateRequest,
  WorkflowDocument,
  WorkflowListQuery,
  WorkflowPage,
  WorkflowPersistentAuthoringCandidate,
  WorkflowRevision,
  WorkflowSummary,
  WorkflowValidationIssue,
  WorkflowValidationResult
} from './workflowAuthoringContracts'
export type {
  WorkflowInputContract,
  WorkflowInputDescriptor,
  WorkflowIoMetadata,
  WorkflowOutputBinding,
  WorkflowOutputContract,
  WorkflowOutputDescriptor,
  WorkflowValueSchema
} from './workflowIo'
export type {
  WorkflowMaterialSourceCatalogSnapshot,
  WorkflowMaterialSourceHandleTemplate,
  WorkflowMaterialSourceMaterial,
  WorkflowMaterialSourceNodeTemplate,
  WorkflowMaterialSourceResourceTemplate,
  WorkflowMaterialSourceSite
} from './workflowMaterialSource'
export type { WorkflowRuntimePort } from './workflowPort'
export type {
  DeviceActionTaskChangedEvent,
  DeviceCatalogChangedEvent,
  WorkflowEventSubscription,
  WorkflowNodeJob,
  WorkflowNodeJobFeedback,
  WorkflowNodeJobFeedbackPage,
  WorkflowNodeJobFeedbackQuery,
  WorkflowNodeJobStatus,
  WorkflowRuntimeChangedEvent,
  WorkflowRuntimeInvalidationEvent,
  WorkflowRuntimeSubscriptionOptions,
  WorkflowTask,
  WorkflowTaskCleanupStatus,
  WorkflowTaskCommand,
  WorkflowTaskCommandRequest,
  WorkflowTaskCommandType,
  WorkflowTaskControlStatus,
  WorkflowTaskCreateRequest,
  WorkflowTaskListQuery,
  WorkflowTaskPage,
  WorkflowTaskRunMode,
  WorkflowTaskRuntimeEvent,
  WorkflowTaskRuntimeEventKind,
  WorkflowTaskRuntimeEventPage,
  WorkflowTaskRuntimeEventQuery,
  WorkflowTaskStatus
} from './workflowTaskContracts'

/** 工作流运行时（Workflow Runtime）从组合根接收的公开服务依赖。 */
export interface WorkflowRuntimeDependencies {
  /** 公共物料图端口是工作流物料来源（MaterialSource）目录唯一允许使用的物料读边界。 */
  materialGraph?: Pick<MaterialGraphPort, 'getGraph'>
  traceRequest?: HttpRequestTraceReporter
}

/**
 * 创建唯一工作流服务适配器，组合 HTTP 请求、严格解码与事件失效通知。
 *
 * @param http 绑定当前服务配置的 HTTP 客户端。
 * @param backend 当前后端配置，用于推导事件流地址。
 * @param dependencies 可选公开服务依赖；物料来源目录需要公共物料图端口。
 * @returns 不持有领域权威状态的工作流运行端口（WorkflowRuntimePort）。
 * @throws 调用物料来源目录但未注入公共物料图端口时关闭失败。
 */
export function createWorkflowRuntime(
  http: HttpClient,
  backend: BackendConfig,
  dependencies: WorkflowRuntimeDependencies = {}
): WorkflowRuntimePort {
  const subscriptions = new Set<WorkflowEventSubscription>()
  const sseTransport = createWorkflowSseTransport(
    workflowEventsUrl(backend),
    backend.serverKind === 'edge' ? dependencies.traceRequest : undefined
  )

  /**
   * 通过组合根注入的公共物料图端口加载工作流物料来源（MaterialSource）目录。
   *
   * @returns 框架模板与公共物料（Material）/库位（Site）事实的目录快照。
   * @throws 公共物料图端口缺失时抛出不可重试错误，不回退私有库存接口。
   */
  async function getWorkflowMaterialSourceCatalog(): ReturnType<
    WorkflowRuntimePort['getWorkflowMaterialSourceCatalog']
  > {
    const materialGraph = dependencies.materialGraph
    if (!materialGraph) {
      throw new ServiceError({
        code: 'WORKFLOW_MATERIAL_GRAPH_PORT_REQUIRED',
        message: '物料来源（MaterialSource）目录缺少公共物料图（MaterialGraph）端口',
        retryable: false
      })
    }
    return await loadWorkflowMaterialSourceCatalog(http, materialGraph)
  }

  /** 解包兼容旧图接口的普通响应。 */
  const request = async <Value>(
    path: string,
    init?: RequestInit
  ): Promise<Value> => unwrap<Value>(await http.request<unknown>(path, init))

  /** 严格读取工作流创作（Workflow Authoring）接口。 */
  const authoringRequest = async <Value>(
    path: string,
    init?: RequestInit
  ): Promise<Value> => strictAuthoringData<Value>(
    await http.request<unknown>(path, init)
  )

  /** 严格读取工作流运行（Workflow Runtime）接口。 */
  const runtimeRequest = async <Value>(
    path: string,
    init?: RequestInit
  ): Promise<Value> => strictRuntimeData<Value>(
    await http.request<unknown>(path, init)
  )

  const port: WorkflowRuntimePort = {
    getWorkflowActionCatalog: (signal) =>
      loadWorkflowActionCatalog(http, signal),
    getWorkflowMaterialSourceCatalog,
    listWorkflows: (query = {}) =>
      runtimeRequest(workflowListPath(query)),
    getWorkflowAuthoring: async (workflowUuid) =>
      decodeWorkflowAuthoringAggregate(await authoringRequest(
        `/api/v1/workflows/${encodeURIComponent(workflowUuid)}/authoring`
      )),
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
    ) => createWorkflowSseSubscription({
      transport: sseTransport,
      lastEventId: options.lastEventId,
      connectionErrorLabel: 'Authoring SSE 连接失败',
      subscriptions,
      onOpen: options.onOpen,
      onError: options.onError,
      acceptFrame: (frame) => frame.event === 'workflow.authoring.changed',
      parseFrame: (frame) => parseAuthoringFrame(frame, workflowUuid),
      onEvent: onInvalidate
    }),
    generateWorkflowAuthoringPython: async (body) =>
      decodeWorkflowAuthoringTransform(await authoringRequest(
        '/api/v1/authoring/generate-python', {
          method: 'POST',
          headers: jsonHeaders(),
          body: JSON.stringify(body)
        }
      )),
    validateWorkflowAuthoring: async (body) =>
      decodeWorkflowAuthoringTransform(await authoringRequest(
        '/api/v1/authoring/validate', {
          method: 'POST',
          headers: jsonHeaders(),
          body: JSON.stringify(body)
        }
      )),
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
    listWorkflowTaskEvents: (taskUuid, query = {}) =>
      runtimeRequest(workflowTaskRuntimeEventsPath(taskUuid, query)),
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
    subscribeWorkflowRuntime: (onInvalidate, options = {}) =>
      subscribeWorkflowRuntime(
        sseTransport,
        subscriptions,
        onInvalidate,
        options
      ),
    dispose: () => {
      for (const subscription of [...subscriptions]) subscription.dispose()
    }
  }
  return port
}

/** 建立工作流运行（Workflow Runtime）失效事件订阅。 */
function subscribeWorkflowRuntime(
  sseTransport: WorkflowSseTransport,
  subscriptions: Set<WorkflowEventSubscription>,
  onInvalidate: (event: WorkflowRuntimeInvalidationEvent) => void,
  options: WorkflowRuntimeSubscriptionOptions
): WorkflowEventSubscription {
  return createWorkflowSseSubscription({
    transport: sseTransport,
    lastEventId: options.lastEventId,
    connectionErrorLabel: 'Workflow Runtime SSE 连接失败',
    disconnectedMessage: 'Workflow Runtime SSE 连接已断开，正在重连',
    subscriptions,
    onOpen: options.onOpen,
    onError: options.onError,
    acceptFrame: isRuntimeFrame,
    dedupeBeforeParse: true,
    parseFrame: (frame) => parseRuntimeFrame(frame, options),
    onEvent: onInvalidate
  })
}

/** 将创作事件帧过滤并解码为当前工作流的失效事件。 */
function parseAuthoringFrame(
  frame: WorkflowSseFrame,
  workflowUuid: string
): WorkflowAuthoringChangedEvent | null {
  if (frame.event !== 'workflow.authoring.changed') return null
  const data = parseAuthoringChangedData(frame.data)
  if (!data || data.workflow_uuid !== workflowUuid) return null
  return {
    id: frame.id,
    event: 'workflow.authoring.changed',
    data
  }
}

/** 将受支持的运行事件帧严格解码为失效通知。 */
function parseRuntimeFrame(
  frame: WorkflowSseFrame,
  options: WorkflowRuntimeSubscriptionOptions
): WorkflowRuntimeInvalidationEvent | null {
  if (
    frame.event !== 'workflow.runtime.changed' &&
    frame.event !== 'device_action_task.changed' &&
    frame.event !== 'device.catalog.changed'
  ) return null
  const data = frame.event === 'workflow.runtime.changed'
    ? parseRuntimeChangedData(frame.data)
    : frame.event === 'device_action_task.changed'
      ? parseDeviceActionTaskChangedData(frame.data)
      : parseDeviceCatalogChangedData(frame.data)
  if (!data) {
    options.onError?.(new Error('Workflow Runtime SSE 返回了无效事件'))
    return null
  }
  return {
    id: frame.id,
    event: frame.event,
    data
  } as WorkflowRuntimeInvalidationEvent
}

/** 判断事件帧是否属于前端需要失效的工作流运行事件。 */
function isRuntimeFrame(frame: WorkflowSseFrame): boolean {
  return frame.event === 'workflow.runtime.changed' ||
    frame.event === 'device_action_task.changed' ||
    frame.event === 'device.catalog.changed'
}

/** 解包兼容接口中可选的 data envelope。 */
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

/** 返回 JSON 请求头，统一所有写操作。 */
function jsonHeaders(): HeadersInit {
  return { 'Content-Type': 'application/json' }
}
