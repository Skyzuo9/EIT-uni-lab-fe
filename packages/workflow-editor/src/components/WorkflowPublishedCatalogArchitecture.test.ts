import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const panelPath = fileURLToPath(new URL(
  './PersistentWorkflowAuthoringPanel.tsx',
  import.meta.url
))
const dagPath = fileURLToPath(new URL('./WorkflowDag.tsx', import.meta.url))

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

  it('enables child selection through the Published boundary insertion seam', () => {
    const source = readFileSync(panelPath, 'utf8')
    const workflowPicker = pickerLabel(source, '子工作流模板')

    expect(source).toContain('createPublishedWorkflowNode')
    expect(workflowPicker).not.toMatch(/<select[\s\S]*?\sdisabled(?:\s|>)/)
    expect(workflowPicker).toMatch(
      /disabled=\{[\s\S]*?busy[\s\S]*?canvasMutationEnabled[\s\S]*?graph[\s\S]*?\}/
    )
    expect(workflowPicker).toMatch(
      /onChange=\{[\s\S]*?addPublishedWorkflowNode\(event\.target\.value\)/
    )
    expect(source).toContain('globalThis.crypto.randomUUID()')
  })

  it('renders OS diagnostic code and message without frontend replacement', () => {
    const source = readFileSync(panelPath, 'utf8')

    expect(source).toContain('<code>{diagnostic.code}</code>')
    expect(source).toContain('<span>{diagnostic.message}</span>')
    expect(source).not.toMatch(/composite_[a-z_]+\s*:\s*['"`]/)
  })

  it('keeps Composite expansion session-only and resets it on OS graph identity changes', () => {
    const source = readFileSync(dagPath, 'utf8')
    const toggle = functionBody(source, 'const toggleGroup')

    expect(source).toContain('projectNestedWorkflow(nodes, links, expandedGroupIds)')
    expect(source).toMatch(
      /groupSignature[\s\S]*?node\.compositeSignature/
    )
    expect(source).toMatch(
      /useEffect\(\(\) => \{\s*setExpandedGroupIds\(new Set\(\)\)\s*\}, \[groupSignature\]\)/
    )
    expect(toggle).toContain('setExpandedGroupIds')
    expect(toggle).not.toMatch(
      /onConnect|onGraphChange|fetch|runtime\.|setNodes|setEdges/
    )
  })

  it('keeps Catalog loading behind the runtime without a Published-specific loader', () => {
    const source = readFileSync(panelPath, 'utf8')
    const catalogMethods = [...source.matchAll(
      /runtime\.(getWorkflow[A-Za-z]+Catalog)\(/g
    )].map((match) => match[1])

    expect(catalogMethods.length).toBeGreaterThan(0)
    expect(new Set(catalogMethods)).toEqual(new Set([
      'getWorkflowActionCatalog',
      'getWorkflowMaterialSourceCatalog'
    ]))
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

function functionBody(source: string, declaration: string): string {
  const start = source.indexOf(declaration)
  expect(start, `${declaration} must exist`).toBeGreaterThanOrEqual(0)
  const tail = source.slice(start)
  const end = tail.indexOf('\n  }, [])')
  expect(end, `${declaration} must remain a local callback`).toBeGreaterThan(0)
  return tail.slice(0, end)
}
