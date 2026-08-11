/**
 * 工作流任务（WorkflowTask）及其作业、命令与事件的稳定传输合同。
 *
 * 类型只复刻服务端事实；前端不得用这些接口建立第二套运行权威。
 */

export type WorkflowTaskStatus =
  | 'pending'
  | 'admission_blocked'
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

export type WorkflowTaskRuntimeEventKind =
  | 'task_transition'
  | 'job_transition'
  | 'command_consumed'
  | 'feedback_committed'
  | 'uncertainty_opened'
  | 'uncertainty_resolved'
  | 'startup_recovered'

export interface WorkflowTaskRuntimeEvent {
  sequence: number
  workflow_task_uuid: string
  workflow_node_job_uuid?: string
  workflow_task_command_uuid?: string
  workflow_node_uuid?: string
  kind: WorkflowTaskRuntimeEventKind
  from_status?: string
  to_status?: string
  data: Record<string, unknown>
  create_time: string
  executor_kind?: string
  attempt?: number
  param?: Record<string, unknown>
  return_info?: Record<string, unknown>
  error_info?: unknown[]
  feedback_type?: string
  feedback?: Record<string, unknown>
  command_type?: string
  command_result?: Record<string, unknown>
}

export interface WorkflowRuntimeChangedEvent {
  id: string
  event: 'workflow.runtime.changed'
  data: {
    workflow_task_uuid: string
  }
}

export interface DeviceActionTaskChangedEvent {
  id: string
  event: 'device_action_task.changed'
  data: {
    task_uuid: string
  }
}

export interface DeviceCatalogChangedEvent {
  id: string
  event: 'device.catalog.changed'
  data: {
    catalog_revision: number
  }
}

export type WorkflowRuntimeInvalidationEvent =
  | WorkflowRuntimeChangedEvent
  | DeviceActionTaskChangedEvent
  | DeviceCatalogChangedEvent

export interface WorkflowRuntimeSubscriptionOptions {
  lastEventId?: string
  onOpen?: (state: {
    lastEventId: string
    reconnected: boolean
  }) => void
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

export interface WorkflowEventSubscription {
  dispose: () => void
}
