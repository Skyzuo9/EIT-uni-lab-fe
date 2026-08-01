export interface WorkflowRuntimeControl<TCommand extends string> {
  command: TCommand
  label: string
  title: string
  message: string
  glyph: string
  disabled: boolean
  danger?: boolean
  primary?: boolean
}

interface WorkflowDebuggerProps<TCommand extends string> {
  debugStatus: string
  runStatus: string
  pausedBeforeNodeId?: string | null
  startNodeId?: string | null
  breakpointCount?: number
  heading?: string
  subtitle?: string
  statusText?: string
  runStatusText?: string
  runStatusPrefix?: string
  metadata?: ReadonlyArray<{
    label: string
    value: string | number
    title?: string
  }>
  actionGroupLabel?: string
  dangerGroupLabel?: string
  commandDataAttribute?: 'debug' | 'runtime'
  controls: readonly WorkflowRuntimeControl<TCommand>[]
  onCommand: (
    command: TCommand,
    message: string
  ) => void
}

export function WorkflowDebugger<TCommand extends string>({
  debugStatus,
  runStatus,
  pausedBeforeNodeId,
  startNodeId,
  breakpointCount,
  heading = '工作流调试器',
  subtitle = 'OS 运行控制',
  statusText,
  runStatusText,
  runStatusPrefix = '整体',
  metadata,
  actionGroupLabel = '调试执行控制',
  dangerGroupLabel = '调试停止控制',
  commandDataAttribute = 'debug',
  controls,
  onCommand
}: WorkflowDebuggerProps<TCommand>): React.JSX.Element {
  return (
    <div className="workflow-runtime__debugger">
      <div className="workflow-runtime__debug-status">
        <div className="workflow-runtime__debug-heading">
          <span
            className={`workflow-runtime__debug-mark is-${debugStatus}`}
            aria-hidden="true"
          />
          <div>
            <span>{heading}</span>
            <small>{subtitle}</small>
          </div>
        </div>
        <div className="workflow-runtime__debug-summary">
          <strong
            className={`is-${debugStatus}`}
            data-debug-status={debugStatus}
          >
            {statusText || debugStatusLabel(debugStatus)}
          </strong>
          <span
            className={
              `workflow-runtime__run-state ` +
              `workflow-runtime__run-state--${runStatus}`
            }
            data-run-status={runStatus}
          >
            {runStatusPrefix}：{runStatusText || runStatusLabel(runStatus)}
          </span>
          {pausedBeforeNodeId && (
            <span className="is-location">
              暂停于 {pausedBeforeNodeId} 执行之前
            </span>
          )}
          {metadata
            ? metadata.map((item) => (
                <span
                  key={item.label}
                  className="is-meta"
                  title={item.title}
                >
                  <i>{item.label}</i>
                  {item.value}
                </span>
              ))
            : (
                <>
                  <span className="is-meta">
                    <i>起点</i>
                    {startNodeId || 'DAG 根节点'}
                  </span>
                  <span className="is-meta">
                    <i>断点</i>
                    {breakpointCount || 0}
                  </span>
                </>
              )}
        </div>
      </div>
      <div className="workflow-runtime__debug-actions">
        <DebugActionGroup
          controls={controls.filter((control) => !control.danger)}
          ariaLabel={actionGroupLabel}
          commandDataAttribute={commandDataAttribute}
          onCommand={onCommand}
        />
        <DebugActionGroup
          controls={controls.filter((control) => control.danger)}
          danger
          ariaLabel={dangerGroupLabel}
          commandDataAttribute={commandDataAttribute}
          onCommand={onCommand}
        />
      </div>
    </div>
  )
}

function DebugActionGroup<TCommand extends string>({
  controls,
  danger = false,
  ariaLabel,
  commandDataAttribute,
  onCommand
}: {
  controls: readonly WorkflowRuntimeControl<TCommand>[]
  danger?: boolean
  ariaLabel: string
  commandDataAttribute: 'debug' | 'runtime'
  onCommand: WorkflowDebuggerProps<TCommand>['onCommand']
}): React.JSX.Element {
  return (
    <div
      className={[
        'workflow-runtime__debug-action-group',
        danger ? 'is-danger' : ''
      ].filter(Boolean).join(' ')}
      aria-label={ariaLabel}
    >
      {controls.map((control) => (
        <button
          key={control.command}
          type="button"
          className={
            control.primary || control.command === 'continue'
              ? 'is-primary'
              : control.command === 'emergency_stop'
                ? 'is-emergency'
                : danger
                  ? 'is-danger'
                  : undefined
          }
          data-debug-command={
            commandDataAttribute === 'debug' ? control.command : undefined
          }
          data-runtime-command={
            commandDataAttribute === 'runtime' ? control.command : undefined
          }
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
