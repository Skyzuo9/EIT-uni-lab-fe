import type { WorkflowEditMode } from './workflowCanvasPolicy'

const WORKFLOW_EDIT_MODE_STORAGE_KEY = 'unilab.workflow.edit-mode.v1'

interface WorkflowEditModeOptions {
  codeViewing: boolean
  sourceEditing: boolean
  hideEmbeddedCodeEditor: boolean
  search?: string
  storedMode?: string | null
}

/**
 * 恢复工作流（Workflow）编辑模式；显式 URL 优先于同源持久状态。
 * 本地 Theia 把源码交给 Monaco，因此没有已恢复选择时直接展示画布。
 */
export function resolveWorkflowEditMode({
  codeViewing,
  sourceEditing,
  hideEmbeddedCodeEditor,
  search = '',
  storedMode = null
}: WorkflowEditModeOptions): WorkflowEditMode {
  const requested = new URLSearchParams(search).get('workflowEditMode')
  const restored = requested === 'code' || requested === 'canvas'
    ? requested
    : storedMode === 'code' || storedMode === 'canvas'
      ? storedMode
      : null
  if (restored === 'code') return codeViewing ? 'code' : 'canvas'
  if (restored === 'canvas') return 'canvas'
  if (hideEmbeddedCodeEditor) return 'canvas'
  return sourceEditing ? 'code' : 'canvas'
}

/** 从当前浏览器读取工作流编辑模式。 */
export function initialWorkflowEditMode(
  options: Omit<WorkflowEditModeOptions, 'search' | 'storedMode'>
): WorkflowEditMode {
  try {
    return resolveWorkflowEditMode({
      ...options,
      search: globalThis.location?.search ?? '',
      storedMode: globalThis.localStorage?.getItem(
        WORKFLOW_EDIT_MODE_STORAGE_KEY
      )
    })
  } catch {
    return resolveWorkflowEditMode(options)
  }
}

/** 保存用户最后确认的工作流编辑模式。 */
export function persistWorkflowEditMode(mode: WorkflowEditMode): void {
  try {
    globalThis.localStorage?.setItem(WORKFLOW_EDIT_MODE_STORAGE_KEY, mode)
  } catch {
    // 浏览器存储不可用时不影响工作流编写。
  }
}
