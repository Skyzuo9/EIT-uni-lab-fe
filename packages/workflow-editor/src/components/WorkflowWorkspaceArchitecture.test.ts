import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const componentDirectory = fileURLToPath(new URL('.', import.meta.url))

/** 读取工作流视图源码，验证 OS 与 Backend 是否经过同一个工作区 seam。 */
function componentSource(name: string): string {
  return readFileSync(`${componentDirectory}/${name}`, 'utf8')
}

describe('Workflow workspace authority', () => {
  /** OS 与 Backend 必须复用唯一工具栏实现，避免部署差异产生第二套页面。 */
  it('routes both runtime adapters through the dev workspace toolbar', () => {
    expect(componentSource('PersistentWorkflowToolbar.tsx'))
      .toContain('WorkflowWorkspaceToolbar')
    expect(componentSource('ExistingWorkflowRuntimePanel.tsx'))
      .toContain('WorkflowWorkspaceToolbar')
    expect(existsSync(
      `${componentDirectory}/ExistingWorkflowRuntimeToolbar.tsx`
    )).toBe(false)
  })

  /** 两种工作流权威来源必须共用画布身份和投影状态标题条。 */
  it('keeps one canvas stage header for OS and Backend projections', () => {
    expect(componentSource('PersistentWorkflowAuthoringView.tsx'))
      .toContain('WorkflowCanvasStageHeader')
    expect(componentSource('ExistingWorkflowCanvas.tsx'))
      .toContain('WorkflowCanvasStageHeader')
  })

  /** Backend 只读控件可以有适配样式，但不得恢复独立页面壳。 */
  it('removes the Backend-only workspace shell stylesheet', () => {
    expect(existsSync(
      `${componentDirectory}/_workflow-existing-runtime.scss`
    )).toBe(false)
    expect(componentSource('workflow.module.scss'))
      .toContain("@use './workflow-readonly-controls';")
  })
})
