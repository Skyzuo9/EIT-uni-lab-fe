import type {
  WorkflowDebugCommand,
  WorkflowDebugProjection,
  WorkflowRun
} from '@unilab/services'

export interface WorkflowDebugControl {
  command: Extract<
    WorkflowDebugCommand,
    | 'pause'
    | 'step'
    | 'step_over'
    | 'step_into'
    | 'continue'
    | 'terminate'
    | 'emergency_stop'
  >
  label: string
  glyph: string
  title: string
  message: string
  danger: boolean
  disabled: boolean
}

export interface WorkflowDebugControlState {
  debugEnabled: boolean
  debugStatus: WorkflowDebugProjection['status']
  runStatus: WorkflowRun['status'] | 'draft'
  busy: boolean
}

const TERMINAL_RUN_STATES = new Set<WorkflowRun['status']>([
  'completed',
  'failed',
  'cancelled'
])
const TERMINAL_DEBUG_STATES = new Set<WorkflowDebugProjection['status']>([
  'completed',
  'failed',
  'cancelled',
  'terminated',
  'disabled'
])
const RUNNING_DEBUG_STATES = new Set<WorkflowDebugProjection['status']>([
  'pending',
  'running',
  'pause_pending',
  'stepping'
])

export function workflowDebugControls(
  state: WorkflowDebugControlState
): WorkflowDebugControl[] {
  const paused = state.debugStatus === 'paused'
  const pauseRequested = paused || state.debugStatus === 'pause_pending'
  const running = RUNNING_DEBUG_STATES.has(state.debugStatus)
  const canCommand = state.debugEnabled &&
    !TERMINAL_RUN_STATES.has(state.runStatus as WorkflowRun['status']) &&
    !TERMINAL_DEBUG_STATES.has(state.debugStatus)
  const blocked = state.busy || !canCommand

  return [
    {
      command: 'pause',
      label: '暂停',
      glyph: 'Ⅱ',
      title: '停止放行新节点；已在执行的动作安全收敛后暂停',
      message: '暂停请求已由 OS 接受；等待当前动作收敛',
      danger: false,
      disabled: blocked || pauseRequested
    },
    {
      command: 'step',
      label: '单步',
      glyph: '↦',
      title: '放行一个逻辑节点，并在下一个节点入队前暂停',
      message: 'OS 已放行一个逻辑节点',
      danger: false,
      disabled: blocked || !paused
    },
    {
      command: 'step_over',
      label: '步过',
      glyph: '⇥',
      title: '调试器第一版：与单步相同，放行一个逻辑节点',
      message: 'OS 已按第一版步过语义放行一个逻辑节点',
      danger: false,
      disabled: blocked || !paused
    },
    {
      command: 'step_into',
      label: '步入',
      glyph: '↳',
      title: '调试器第一版：与单步相同，放行一个逻辑节点',
      message: 'OS 已按第一版步入语义放行一个逻辑节点',
      danger: false,
      disabled: blocked || !paused
    },
    {
      command: 'continue',
      label: '继续',
      glyph: '▶',
      title: '从当前暂停位置继续，下一断点仍在节点入队前生效',
      message: '继续命令已由 OS 接受',
      danger: false,
      disabled: blocked || !paused
    },
    {
      command: 'terminate',
      label: '终止',
      glyph: '■',
      title: '终止当前运行，并取消尚未完成的节点',
      message: '终止请求已由 OS 接受；等待当前运行收敛',
      danger: true,
      disabled: blocked || (!paused && !running)
    },
    {
      command: 'emergency_stop',
      label: '急停',
      glyph: '⚠',
      title: '立即触发当前运行的设备清理并停止后续调度（非全站硬件急停）',
      message: '当前运行的急停请求已由 OS 接受',
      danger: true,
      disabled: blocked
    }
  ]
}
