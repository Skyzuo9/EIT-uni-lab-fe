import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

function source(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')
}

describe('Workflow ResourceSlot application boundary', () => {
  it('threads a narrow readonly options port through the existing Workflow panels', () => {
    const workflowPanel = source('./WorkflowPanel.tsx')
    const authoringPanel = source('./PersistentWorkflowAuthoringPanel.tsx')

    expect(workflowPanel).toMatch(/WorkflowResourceSlotOptionsPort/)
    expect(workflowPanel).toMatch(/resourceSlotOptionsPort/)
    expect(authoringPanel).toMatch(/WorkflowResourceSlotOptionsPort/)
    expect(authoringPanel).toMatch(/resourceSlotOptionsPort/)
    expect(authoringPanel).toMatch(/loadWorkflowResourceSlotOptions/)
  })

  it('keeps workflow-editor free of Material HTTP and Material-store authority', () => {
    const production = [
      source('./WorkflowPanel.tsx'),
      source('./PersistentWorkflowAuthoringPanel.tsx'),
      source('./WorkflowTaskInputForm.tsx'),
      source('../utils/workflowTaskInputForm.ts')
    ].join('\n')

    expect(production).not.toMatch(/\/api\/v1\/materials/i)
    expect(production).not.toMatch(/\bfetch\s*\(/)
    expect(production).not.toMatch(/useMaterialStore|MaterialStoreProvider/)
  })

  it('composes options in kernel-web from current scope and services.materials', () => {
    const adapter = source(
      '../../../../apps/kernel-web/src/integrations/lab-workbench/panelAdapter.tsx'
    )

    expect(adapter).toMatch(/WorkflowRenderer[\s\S]*useMaterialRuntime\s*\(/)
    expect(adapter).toMatch(/services\.materials\.getGraph\s*\(/)
    expect(adapter).toMatch(/resourceSlotOptionsPort/)
    expect(adapter).toMatch(/material\.id/)
    expect(adapter).toMatch(/material\.sourceTemplateId/)
    expect(adapter).toMatch(/material\.name/)
  })
})
