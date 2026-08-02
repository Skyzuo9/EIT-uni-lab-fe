import { ServiceError } from '@unilab/services'

export function workflowTaskInputProblem(error: unknown): string {
  if (!(error instanceof ServiceError)) {
    return error instanceof Error ? error.message : String(error)
  }

  const authority = `OS ${error.status ?? ''} ${error.code}`.trim()
  const detail = `${authority}：${error.message}`
  switch (error.status) {
    case 400:
      return `ResourceSlot 类型不兼容，请重新选择。${detail}`
    case 404:
      return `所选 Material 已不存在，请刷新 Material 选项后重试。${detail}`
    case 409:
      return `所选 Material 当前不可用或已占用，请重新选择或稍后重试。${detail}`
    default:
      return detail
  }
}
