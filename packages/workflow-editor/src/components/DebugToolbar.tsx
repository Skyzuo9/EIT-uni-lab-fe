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
import type { UseWorkflowDebugResult, DebugStartMode } from '../hooks/useWorkflowDebug'

interface DebugToolbarProps {
  debug: UseWorkflowDebugResult
}

// 起始模式选项
const START_MODE_OPTIONS: { value: DebugStartMode; label: string }[] = [
  { value: 'from-start', label: '从头开始' },
  { value: 'from-current', label: '从当前节点' }
]

// 调试工具栏:macOS 分段风格,危险操作(终止/急停)红色标注
export default function DebugToolbar({ debug }: DebugToolbarProps): React.JSX.Element {
  const { status, statusLabel, startMode, stopAfterCurrent, flags } = debug

  return (
    <div className="debug-bar">
      <span className="debug-bar__tid">TID: DEBUG</span>
      <span className={`debug-bar__status debug-bar__status--${status}`}>{statusLabel}</span>

      <select
        className="debug-bar__select"
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

      <span className="debug-bar__divider" />

      <button
        type="button"
        className="debug-bar__btn"
        disabled={!flags.canStepOver}
        onClick={debug.stepOver}
      >
        步过
      </button>
      <button
        type="button"
        className="debug-bar__btn"
        disabled={!flags.canStepInto}
        onClick={debug.stepInto}
      >
        步入
      </button>
      <button
        type="button"
        className="debug-bar__btn"
        disabled={!flags.canRun}
        onClick={debug.run}
      >
        运行
      </button>
      <button
        type="button"
        className="debug-bar__btn"
        disabled={!flags.canPause}
        onClick={debug.pause}
      >
        暂停
      </button>
      <button
        type="button"
        className={`debug-bar__btn ${stopAfterCurrent ? 'is-active' : ''}`}
        disabled={!flags.canStopAfter}
        onClick={debug.toggleStopAfter}
      >
        运行后停止
      </button>
      <button
        type="button"
        className="debug-bar__btn"
        disabled={!flags.canContinue}
        onClick={debug.resume}
      >
        继续
      </button>

      <span className="debug-bar__divider" />

      <button
        type="button"
        className="debug-bar__btn debug-bar__btn--danger"
        disabled={!flags.canTerminate}
        onClick={debug.terminate}
      >
        终止运行
      </button>
      <button
        type="button"
        className="debug-bar__btn debug-bar__btn--danger"
        disabled={!flags.canEmergencyStop}
        onClick={debug.emergencyStop}
      >
        急停
      </button>
      <button
        type="button"
        className="debug-bar__btn"
        disabled={!flags.canReset}
        onClick={debug.reset}
      >
        复位
      </button>
    </div>
  )
}
