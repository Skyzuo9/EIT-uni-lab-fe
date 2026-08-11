/**
 * 汇总嵌入式工作流面板与全部 Theia 编辑器的未保存状态。
 *
 * @param workflowPanelDirty 工作流画布/源码双表示是否包含未保存修改。
 * @param editorDirtyStates 当前工作台全部编辑器文档的 dirty 状态。
 * @returns 任一可写表示仍未落盘时返回 true。
 * @safety 聚合全部编辑器而非仅活动标签，避免关闭后台 dirty 文档时丢失数据。
 */
export function hasWorkbenchUnsavedChanges(
  workflowPanelDirty: boolean,
  editorDirtyStates: readonly boolean[]
): boolean {
  return workflowPanelDirty || editorDirtyStates.some(Boolean)
}
