import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

function source(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')
}

describe('Workflow ResourceSlot application boundary', () => {
  it('threads a narrow readonly options port through the existing Workflow panels', () => {
    const workflowPanel = source('./WorkflowPanel.tsx')
    const authoringPanel = authoringSource()

    expect(workflowPanel).toMatch(/WorkflowResourceSlotOptionsPort/)
    expect(workflowPanel).toMatch(/resourceSlotOptionsPort/)
    expect(authoringPanel).toMatch(/WorkflowResourceSlotOptionsPort/)
    expect(authoringPanel).toMatch(/resourceSlotOptionsPort/)
    expect(authoringPanel).toMatch(/loadWorkflowResourceSlotOptions/)
    expect(authoringPanel).toMatch(/refreshResourceSlotOptions/)
    expect(source('./PersistentWorkflowOverlays.tsx'))
      .toMatch(/WorkflowActionParameterDrawer[\s\S]*resourceSlotOptions/)
    expect(authoringPanel).toMatch(
      /workflowTaskInputProblem\s*\(\s*submitError\s*,\s*submittedForm\s*\)/
    )
  })

  it('keeps workflow-editor free of Material HTTP and Material-store authority', () => {
    const production = [
      source('./WorkflowPanel.tsx'),
      authoringSource(),
      source('./WorkflowTaskInputForm.tsx'),
      source('../utils/workflowTaskInputForm.ts')
    ].join('\n')

    expect(production).not.toMatch(/\/api\/v1\/materials/i)
    expect(production).not.toMatch(/\bfetch\s*\(/)
    expect(production).not.toMatch(/useMaterialStore|MaterialStoreProvider/)
  })

  it('composes the same material graph adapter in kernel-web and Theia', () => {
    const sharedAdapter = source('../utils/workflowResourceSlotOptions.ts')
    const kernelAdapter = source(
      '../../../../apps/kernel-web/src/integrations/lab-workbench/panelAdapter.tsx'
    )
    const theiaAdapter = source(
      '../../../../packages/workbench-theia/src/browser/unilab-workbench-widget.tsx'
    )

    expect(sharedAdapter).toMatch(/graph\.getGraph\s*\(scope\)/)
    expect(sharedAdapter).toMatch(/material\.id/)
    expect(sharedAdapter).toMatch(/material\.sourceTemplateId/)
    expect(sharedAdapter).toMatch(/material\.name/)
    expect(kernelAdapter).toMatch(/WorkflowRenderer[\s\S]*useMaterialRuntime\s*\(/)
    expect(kernelAdapter).toMatch(/createWorkflowResourceSlotOptionsPort/)
    expect(kernelAdapter).toMatch(/resourceSlotOptionsPort/)
    expect(theiaAdapter).toMatch(/createWorkflowResourceSlotOptionsPort/)
    expect(theiaAdapter).toMatch(/resourceSlotOptionsPort={resourceSlotOptionsPort}/)
  })
})

function authoringSource(): string {
  return [
    './PersistentWorkflowAuthoringPanel.tsx',
    './PersistentWorkflowAuthoringView.tsx',
    '../hooks/usePersistentWorkflowAuthoring.ts',
    '../hooks/usePersistentWorkflowTaskPanel.ts'
  ].map(source).join('\n')
}
