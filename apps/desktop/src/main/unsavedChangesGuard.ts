export type UnsavedUnloadAction = 'allow' | 'prompt'

/**
 * 把工作台显式上报的未保存状态转换为窗口关闭策略。
 *
 * @param hasUnsavedChanges true/false 是工作台权威状态；null 表示尚未收到上报。
 * @returns clean 时允许卸载；dirty 或未知时保守地请求用户确认。
 * @safety 未知状态关闭失败，避免预加载脚本异常时静默丢失工作流修改。
 */
export function resolveUnsavedUnloadAction(
  hasUnsavedChanges: boolean | null
): UnsavedUnloadAction {
  return hasUnsavedChanges === false ? 'allow' : 'prompt'
}

/**
 * 在 IPC 边界收窄渲染器上报的未保存状态。
 *
 * @param value 不可信的渲染器 IPC 载荷。
 * @returns 已验证的布尔状态。
 * @throws 非布尔值会关闭失败，不能改变窗口退出门禁。
 * @safety 该值只表达状态，不包含代码、路径或可执行输入。
 */
export function validateRendererUnsavedChanges(value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throw new Error('未保存状态必须是布尔值')
  }
  return value
}
