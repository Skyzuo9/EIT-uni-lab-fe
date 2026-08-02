import type {
  WorkflowTask,
  WorkflowTaskCommandType
} from '@unilab/services'

import type { WorkflowRuntimeControl } from '../components/WorkflowDebugger'

const TERMINAL_TASK_STATUSES = new Set<WorkflowTask['status']>([
  'succeeded',
  'failed',
  'canceled',
  'timeout'
])

export function workflowTaskControls(
  task: WorkflowTask | null,
  busy: boolean
): ReadonlyArray<WorkflowRuntimeControl<WorkflowTaskCommandType>> {
  const terminal = !task || TERMINAL_TASK_STATUSES.has(task.status)
  const admissionBlocked = task?.status === 'admission_blocked'
  return [
    {
      command: 'pause',
      label: '暂停',
      title: '提交 durable pause intent；等待 OS 权威状态确认',
      message: 'pause 已由 OS 接受，等待 Task 状态补读',
      glyph: 'Ⅱ',
      disabled: busy || terminal || admissionBlocked ||
        task.control_status !== 'active'
    },
    {
      command: 'resume',
      label: '继续',
      title: '提交 durable resume intent；等待 OS 权威状态确认',
      message: 'resume 已由 OS 接受，等待 Task 状态补读',
      glyph: '▶',
      primary: true,
      disabled: busy || terminal || admissionBlocked ||
        task.control_status !== 'paused'
    },
    {
      command: 'step',
      label: '单步',
      title: '仅 step 模式且权威状态为 paused 时提交一步执行 intent',
      message: 'step 已由 OS 接受，等待 Job/Task 状态补读',
      glyph: '→',
      disabled: busy || terminal || admissionBlocked ||
        task.run_mode !== 'step' || task.control_status !== 'paused'
    },
    {
      command: 'cancel',
      label: '取消',
      title: '提交 durable cancel intent；等待 Task/Jobs 权威终态',
      message: 'cancel 已由 OS 接受，等待 Task/Jobs 状态补读',
      glyph: '■',
      danger: true,
      disabled: busy || terminal
    }
  ]
}

export function workflowTaskVisualStatus(task: WorkflowTask | null): string {
  if (!task) return 'disabled'
  if (task.status === 'succeeded') return 'completed'
  if (task.status === 'canceled') return 'cancelled'
  if (task.status === 'failed' || task.status === 'timeout') return 'failed'
  if (task.status === 'admission_blocked') return 'admission_blocked'
  if (task.control_status === 'paused') return 'paused'
  if (task.control_status === 'waiting_reconciliation') return 'reconciling'
  return task.status
}

export function workflowTaskControlStatusLabel(
  task: WorkflowTask | null
): string {
  if (!task) return '未创建 Task'
  if (TERMINAL_TASK_STATUSES.has(task.status)) return '执行已结束'
  if (task.status === 'admission_blocked') return '等待物料准入'
  return {
    active: '控制可用',
    paused: '已暂停',
    waiting_reconciliation: '等待状态核对'
  }[task.control_status]
}

export function workflowTaskStatusLabel(
  status: WorkflowTask['status'] | undefined
): string {
  if (!status) return '未开始'
  return {
    pending: '等待执行',
    admission_blocked: '等待物料准入',
    running: '运行中',
    canceling: '正在取消',
    succeeded: '执行成功',
    failed: '执行失败',
    canceled: '已取消',
    timeout: '执行超时'
  }[status]
}
