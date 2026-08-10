import { useEffect, useState } from 'react'
import type {
  DeviceAction,
  DeviceActionTaskView,
  WorkflowActionNodeTemplate,
  WorkflowNodeJobFeedback
} from '@unilab/services'

import type { ManagedDevice } from './deviceCatalog'
import { supportsD1AS1 } from './deviceActionRun'
import { shortIdentifier } from './devicePanelFormat'
import styles from './DevicePanel.module.scss'

export function deviceActionReadiness({
  action,
  device,
  template,
  canRunActionTask,
  connection,
  catalogLoading,
  catalogError
}: {
  action: DeviceAction
  device: ManagedDevice
  template: WorkflowActionNodeTemplate | null
  canRunActionTask: boolean
  connection: 'disconnected' | 'connecting' | 'connected' | 'error'
  catalogLoading: boolean
  catalogError: string | null
}): DeviceActionRunState {
  if (!canRunActionTask) {
    return {
      kind: 'unavailable',
      reason: 'workflow_required',
      message: '当前环境暂不支持单动作运行，请在工作流中运行'
    }
  }
  if (connection !== 'connected' || !device.online) {
    return {
      kind: 'unavailable',
      reason: 'device_offline',
      message: '设备或 Edge 当前离线，恢复连接后才能运行'
    }
  }
  if (catalogLoading) {
    return {
      kind: 'unavailable',
      reason: 'catalog_loading',
      message: '正在读取设备动作信息…'
    }
  }
  if (catalogError) {
    return {
      kind: 'unavailable',
      reason: 'catalog_error',
      message: '无法读取该动作的运行信息，请刷新后重试；如果仍失败，请检查 Edge 连接'
    }
  }
  if (!template) {
    return {
      kind: 'unavailable',
      reason: 'template_unmatched',
      message: '没有找到与当前设备动作匹配的运行信息，请刷新后重试'
    }
  }
  if (!supportsD1AS1(template)) {
    return {
      kind: 'unavailable',
      reason: 'workflow_required',
      message: '该动作会影响物料或库位，请在工作流中运行'
    }
  }
  return {
    kind: 'ready',
    message: action.isBusy
      ? '当前动作被占用；提交后由 OS durable admission 排队'
      : '参数将提交为正式 WorkflowTask / WorkflowNodeJob'
  }
}

export function projectDeviceActionTask(
  view: DeviceActionTaskView,
  feedback: WorkflowNodeJobFeedback[]
): DeviceActionRunState {
  const projection = {
    taskUuid: view.task_uuid,
    output: view.output,
    feedback,
    error: view.error_info
  }
  if (view.status === 'succeeded') {
    return { kind: 'succeeded', message: '动作执行完成', ...projection }
  }
  if (view.status === 'failed' || view.status === 'timeout') {
    return {
      kind: 'failed',
      message: view.status === 'timeout' ? '动作执行超时' : '动作执行失败',
      ...projection
    }
  }
  if (view.status === 'canceled') {
    return { kind: 'canceled', message: '动作任务已取消', ...projection }
  }
  if (view.status === 'running' || view.status === 'canceling') {
    return {
      kind: 'running',
      message: view.status === 'canceling'
        ? '取消正在生效，等待设备终态'
        : `设备正在执行 · Job ${view.job_status}`,
      ...projection
    }
  }
  return {
    kind: 'accepted',
    message: '任务已接受，正在等待设备',
    ...projection
  }
}

export function isTerminalDeviceActionTask(status: string): boolean {
  return ['succeeded', 'failed', 'canceled', 'timeout'].includes(status)
}

export type DeviceActionRunState =
  | {
      kind: 'ready' | 'submitting'
      message: string
    }
  | {
      kind: 'unavailable'
      reason: DeviceActionUnavailableReason
      message: string
    }
  | {
      kind: 'error'
      message: string
      retryable: boolean
    }
  | {
      kind: 'accepted' | 'running' | 'succeeded' | 'failed' | 'canceled'
      message: string
      taskUuid: string
      output?: Record<string, unknown>
      feedback?: WorkflowNodeJobFeedback[]
      error?: unknown[]
    }

/** 单动作入口关闭时的稳定原因，用于避免把基础设施错误误报成工作流约束。 */
export type DeviceActionUnavailableReason =
  | 'workflow_required'
  | 'device_offline'
  | 'catalog_loading'
  | 'catalog_error'
  | 'template_unmatched'
  | 'no_actions'

/**
 * 吸收零动作设备禁用按钮理论上不可达的点击。
 *
 * @returns 无返回值。
 * @throws 不抛出异常。
 * @safety 不访问服务、不修改状态，也不创建动作任务。
 */
export function ignoreUnavailableDeviceActionRun(): void {}

/**
 * 展示单动作任务的可用性、运行控制与执行日志。
 *
 * @param props.state 当前动作任务运行状态。
 * @param props.onRun 可运行时创建动作任务的回调。
 * @param props.onCancel 运行中取消动作任务的可选回调。
 * @param props.disabledRunLabel 不可运行时保留在禁用按钮上的场景文案。
 * @returns 动作任务控制区及存在任务时的执行日志。
 * @throws 不主动抛出异常；回调错误由调用方处理。
 * @safety 不可运行状态始终禁用按钮，避免误创建任务。
 */
