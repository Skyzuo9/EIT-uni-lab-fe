import { ServiceError } from '@unilab/services'

import {
  containsResourceSlotInput,
  type WorkflowTaskInputFormState
} from './workflowTaskInputForm'

export function workflowTaskInputProblem(
  error: unknown,
  form: WorkflowTaskInputFormState
): string {
  if (!(error instanceof ServiceError)) {
    return error instanceof Error ? error.message : String(error)
  }

  const authority = `OS ${error.status ?? ''} ${error.code}`.trim()
  const detail = `${authority}：${error.message}`
  const containsResourceSlot = form.fields.some(({ descriptor }) =>
    containsResourceSlotInput(descriptor.schema)
  )
  if (!containsResourceSlot) return detail

  if (error.status === 400 && error.code === 'invalid_input') {
    return `ResourceSlot 表单输入不被 OS 接受，请检查 Workflow 输入并重试。${detail}`
  }
  if (error.status === 404 && error.code === 'not_found') {
    return `Workflow 与 Material 数据可能已变化，请刷新后重试。${detail}`
  }
  if (error.status === 409 && error.code === 'conflict') {
    return `Task 输入与 OS 当前权威状态发生冲突，请刷新后重试。${detail}`
  }
  return detail
}
