export function workflowRuntimeProblemHeading(actionError: string | null): string {
  return actionError ? '运行控制操作失败' : '运行状态读取失败'
}

export function canRetryWorkflowRuntimeRead(actionError: string | null): boolean {
  return actionError === null
}