export function DeviceActionAvailability({
  state,
  onRun,
  onCancel,
  disabledRunLabel
}: {
  state: DeviceActionRunState
  onRun: () => void
  onCancel?: (taskUuid: string) => void
  disabledRunLabel?: string
}): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const ready = state.kind === 'ready' || (
    state.kind === 'error' && state.retryable
  )
  const terminal = state.kind === 'succeeded' ||
    state.kind === 'failed' ||
    state.kind === 'canceled'
  const runnable = ready || terminal
  const log = deviceActionExecutionLog(state)
  useEffect(() => {
    setCopied(false)
  }, [log])
  return (
    <>
      <div
        className={`edge-device__debug-actions is-${state.kind}`}
        role={state.kind === 'failed' ? 'alert' : 'status'}
      >
        <button
          type="button"
          className="edge-device__run-button"
          disabled={!runnable}
          onClick={onRun}
        >
          {state.kind === 'unavailable'
            ? disabledRunLabel ?? unavailableRunLabel(state.reason)
            : state.kind === 'submitting'
              ? '正在创建正式任务…'
              : state.kind === 'error' && state.retryable
                ? '重试同一请求'
                : terminal
                  ? '再次运行'
                  : '运行此动作'}
        </button>
        {'taskUuid' in state &&
        (state.kind === 'accepted' || state.kind === 'running') &&
        onCancel ? (
          <button
            type="button"
            className="edge-device__cancel-button"
            onClick={() => onCancel(state.taskUuid)}
          >
            取消任务
          </button>
        ) : null}
        <span>{userFacingActionMessage(state.message)}</span>
      </div>
      {'taskUuid' in state ? (
        <div className="edge-device__execution" aria-live="polite">
          <div className="edge-device__execution-head">
            <span className={`edge-device__execution-state ${
              deviceActionExecutionPresentation(state.kind).tone
            }`}>
              <span aria-hidden="true" />
              {deviceActionExecutionPresentation(state.kind).label}
            </span>
            <span className={styles.executionTools}>
              <code title={state.taskUuid}>
                Task {shortIdentifier(state.taskUuid)}
              </code>
              {log ? (
                <button
                  type="button"
                  className={styles.copyButton}
                  data-copied={copied}
                  onClick={() => {
                    void navigator.clipboard.writeText(log).then(() => {
                      setCopied(true)
                    })
                  }}
                >
                  {copied ? '已复制' : '复制'}
                </button>
              ) : null}
            </span>
          </div>
          {log ? (
            <pre aria-label="Action 运行日志">{log}</pre>
          ) : (
            <p>{deviceActionExecutionPresentation(state.kind).description}</p>
          )}
        </div>
      ) : null}
    </>
  )
}

/** 把旧版本或上游错误中的内部术语转换为用户可理解的动作信息。 */
function userFacingActionMessage(message: string): string {
  return message
    .replaceAll(/ ?Action 合同目录/gu, '设备动作信息')
    .replaceAll('动作合同目录', '设备动作信息')
    .replaceAll(/ ?Action 权威合同/gu, '动作运行信息')
    .replaceAll(/ ?Action 合同/gu, '设备动作信息')
    .replaceAll('动作合同', '动作信息')
    .replaceAll('合同', '信息')
}

/** 把关闭原因投影为按钮短文案，详细诊断仍由相邻状态文本承载。 */
function unavailableRunLabel(reason: DeviceActionUnavailableReason): string {
  switch (reason) {
    case 'workflow_required':
      return '请在工作流中运行'
    case 'device_offline':
      return '设备离线'
    case 'catalog_loading':
      return '正在读取动作信息…'
    case 'catalog_error':
      return '暂时无法运行'
    case 'template_unmatched':
      return '暂时无法运行'
    case 'no_actions':
      return '运行此动作'
  }
}

function deviceActionExecutionLog(state: DeviceActionRunState): string {
  if (!('taskUuid' in state)) return ''
  const projection: Record<string, unknown> = {}
  if (state.feedback?.length) {
    projection.events = state.feedback.map((item) => ({
      sequence: item.sequence,
      type: item.feedback_type,
      data: item.data,
      observed_at: item.observed_at
    }))
  }
  if (state.output && Object.keys(state.output).length > 0) {
    projection.result = state.output
  }
  if (state.error?.length) projection.error = state.error
  return Object.keys(projection).length > 0
    ? JSON.stringify(projection, null, 2)
    : ''
}

function deviceActionExecutionPresentation(kind: DeviceActionRunState['kind']): {
  label: string
  description: string
  tone: string
} {
  switch (kind) {
    case 'succeeded':
      return {
        label: '执行成功',
        description: '动作已由 OS 确认为成功。',
        tone: 'is-success'
      }
    case 'failed':
      return {
        label: '执行失败',
        description: 'OS 报告动作执行失败，请检查设备日志。',
        tone: 'is-danger'
      }
    case 'canceled':
      return {
        label: '已停止',
        description: 'OS 已确认动作停止。',
        tone: 'is-muted'
      }
    case 'running':
      return {
        label: '执行中',
        description: '动作已进入设备执行队列。',
        tone: 'is-running'
      }
    default:
      return {
        label: '等待执行',
        description: 'OS 已接受任务，等待动作调度。',
        tone: 'is-pending'
      }
  }
}
