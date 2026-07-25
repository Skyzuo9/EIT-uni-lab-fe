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
  idle: 'bg-[#f1f3f5] text-[#868e96]',
  running: 'bg-[#e6fcf5] text-[#0ca678]',
  paused: 'bg-[#fff9db] text-[#f08c00]',
  error: 'bg-[#fff0f0] text-[#e03131]',
  finished: 'bg-[#edf2ff] text-[#4263eb]'
}

const BUTTON_CLASS =
  'h-[30px] cursor-pointer rounded-md border border-[#dee2e6] bg-white px-3 text-[13px] font-medium text-[#1f2329] transition-colors enabled:hover:border-[#adb5bd] enabled:hover:bg-[#f8f9fa] enabled:active:translate-y-px disabled:cursor-not-allowed disabled:text-[#adb5bd] disabled:opacity-70'

// 调试工具栏:macOS 分段风格,危险操作(终止/急停)红色标注
export default function DebugToolbar({ debug }: DebugToolbarProps): React.JSX.Element {
  const { status, statusLabel, startMode, stopAfterCurrent, flags } = debug

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-[#e8ebef] bg-white px-3 py-2.5 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
      <span className="font-mono text-[13px] font-semibold text-[#4dabf7]">TID: DEBUG</span>
      <span className={`rounded-[10px] px-2 py-0.5 text-[11px] font-semibold ${STATUS_CLASS[status]}`}>
        {statusLabel}
      </span>

      <select
        className="h-[30px] cursor-pointer rounded-md border border-[#dee2e6] bg-white px-2 text-[13px] text-[#1f2329]"
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

      <span className="h-5 w-px bg-[#e8ebef]" />

      <button
        type="button"
        className={BUTTON_CLASS}
        disabled={!flags.canStepOver}
        onClick={debug.stepOver}
      >
        步过
      </button>
      <button
        type="button"
        className={BUTTON_CLASS}
        disabled={!flags.canStepInto}
        onClick={debug.stepInto}
      >
        步入
      </button>
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
          stopAfterCurrent ? 'border-[#748ffc] bg-[#edf2ff] text-[#4263eb]' : ''
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

      <span className="h-5 w-px bg-[#e8ebef]" />

      <button
        type="button"
        className={`${BUTTON_CLASS} text-[#e03131] enabled:hover:border-[#ffa8a8] enabled:hover:bg-[#fff0f0]`}
        disabled={!flags.canTerminate}
        onClick={debug.terminate}
      >
        终止运行
      </button>
      <button
        type="button"
        className={`${BUTTON_CLASS} text-[#e03131] enabled:hover:border-[#ffa8a8] enabled:hover:bg-[#fff0f0]`}
        disabled={!flags.canEmergencyStop}
        onClick={debug.emergencyStop}
      >
        急停
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
