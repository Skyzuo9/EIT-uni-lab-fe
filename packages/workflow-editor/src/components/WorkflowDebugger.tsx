import type { WorkflowDebugCommand } from '@unilab/services'

import type { WorkflowDebugControl } from '../utils/debugControls'

interface WorkflowDebuggerProps {
  debugStatus: string
  runStatus: string
  pausedBeforeNodeId: string | null
  startNodeId: string | null
  breakpointCount: number
  controls: readonly WorkflowDebugControl[]
  onCommand: (
    command: WorkflowDebugCommand,
    message: string
  ) => void
}

export function WorkflowDebugger({
  debugStatus,
  runStatus,
  pausedBeforeNodeId,
  startNodeId,
  breakpointCount,
  controls,
  onCommand
}: WorkflowDebuggerProps): React.JSX.Element {
  return (
    <div className="workflow-runtime__debugger">
      <div className="workflow-runtime__debug-status">
        <div className="workflow-runtime__debug-heading">
          <span
            className={`workflow-runtime__debug-mark is-${debugStatus}`}
            aria-hidden="true"
          />
          <div>
            <span>工作流调试器</span>
            <small>OS 运行控制</small>
          </div>
        </div>
        <div className="workflow-runtime__debug-summary">
          <strong
            className={`is-${debugStatus}`}
            data-debug-status={debugStatus}
          >
            {debugStatusLabel(debugStatus)}
          </strong>
          <span
            className={
              `workflow-runtime__run-state ` +
              `workflow-runtime__run-state--${runStatus}`
            }
            data-run-status={runStatus}
          >
            整体：{runStatusLabel(runStatus)}
          </span>
          {pausedBeforeNodeId && (
            <span className="is-location">
              暂停于 {pausedBeforeNodeId} 执行之前
            </span>
          )}
          <span className="is-meta">
            <i>起点</i>
            {startNodeId || 'DAG 根节点'}
          </span>
          <span className="is-meta">
            <i>断点</i>
            {breakpointCount}
          </span>
        </div>
      </div>
      <div className="workflow-runtime__debug-actions">
        <DebugActionGroup
          controls={controls.filter((control) => !control.danger)}
          onCommand={onCommand}
        />
        <DebugActionGroup
          controls={controls.filter((control) => control.danger)}
          danger
          onCommand={onCommand}
        />
      </div>
    </div>
  )
}

function DebugActionGroup({
  controls,
  danger = false,
  onCommand
}: {
  controls: readonly WorkflowDebugControl[]
  danger?: boolean
  onCommand: WorkflowDebuggerProps['onCommand']
}): React.JSX.Element {
  return (
    <div
      className={[
        'workflow-runtime__debug-action-group',
        danger ? 'is-danger' : ''
      ].filter(Boolean).join(' ')}
      aria-label={danger ? '调试停止控制' : '调试执行控制'}
    >
      {controls.map((control) => (
        <button
          key={control.command}
          type="button"
          className={
            control.command === 'continue'
              ? 'is-primary'
              : control.command === 'emergency_stop'
                ? 'is-emergency'
                : danger
                  ? 'is-danger'
                  : undefined
          }
          data-debug-command={control.command}
          aria-label={control.label}
          title={control.title}
          disabled={control.disabled}
          onClick={() => onCommand(control.command, control.message)}
        >
          <span
            className="workflow-runtime__debug-glyph"
            aria-hidden="true"
          >
            {control.glyph}
          </span>
          <span>{control.label}</span>
        </button>
      ))}
    </div>
  )
}

const DEBUG_STATUS_LABELS: Readonly<Record<string, string>> = {
  disabled: '未开始',
  pending: '启动中',
  running: '正在运行',
  pause_pending: '等待暂停',
  paused: '已暂停',
  stepping: '单步执行中',
  completed: '已完成',
  failed: '执行失败',
  cancelled: '已取消',
  terminated: '已终止'
}

const RUN_STATUS_LABELS: Readonly<Record<string, string>> = {
  draft: '草稿',
  pending: '等待执行',
  running: '运行中',
  completed: '已完成',
  failed: '执行失败',
  cancelled: '已取消',
  reconciling: '状态核对中'
}

function debugStatusLabel(status: string): string {
  return DEBUG_STATUS_LABELS[status] || status
}

function runStatusLabel(status: string): string {
  return RUN_STATUS_LABELS[status] || status
}
