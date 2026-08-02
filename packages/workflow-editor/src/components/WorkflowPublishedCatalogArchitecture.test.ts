import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const panelPath = fileURLToPath(new URL(
  './PersistentWorkflowAuthoringPanel.tsx',
  import.meta.url
))

describe('Published Workflow Catalog in the original Authoring panel', () => {
  it('renders separate Action and child Workflow pickers from one union snapshot', () => {
    const source = readFileSync(panelPath, 'utf8')
    const actionPicker = pickerLabel(source, 'Action 模板')
    const workflowPicker = pickerLabel(source, '子工作流模板')

    expect(actionPicker).toContain('actionTemplates.map')
    expect(actionPicker).toMatch(
      /<option key=\{template\.uuid\} value=\{template\.uuid\}>[\s\S]*?\{template\.displayName\}/
    )
    expect(workflowPicker).toContain('workflowTemplates.map')
    expect(workflowPicker).toMatch(
      /<option key=\{template\.uuid\} value=\{template\.uuid\}>[\s\S]*?\{template\.displayName\}/
    )
  })

  it('does not present the Published Workflow renderer owner as a device', () => {
    const workflowPicker = pickerLabel(
      readFileSync(panelPath, 'utf8'),
      '子工作流模板'
    )

    expect(workflowPicker).not.toMatch(
      /host_node|Host Node|resourceTemplate|device|设备/i
    )
    expect(workflowPicker).toContain('template.displayName')
    expect(workflowPicker).toContain('template.uuid')
  })

  it('does not add a component fetch, second Catalog loader, or profile branch', () => {
    const source = readFileSync(panelPath, 'utf8')
    const catalogMethods = [...source.matchAll(
      /runtime\.(getWorkflow[A-Za-z]+Catalog)\(/g
    )].map((match) => match[1])

    expect(catalogMethods.length).toBeGreaterThan(0)
    expect(new Set(catalogMethods).size).toBe(1)
    expect(source).not.toMatch(/\bfetch\s*\(/)
    expect(source).not.toContain('/api/v1/workflow-node-templates')
    expect(source).not.toMatch(/getPublishedWorkflowCatalog/)
    expect(source).not.toMatch(/loadPublishedWorkflowCatalog/)
    expect(source).not.toMatch(/\bprofile(?:Id|Kind|Name)?\b/i)
  })
})

function pickerLabel(source: string, label: string): string {
  const labels = [...source.matchAll(/<label\b[\s\S]*?<\/label>/g)]
  const value = labels.find((match) => match[0].includes(label))?.[0]
  expect(value, `${label} picker must remain in the original panel`).toBeTruthy()
  return value ?? ''
}
