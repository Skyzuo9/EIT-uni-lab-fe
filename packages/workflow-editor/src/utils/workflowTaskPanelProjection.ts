import type {
  WorkflowNodeJob,
  WorkflowTask,
  WorkflowTaskCommand,
  WorkflowTaskCommandType
} from '@unilab/services'

import type {
  WorkflowTaskRuntimeSnapshot
} from '../runtime/WorkflowTaskController'

export const TERMINAL_JOB_STATUSES = new Set([
  'succeeded',
  'failed',
  'skipped',
  'canceled',
  'timeout'
])

/** 把后端作业状态投影为工作流画布节点状态。 */
export function workflowTaskDagState(
  status: WorkflowNodeJob['status'],
  materialSource: boolean,
  taskStatus: WorkflowTask['status'] | undefined
): string {
  if (materialSource) {
    if (status === 'succeeded') return 'success'
    if (
      status === 'failed' ||
      status === 'intervention_required' ||
      status === 'timeout' ||
      status === 'execution_unknown'
    ) return 'failed'
    if (status === 'canceled' || status === 'cancel_requested') {
      return 'cancelled'
    }
    if (status === 'skipped') return 'skipped'
    if (taskStatus === 'admission_blocked') return 'material_waiting'
    return 'pending'
  }
  const states: Record<WorkflowNodeJob['status'], string> = {
    pending: 'pending',
    dispatched: 'ready',
    running: 'running',
    intervention_required: 'failed',
    cancel_requested: 'running',
    execution_unknown: 'reconciling',
    succeeded: 'success',
    failed: 'failed',
    skipped: 'skipped',
    canceled: 'cancelled',
    timeout: 'failed'
  }
  return states[status]
}

/** 构建调试器工作区所需的紧凑任务元数据。 */
export function workflowTaskMetadata(
  task: WorkflowTask | null,
  command: WorkflowTaskCommand | null,
  snapshot: Pick<
    WorkflowTaskRuntimeSnapshot,
    'realtimeStatus' | 'projectionStale' | 'feedbackStale'
  >
): ReadonlyArray<{ label: string; value: string; title?: string }> {
  return [
    {
      label: '任务',
      value: task ? task.uuid.slice(-8) : '尚未创建',
      title: task?.uuid
    },
    {
      label: '模式',
      value: task?.run_mode === 'step' ? '单步' : '正常'
    },
    {
      label: '命令',
      value: command
        ? `${workflowTaskCommandLabel(command.type)} · OS 已接受`
        : '无'
    },
    {
      label: '实时同步',
      value: {
        connecting: '正在连接',
        live: '已连接',
        reconnecting: '正在重连'
      }[snapshot.realtimeStatus]
    },
    {
      label: '状态投影',
      value: snapshot.projectionStale
        ? '保留的上一版本'
        : snapshot.feedbackStale
          ? '反馈事件待补读'
          : '已确认'
    }
  ]
}

/** 返回任务命令的中文显示名。 */
function workflowTaskCommandLabel(type: WorkflowTaskCommandType): string {
  return {
    pause: '暂停',
    resume: '继续',
    step: '单步',
    cancel: '取消'
  }[type]
}
