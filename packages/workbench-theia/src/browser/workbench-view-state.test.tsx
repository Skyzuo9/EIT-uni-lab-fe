import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

import { DomainEntryPanel } from './domain-entry-panel'
import { WorkbenchDomainLayout } from './workbench-domain-layout'
import {
  parseWorkbenchViewMode,
  WorkbenchViewState
} from './workbench-view-state'

describe('Workbench domain view presentation', () => {
  it('restores only known shareable view modes', () => {
    expect(parseWorkbenchViewMode('split')).toBe('split')
    expect(parseWorkbenchViewMode('device-material')).toBe('device-material')
    expect(parseWorkbenchViewMode('material-device')).toBe('material-device')
    expect(parseWorkbenchViewMode('spatial-shadow')).toBe('spatial-shadow')
    expect(parseWorkbenchViewMode('legacy-split')).toBeNull()
  })

  it('opens spatial shadow as an exclusive first-class domain', () => {
    const state = new WorkbenchViewState()
    state.toggle('spatial-shadow')

    expect(state.currentMode).toBe('spatial-shadow')
    expect(state.isVisible('spatial-shadow')).toBe(true)
    expect(state.isVisible('workflow')).toBe(false)
    expect(state.isVisible('material')).toBe(false)
  })

  it('derives split layout from independent workflow and material toggles', () => {
    const state = new WorkbenchViewState()
    const listener = vi.fn()
    state.onDidChangeMode(listener)

    state.toggle('material')
    state.toggle('workflow')
    state.toggle('workflow')
    state.toggle('material')

    expect(listener.mock.calls).toEqual([
      ['split'],
      ['material'],
      ['split'],
      ['workflow']
    ])
    expect(state.currentMode).toBe('workflow')
    expect(state.isVisible('workflow')).toBe(true)
    expect(state.isVisible('material')).toBe(false)
  })

  it('allows instruments and materials to share the Workbench main area', () => {
    const state = new WorkbenchViewState()

    state.toggle('material')
    state.toggle('device')
    expect(state.currentMode).toBe('device-material')
    expect(state.isVisible('device')).toBe(true)
    expect(state.isVisible('material')).toBe(true)
    expect(state.isVisible('workflow')).toBe(false)
    state.toggle('device')

    expect(state.currentMode).toBe('material')
    expect(state.isVisible('device')).toBe(false)
    expect(state.isVisible('material')).toBe(true)
  })

  it('lets either side of the instrument and material split remain open', () => {
    const state = new WorkbenchViewState()
    const listener = vi.fn()
    state.onDidChangeMode(listener)

    state.toggle('material')
    expect(state.currentMode).toBe('split')

    state.toggle('device')
    expect(state.currentMode).toBe('device-material')

    state.toggle('material')
    expect(state.currentMode).toBe('device')
    expect(state.isVisible('material')).toBe(false)
    expect(state.isVisible('workflow')).toBe(false)
    expect(state.isVisible('device')).toBe(true)
    expect(listener.mock.calls).toEqual([
      ['split'],
      ['device-material'],
      ['device']
    ])
  })

  it('keeps material beside robot debug while other robot functions stay exclusive', () => {
    const state = new WorkbenchViewState()

    state.toggle('material')
    state.toggle('robot-debug')

    expect(state.currentMode).toBe('material-robot-debug')
    expect(state.isVisible('robot-debug')).toBe(true)
    expect(state.isVisible('material')).toBe(true)
    expect(state.isVisible('device')).toBe(false)

    state.toggle('robot-points')
    expect(state.currentMode).toBe('robot-points')
    expect(state.isVisible('robot-debug')).toBe(false)
    expect(state.isVisible('robot-points')).toBe(true)

    state.toggle('robot-points')
    expect(state.currentMode).toBe('robot-points')
  })

  it('never deactivates the only active sidebar domain', () => {
    const state = new WorkbenchViewState()
    const listener = vi.fn()
    state.onDidChangeMode(listener)

    state.toggle('workflow')
    expect(state.currentMode).toBe('workflow')

    state.toggle('material')
    state.toggle('workflow')
    expect(state.currentMode).toBe('material')
    state.toggle('material')
    expect(state.currentMode).toBe('material')

    state.toggle('device')
    state.toggle('device')
    expect(state.currentMode).toBe('material')
    expect(listener.mock.calls).toEqual([
      ['split'],
      ['material'],
      ['device-material'],
      ['material']
    ])
  })

  it('renders material and robot debug as two resizable surfaces', () => {
    const markup = renderToStaticMarkup(
      <WorkbenchDomainLayout
        mode="material-robot-debug"
        workflow={<section data-testid="workflow-surface" />}
        material={<section data-testid="material-surface" />}
        device={<section data-testid="device-surface" />}
        robotWorkstation={<section data-testid="robot-workstation-surface" />}
      />
    )

    expect(markup).toContain('data-workbench-view="material-robot-debug"')
    expect(markup).toContain('data-testid="material-surface"')
    expect(markup).toContain('data-testid="robot-workstation-surface"')
    expect(markup).toContain('调整物料与机械臂调试窗口宽度')
    expect(markup.indexOf('data-testid="robot-workstation-surface"'))
      .toBeLessThan(markup.indexOf('role="separator"'))
    expect(markup.indexOf('role="separator"'))
      .toBeLessThan(markup.indexOf('data-testid="material-surface"'))
  })

  it('renders instruments and material as two resizable surfaces', () => {
    const markup = renderToStaticMarkup(
      <WorkbenchDomainLayout
        mode="material-device"
        workflow={<section data-testid="workflow-surface" />}
        material={<section data-testid="material-surface" />}
        device={<section data-testid="device-surface" />}
        robotWorkstation={<section data-testid="robot-workstation-surface" />}
      />
    )

    expect(markup).toContain('data-workbench-view="material-device"')
    expect(markup).toContain('data-testid="device-surface"')
    expect(markup).toContain('data-testid="material-surface"')
    expect(markup).toContain('调整仪器设备与物料窗口宽度')
    expect(markup.indexOf('data-testid="device-surface"'))
      .toBeLessThan(markup.indexOf('role="separator"'))
    expect(markup.indexOf('role="separator"'))
      .toBeLessThan(markup.indexOf('data-testid="material-surface"'))
  })

  it('presents an instrument entry without nesting the other domains', () => {
    const markup = renderToStaticMarkup(
      <DomainEntryPanel
        entry={{
          mode: 'device',
          label: '仪器设备',
          caption: '仪器设备',
          description: '读取 OS 上报的设备动作。',
          iconClass: 'codicon-tools',
          eyebrow: 'DEVICE'
        }}
        active
        onOpen={vi.fn()}
      />
    )

    expect(markup).toContain('data-domain-entry="device"')
    expect(markup).toContain('仪器设备')
    expect(markup).toContain('已在主区打开')
    expect(markup).not.toContain('左右并排')
  })

  it('renders two shared-state surfaces and an accessible splitter', () => {
    const markup = renderToStaticMarkup(
      <WorkbenchDomainLayout
        mode="split"
        workflow={<section data-testid="workflow-surface" />}
        material={<section data-testid="material-surface" />}
        device={<section data-testid="device-surface" />}
        robotWorkstation={<section data-testid="robot-workstation-surface" />}
      />
    )

    expect(markup).toContain('data-workbench-view="split"')
    expect(markup).toContain('data-testid="workflow-surface"')
    expect(markup).toContain('data-testid="material-surface"')
    expect(markup).toContain('role="separator"')
    expect(markup).toContain('aria-valuenow="55"')
  })

  it('keeps inactive domains mounted, sized and non-interactive', () => {
    const markup = renderToStaticMarkup(
      <WorkbenchDomainLayout
        mode="material"
        workflow={<section data-testid="workflow-surface" />}
        material={<section data-testid="material-surface" />}
        device={<section data-testid="device-surface" />}
        robotWorkstation={<section data-testid="robot-workstation-surface" />}
      />
    )

    expect(markup).toContain('data-testid="workflow-surface"')
    expect(markup).toContain('data-testid="material-surface"')
    expect(markup).toContain('data-testid="device-surface"')
    expect(markup).toContain('data-testid="robot-workstation-surface"')
    expect(markup).toContain('role="separator"')
    expect(markup).toContain(
      'class="unilab-workbench__domain-slot is-workflow is-inactive"'
    )
    expect(markup).toContain('aria-hidden="true" inert=""')
    expect(markup).toContain(
      'class="unilab-workbench__domain-slot is-material"'
    )
  })

  it('mounts the shared instrument panel as a first-class domain', () => {
    const markup = renderToStaticMarkup(
      <WorkbenchDomainLayout
        mode="device"
        workflow={<section data-testid="workflow-surface" />}
        material={<section data-testid="material-surface" />}
        device={<section data-testid="device-surface" />}
        robotWorkstation={<section data-testid="robot-workstation-surface" />}
      />
    )

    expect(markup).toContain('data-workbench-view="device"')
    expect(markup).toContain('data-testid="device-surface"')
    expect(markup).toContain('data-testid="workflow-surface"')
    expect(markup).toContain('data-testid="material-surface"')
  })

  it('renders instruments and materials with an accessible splitter', () => {
    const markup = renderToStaticMarkup(
      <WorkbenchDomainLayout
        mode="device-material"
        workflow={<section data-testid="workflow-surface" />}
        material={<section data-testid="material-surface" />}
        device={<section data-testid="device-surface" />}
        robotWorkstation={<section data-testid="robot-workstation-surface" />}
      />
    )

    expect(markup).toContain('data-workbench-view="device-material"')
    expect(markup).toContain('data-testid="device-surface"')
    expect(markup).toContain('data-testid="material-surface"')
    expect(markup).toContain('aria-label="调整仪器设备与物料窗口宽度"')
    expect(markup).toContain('aria-valuenow="55"')
  })

  it('keeps graph hosts measurable and collapses the secondary pane when narrow', () => {
    const stylesheet = readFileSync(
      new URL('./style/workbench-domain-navigation.css', import.meta.url),
      'utf8'
    )

    expect(stylesheet).toMatch(
      /\.unilab-workbench__domain-layout\s*\{[^}]*min-width:\s*1px;[^}]*min-height:\s*1px;/s
    )
    expect(stylesheet).toMatch(
      /@container unilab-workbench \(max-width: 900px\)[\s\S]*\.unilab-workbench__domain-slot\.is-material[\s\S]*display:\s*none;/
    )
  })

  it('mounts the mechanical-arm modules inside the Workbench main area', () => {
    const markup = renderToStaticMarkup(
      <WorkbenchDomainLayout
        mode="robot-bench"
        workflow={<section data-testid="workflow-surface" />}
        material={<section data-testid="material-surface" />}
        device={<section data-testid="device-surface" />}
        robotWorkstation={<section data-testid="robot-workstation-surface" />}
      />
    )

    expect(markup).toContain('data-workbench-view="robot-bench"')
    expect(markup).toContain('data-testid="robot-workstation-surface"')
    expect(markup).not.toContain('aria-label="机械臂工作站侧栏"')
  })

  it('mounts the spatial shadow reviewer inside the Workbench main area', () => {
    const markup = renderToStaticMarkup(
      <WorkbenchDomainLayout
        mode="spatial-shadow"
        workflow={<section data-testid="workflow-surface" />}
        material={<section data-testid="material-surface" />}
        device={<section data-testid="device-surface" />}
        robotWorkstation={<section data-testid="robot-workstation-surface" />}
        spatialDiagnostics={<section data-testid="spatial-shadow-surface" />}
      />
    )

    expect(markup).toContain('data-workbench-view="spatial-shadow"')
    expect(markup).toContain('data-testid="spatial-shadow-surface"')
    expect(markup).toContain(
      'class="unilab-workbench__domain-slot is-spatial-diagnostics"'
    )
  })
})
