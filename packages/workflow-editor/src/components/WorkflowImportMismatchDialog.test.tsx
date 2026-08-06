import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { WorkflowImportMismatchDialog } from './WorkflowImportMismatchDialog'

describe('WorkflowImportMismatchDialog', () => {
  it('explains that current data is safe and offers the matching workflow', () => {
    const markup = renderToStaticMarkup(
      <WorkflowImportMismatchDialog
        prompt={{
          currentWorkflowUuid: '10000000-0000-4000-8000-000000000001',
          currentWorkflowName: '当前配液流程',
          importedWorkflowUuid: '20000000-0000-4000-8000-000000000002',
          importedWorkflowName: '历史加液流程',
          canOpenImportedWorkflow: true,
          importedFileName: 'addition.py',
          importedPythonSource: '# source'
        }}
        busy={false}
        onContinueEditing={vi.fn()}
        onDiscardImport={vi.fn()}
        onOpenImportedWorkflow={vi.fn()}
      />
    )

    expect(markup).toContain('role="dialog"')
    expect(markup).toContain('aria-modal="true"')
    expect(markup).toContain('这个文件属于另一个工作流')
    expect(markup).toContain('当前工作流没有被修改')
    expect(markup).toContain('继续修改导入内容')
    expect(markup).toContain('aria-label="打开「历史加液流程」并继续"')
    expect(markup).toContain('打开对应工作流')
    expect(markup).not.toContain('3003')
    expect(markup).not.toContain('身份')
  })

  it('keeps a safe editing action when the matching workflow is unavailable', () => {
    const markup = renderToStaticMarkup(
      <WorkflowImportMismatchDialog
        prompt={{
          currentWorkflowUuid: '10000000-0000-4000-8000-000000000001',
          currentWorkflowName: null,
          importedWorkflowUuid: null,
          importedWorkflowName: null,
          canOpenImportedWorkflow: false,
          importedFileName: null,
          importedPythonSource: '# source'
        }}
        busy={false}
        onContinueEditing={vi.fn()}
        onDiscardImport={vi.fn()}
      />
    )

    expect(markup).toContain('继续修改导入内容')
    expect(markup).toContain('放弃导入')
    expect(markup).not.toContain('并继续</button>')
  })
})
