/**
 * ============================================================
 * AI-GENERATED CODE METADATA
 * ============================================================
 * Model: Claude Opus 4.8
 * Generation Date: 2026-07-23
 * Prompt Summary: 工作流调试工具栏(TID/状态 + 起始模式下拉 + 步过/步入/运行/暂停/继续/终止/急停/复位)
 * Context: 替换执行步骤列表,展示型组件,状态与操作来自 useWorkflowDebug
 * Human Review Status: [ ] Pending  [ ] Reviewed  [ ] Approved
 * ============================================================
 */
import type {
  UseWorkflowDebugResult,
  DebugStartMode,
  DebugStatus
} from '../hooks/useWorkflowDebug'

interface DebugToolbarProps {
  debug: UseWorkflowDebugResult
}

// 起始模式选项
const START_MODE_OPTIONS: { value: DebugStartMode; label: string }[] = [
  { value: 'from-start', label: '从头开始' },
  { value: 'from-current', label: '从当前节点' }
]

const STATUS_CLASS: Record<DebugStatus, string> = {
  idle: 'bg-[var(--unilab-color-skipped-soft)] text-[var(--unilab-color-skipped)]',
  running: 'bg-[var(--unilab-color-warning-soft)] text-[var(--unilab-color-warning)]',
  paused: 'bg-[var(--unilab-color-paused-soft)] text-[var(--unilab-color-paused)]',
  error: 'bg-[var(--unilab-color-danger-soft)] text-[var(--unilab-color-danger)]',
  finished: 'bg-[var(--unilab-color-success-soft)] text-[var(--unilab-color-success)]'
}

const BUTTON_CLASS =
  'h-8 cursor-pointer rounded-[var(--unilab-radius-control)] border border-[var(--unilab-color-border)] bg-[var(--unilab-color-surface)] px-3 text-[13px] font-medium text-[var(--unilab-color-text)] transition-colors enabled:hover:border-[var(--unilab-color-border-strong)] enabled:hover:bg-[var(--unilab-color-surface-subtle)] enabled:active:translate-y-px disabled:cursor-not-allowed disabled:text-[var(--unilab-color-text-subtle)] disabled:opacity-70'

// 调试工具栏:macOS 分段风格,危险操作红色标注
export default function DebugToolbar({ debug }: DebugToolbarProps): React.JSX.Element {
  const { status, statusLabel, startMode, stopAfterCurrent, flags } = debug

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[var(--unilab-radius-md)] border border-[var(--unilab-color-border)] bg-[var(--unilab-color-surface)] px-3 py-2.5 shadow-[var(--unilab-shadow-control)]">
      <span className="text-[13px] font-semibold text-[var(--unilab-color-text)]">
        工作流调试器
      </span>
      <span className={`rounded-[10px] px-2 py-0.5 text-[11px] font-semibold ${STATUS_CLASS[status]}`}>
        {statusLabel}
      </span>

      <select
        className="h-8 cursor-pointer rounded-[var(--unilab-radius-control)] border border-[var(--unilab-color-border)] bg-[var(--unilab-color-surface)] px-2 text-[13px] text-[var(--unilab-color-text)]"
        value={startMode}
        onChange={(event) =>
          debug.setStartMode(event.target.value === 'from-current' ? 'from-current' : 'from-start')
        }
      >
        {START_MODE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <span className="h-5 w-px bg-[var(--unilab-color-border)]" />

      <button
        type="button"
        className={BUTTON_CLASS}
        disabled={!flags.canRun}
        onClick={debug.run}
      >
        运行
      </button>
      <button
        type="button"
        className={BUTTON_CLASS}
        disabled={!flags.canPause}
        onClick={debug.pause}
      >
        暂停
      </button>
      <button
        type="button"
        className={`${BUTTON_CLASS} ${
          stopAfterCurrent
            ? 'border-[var(--unilab-color-focus)] bg-[var(--unilab-color-primary-soft)] text-[var(--unilab-color-primary)]'
            : ''
        }`}
        disabled={!flags.canStopAfter}
        onClick={debug.toggleStopAfter}
      >
        运行后停止
      </button>
      <button
        type="button"
        className={BUTTON_CLASS}
        disabled={!flags.canContinue}
        onClick={debug.resume}
      >
        继续
      </button>

      <span className="h-5 w-px bg-[var(--unilab-color-border)]" />

      <button
        type="button"
        className={`${BUTTON_CLASS} text-[var(--unilab-color-danger)] enabled:hover:border-[var(--unilab-color-danger)] enabled:hover:bg-[var(--unilab-color-danger-soft)]`}
        disabled={!flags.canTerminate}
        onClick={debug.terminate}
      >
        终止运行
      </button>
      <button
        type="button"
        className={BUTTON_CLASS}
        disabled={!flags.canReset}
        onClick={debug.reset}
      >
        复位
      </button>
    </div>
  )
}
