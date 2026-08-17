import { Emitter, type Event } from '@theia/core/lib/common/event'
import { injectable } from '@theia/core/shared/inversify'

export type WorkbenchDomain =
  | 'workflow'
  | 'material'
  | 'device'
  | 'robot-debug'
  | 'robot-points'
  | 'robot-bench'
  | 'robot-reagents'
export type WorkbenchViewMode =
  | 'empty'
  | 'workflow'
  | 'material'
  | 'device'
  | 'robot-debug'
  | 'robot-points'
  | 'robot-bench'
  | 'robot-reagents'
  | 'material-device'
  | 'material-robot-debug'
  | 'split'

export type RobotWorkbenchViewMode = Extract<
  WorkbenchViewMode,
  `robot-${string}`
>

const WORKBENCH_VIEW_STORAGE_KEY = 'unilab.workbench.view-mode.v1'

/**
 * The single UI authority for which UniLab domain surfaces are visible.
 *
 * The service contains presentation state only. Workflow, Material and OS
 * facts remain owned by their existing stores and WorkbenchSession.
 */
@injectable()
export class WorkbenchViewState {
  protected workflowVisible = true
  protected materialVisible = false
  protected exclusiveDomain: Exclude<
    WorkbenchDomain,
    'workflow' | 'material'
  > | null = null
  protected readonly changeEmitter = new Emitter<WorkbenchViewMode>()

  constructor() {
    const initialMode = initialWorkbenchViewMode()
    this.applyMode(initialMode)
    persistWorkbenchViewMode(initialMode)
  }

  readonly onDidChangeMode: Event<WorkbenchViewMode> = this.changeEmitter.event

  /** 返回当前 Workbench 主区唯一可见模式。 */
  get currentMode(): WorkbenchViewMode {
    if (this.exclusiveDomain === 'device' && this.materialVisible) {
      return 'material-device'
    }
    if (this.exclusiveDomain === 'robot-debug' && this.materialVisible) {
      return 'material-robot-debug'
    }
    if (this.exclusiveDomain) return this.exclusiveDomain
    if (this.workflowVisible && this.materialVisible) return 'split'
    if (this.workflowVisible) return 'workflow'
    if (this.materialVisible) return 'material'
    return 'empty'
  }

  /** 判断一个领域入口当前是否在 Workbench 主区可见。 */
  isVisible(domain: WorkbenchDomain): boolean {
    if (domain === 'workflow') {
      return this.workflowVisible && this.exclusiveDomain === null
    }
    if (domain === 'material') {
      return this.materialVisible && (
        this.exclusiveDomain === null || this.exclusiveDomain === 'device'
        || this.exclusiveDomain === 'robot-debug'
      )
    }
    return this.exclusiveDomain === domain
  }

  /**
   * 切换一个领域主区；设备与四个机械臂入口保持互斥，工作流与物料可组成分栏。
   * @param domain 用户从 Workbench 活动栏选择的领域入口。
   * @returns 无返回值；模式变化时发布一次呈现事件。
   */
  toggle(domain: WorkbenchDomain): void {
    const previousMode = this.currentMode
    if (
      (previousMode === 'material-device' && domain === 'device')
      || (previousMode === 'material-robot-debug' && domain === 'robot-debug')
    ) {
      this.materialVisible = false
      this.changeEmitter.fire(this.currentMode)
      return
    }
    // 主区必须始终保留至少一个活动领域。单视图下再次点击当前入口
    // 只用于保持焦点，不能把唯一活动项关闭成 empty。
    if (previousMode !== 'split' && this.isVisible(domain)) return
    if (domain !== 'workflow' && domain !== 'material') {
      this.exclusiveDomain = this.exclusiveDomain === domain ? null : domain
      if (!this.workflowVisible) this.materialVisible = false
    } else if (this.exclusiveDomain) {
      // 从设备或机械臂等互斥页面返回创作区时，明确选择用户点击的领域。
      // 不能反转离开创作区前遗留的可见标记，否则“物料 → 设备 → 物料”
      // 会把 materialVisible 从 true 切成 false，导致主区与活动栏选中态不一致。
      this.exclusiveDomain = null
      this.workflowVisible = domain === 'workflow'
      this.materialVisible = domain === 'material'
    } else {
      this.exclusiveDomain = null
      if (domain === 'workflow') {
        this.workflowVisible = !this.workflowVisible
      } else {
        this.materialVisible = !this.materialVisible
      }
    }
    const nextMode = this.currentMode
    if (nextMode !== previousMode) {
      persistWorkbenchViewMode(nextMode)
      this.changeEmitter.fire(nextMode)
    }
  }

  protected applyMode(mode: WorkbenchViewMode): void {
    this.workflowVisible = mode === 'workflow' || mode === 'split'
    this.materialVisible = mode === 'material' || mode === 'split'
      || mode === 'material-device' || mode === 'material-robot-debug'
    this.exclusiveDomain = mode === 'empty' || mode === 'workflow'
      || mode === 'material' || mode === 'split'
      ? null
      : mode === 'material-device'
        ? 'device'
        : mode === 'material-robot-debug'
          ? 'robot-debug'
          : mode
  }
}

/** 读取可分享 URL，其次读取同源浏览器状态，最后保持产品默认工作流视图。 */
export function initialWorkbenchViewMode(): WorkbenchViewMode {
  if (headlessMaterialRendererRequested()) return 'material'
  try {
    const requested = parseWorkbenchViewMode(new URLSearchParams(
      globalThis.location?.search ?? ''
    ).get('workbenchView'))
    if (requested) return requested
    const stored = parseWorkbenchViewMode(
      globalThis.localStorage?.getItem(WORKBENCH_VIEW_STORAGE_KEY)
    )
    if (stored) return stored
  } catch {
    // 浏览器禁用存储时仍使用稳定默认值。
  }
  return 'workflow'
}

/** 把活动领域写入同源状态；明确 URL 会在首次加载时成为后续默认值。 */
function persistWorkbenchViewMode(mode: WorkbenchViewMode): void {
  try {
    globalThis.localStorage?.setItem(WORKBENCH_VIEW_STORAGE_KEY, mode)
  } catch {
    // 呈现状态持久化失败不能阻断 Workbench。
  }
}

/** 拒绝旧版本或人工写入的未知展示值。 */
export function parseWorkbenchViewMode(
  value: string | null | undefined
): WorkbenchViewMode | null {
  return value && [
    'empty',
    'workflow',
    'material',
    'device',
    'robot-debug',
    'robot-points',
    'robot-bench',
    'robot-reagents',
    'material-device',
    'material-robot-debug',
    'split'
  ].includes(value)
    ? value as WorkbenchViewMode
    : null
}

function headlessMaterialRendererRequested(): boolean {
  try {
    return typeof globalThis.location !== 'undefined' && new URLSearchParams(
      globalThis.location.search
    ).get('headlessRenderer') === 'material'
  } catch {
    return false
  }
}

/**
 * 判断当前主区是否为四个机械臂工站入口之一。
 * @param mode Workbench 当前模式。
 * @returns 以 robot- 开头的正式工站模式返回 true。
 */
export function isRobotWorkbenchViewMode(
  mode: WorkbenchViewMode
): mode is RobotWorkbenchViewMode {
  return mode.startsWith('robot-')
}
