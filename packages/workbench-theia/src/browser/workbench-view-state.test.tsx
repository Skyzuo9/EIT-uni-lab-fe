import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { DomainEntryPanel } from './domain-entry-panel'
import { WorkbenchDomainLayout } from './workbench-domain-layout'
import { WorkbenchViewState } from './workbench-view-state'

describe('Workbench domain view presentation', () => {
  it('publishes only real view-mode changes', () => {
    const state = new WorkbenchViewState()
    const listener = vi.fn()
    state.onDidChangeMode(listener)

    state.select('workflow')
    state.select('split')
    state.select('split')
    state.select('device')

    expect(listener.mock.calls).toEqual([['split'], ['device']])
    expect(state.currentMode).toBe('device')
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
      />
    )

    expect(markup).toContain('data-workbench-view="split"')
    expect(markup).toContain('data-testid="workflow-surface"')
    expect(markup).toContain('data-testid="material-surface"')
    expect(markup).toContain('role="separator"')
    expect(markup).toContain('aria-valuenow="55"')
  })

  it('mounts only the selected domain in a single-view layout', () => {
    const markup = renderToStaticMarkup(
      <WorkbenchDomainLayout
        mode="material"
        workflow={<section data-testid="workflow-surface" />}
        material={<section data-testid="material-surface" />}
        device={<section data-testid="device-surface" />}
      />
    )

    expect(markup).not.toContain('data-testid="workflow-surface"')
    expect(markup).toContain('data-testid="material-surface"')
    expect(markup).not.toContain('role="separator"')
  })

  it('mounts the shared instrument panel as a first-class domain', () => {
    const markup = renderToStaticMarkup(
      <WorkbenchDomainLayout
        mode="device"
        workflow={<section data-testid="workflow-surface" />}
        material={<section data-testid="material-surface" />}
        device={<section data-testid="device-surface" />}
      />
    )

    expect(markup).toContain('data-workbench-view="device"')
    expect(markup).toContain('data-testid="device-surface"')
    expect(markup).not.toContain('data-testid="workflow-surface"')
    expect(markup).not.toContain('data-testid="material-surface"')
  })
})
