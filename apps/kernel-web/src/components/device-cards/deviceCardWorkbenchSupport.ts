import type {
  DeviceCardAgentEnvironmentInfo,
  DeviceCardWorkspaceStatus
} from '@unilab/device-card-sdk'

export type WorkbenchNotice = {
  kind: 'success' | 'warning' | 'error' | 'info'
  text: string
}

export type WorkspaceOperation =
  | 'open'
  | 'prepare'
  | 'rebuild'
  | 'install'
  | 'close'
  | 'cli'
  | null

/** 返回设备卡工作区当前检查状态的中文标签。 */
export function workspaceStateLabel(
  state: DeviceCardWorkspaceStatus['state']
): string {
  if (state === 'ready') return '检查通过'
  if (state === 'error') return '需要修复'
  return '正在检查'
}

/** 汇总设备卡工作区诊断，供界面展示下一步操作。 */
export function workspaceSummary(workspace: DeviceCardWorkspaceStatus): string {
  const errors = workspace.diagnostics.filter(
    (diagnostic) => diagnostic.severity === 'error'
  ).length
  const warnings = workspace.diagnostics.length - errors
  if (workspace.state === 'building') {
    return workspace.card
      ? '正在检查最新修改，右侧暂时保留上次成功预览。'
      : '正在进行第一次源码检查，通过后会自动显示预览。'
  }
  if (workspace.state === 'ready') {
    return warnings > 0
      ? `检查通过，仍有 ${warnings} 条提醒。请确认预览后再安装。`
      : '检查通过。请先确认右侧预览，满意后再安装。'
  }
  return `发现 ${errors} 个问题。修复前不能安装。`
}

/** 返回设备卡 Agent 环境的可操作状态标签。 */
export function agentStatusLabel(
  info: DeviceCardAgentEnvironmentInfo
): string {
  if (!info.cli.installed) return '未安装'
  if (!info.cli.compatible) return '需更新'
  if (!info.bridge.enabled) return '未启用'
  return '已连接'
}
