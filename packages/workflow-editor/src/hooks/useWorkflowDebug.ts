/**
 * ============================================================
 * AI-GENERATED CODE METADATA
 * ============================================================
 * Model: Claude Opus 4.8
 * Generation Date: 2026-07-23
 * Prompt Summary: 工作流调试执行状态机 hook(idle/running/paused + 各操作按钮启用态)
 * Context: 替换"执行步骤"列表为调试工具栏,提供步过/步入/运行/暂停/继续/终止/急停/复位
 * Human Review Status: [ ] Pending  [ ] Reviewed  [ ] Approved
 * ============================================================
 */
import { useCallback, useMemo, useState } from 'react'

// 调试运行状态
export type DebugStatus = 'idle' | 'running' | 'paused' | 'finished' | 'error'

// 起始模式:从头开始 / 从当前节点
export type DebugStartMode = 'from-start' | 'from-current'

// 各操作按钮的启用态
export interface DebugActionFlags {
  canStepOver: boolean
  canStepInto: boolean
  canRun: boolean
  canPause: boolean
  canStopAfter: boolean
  canContinue: boolean
  canTerminate: boolean
  canEmergencyStop: boolean
  canReset: boolean
}

export interface UseWorkflowDebugResult {
  status: DebugStatus
  statusLabel: string
  startMode: DebugStartMode
  stopAfterCurrent: boolean
  flags: DebugActionFlags
  setStartMode: (mode: DebugStartMode) => void
  stepOver: () => void
  stepInto: () => void
  run: () => void
  pause: () => void
  toggleStopAfter: () => void
  resume: () => void
  terminate: () => void
  emergencyStop: () => void
  reset: () => void
}

// 状态中文标签
const STATUS_LABEL: Record<DebugStatus, string> = {
  idle: '未开始',
  running: '正在运行',
  paused: '已暂停',
  finished: '已完成',
  error: '执行失败'
}

// 工作流调试状态机:管理运行状态与各按钮启用态(纯前端 UI,后续可对接后端)
export function useWorkflowDebug(): UseWorkflowDebugResult {
  const [status, setStatus] = useState<DebugStatus>('idle')
  const [startMode, setStartMode] = useState<DebugStartMode>('from-start')
  const [stopAfterCurrent, setStopAfterCurrent] = useState(false)

  const stepOver = useCallback(() => setStatus('paused'), [])
  const stepInto = useCallback(() => setStatus('paused'), [])
  const run = useCallback(() => setStatus('running'), [])
  const pause = useCallback(() => setStatus('paused'), [])
  const resume = useCallback(() => setStatus('running'), [])
  const terminate = useCallback(() => {
    setStatus('idle')
    setStopAfterCurrent(false)
  }, [])
  const emergencyStop = useCallback(() => setStatus('error'), [])
  const reset = useCallback(() => {
    setStatus('idle')
    setStopAfterCurrent(false)
  }, [])
  const toggleStopAfter = useCallback(() => setStopAfterCurrent((prev) => !prev), [])

  const flags = useMemo<DebugActionFlags>(() => {
    const isIdle = status === 'idle' || status === 'finished' || status === 'error'
    const isRunning = status === 'running'
    const isPaused = status === 'paused'
    return {
      canStepOver: isIdle || isPaused,
      canStepInto: isIdle || isPaused,
      canRun: isIdle,
      canPause: isRunning,
      canStopAfter: isRunning || isPaused,
      canContinue: isPaused,
      canTerminate: isRunning || isPaused,
      canEmergencyStop: isRunning || isPaused,
      canReset: !isRunning
    }
  }, [status])

  return {
    status,
    statusLabel: STATUS_LABEL[status],
    startMode,
    stopAfterCurrent,
    flags,
    setStartMode,
    stepOver,
    stepInto,
    run,
    pause,
    toggleStopAfter,
    resume,
    terminate,
    emergencyStop,
    reset
  }
}
