import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type {
  LocalRuntimeLaunchConfig,
  LocalRuntimeSnapshot
} from '../types/electron'
import {
  LocalRuntimeDialog,
  validateConfig
} from './LocalRuntimeLauncher'

const idleSnapshot: LocalRuntimeSnapshot = {
  phase: 'idle',
  message: '本地环境未启动',
  simulatorRunning: false,
  edgeRunning: false
}

describe('LocalRuntimeLauncher', () => {
  it('requires the simulator directory only when simulation is enabled', () => {
    const base: LocalRuntimeLaunchConfig = {
      graphPath: '/tmp/device.json',
      osProjectPath: '/tmp/Uni-Lab-OS',
      simulatorProjectPath: '',
      startSimulator: true
    }

    expect(validateConfig(base).errors.simulatorProjectPath).toBeTruthy()
    expect(validateConfig({ ...base, startSimulator: false })).toEqual({
      valid: true,
      errors: {}
    })
  })

  it('renders all paths as system picker buttons and no editable text fields', () => {
    const config: LocalRuntimeLaunchConfig = {
      graphPath: '',
      osProjectPath: '',
      simulatorProjectPath: '',
      startSimulator: true
    }
    const markup = renderToStaticMarkup(
      <LocalRuntimeDialog
        config={config}
        snapshot={idleSnapshot}
        error={null}
        submitted={false}
        validation={validateConfig(config)}
        active={false}
        transitioning={false}
        onChange={vi.fn()}
        onChoosePath={vi.fn()}
        onClose={vi.fn()}
        onStart={vi.fn()}
        onStop={vi.fn()}
        onOpenLogs={vi.fn()}
      />
    )

    expect(markup).toContain('设备图 JSON')
    expect(markup).toContain('Uni-Lab-OS 项目根目录')
    expect(markup).toContain('OPC 仿真项目目录')
    expect(markup).toContain('role="switch"')
    expect(markup).toContain('同时启动 OPC 仿真器')
    expect(markup).toContain('id="runtime-graph-path" type="button"')
    expect(markup).toContain('id="runtime-os-path" type="button"')
    expect(markup).toContain('id="runtime-simulator-path" type="button"')
    expect(markup.match(/<input/g)).toHaveLength(1)
    expect(markup).not.toContain('<input id="runtime-')
    expect(markup).not.toContain('start_local_edge_runtime.sh')
  })

  it('disables simulator directory selection when simulation is off', () => {
    const config: LocalRuntimeLaunchConfig = {
      graphPath: '',
      osProjectPath: '',
      simulatorProjectPath: '',
      startSimulator: false
    }
    const markup = renderToStaticMarkup(
      <LocalRuntimeDialog
        config={config}
        snapshot={idleSnapshot}
        error={null}
        submitted={false}
        validation={validateConfig(config)}
        active={false}
        transitioning={false}
        onChange={vi.fn()}
        onChoosePath={vi.fn()}
        onClose={vi.fn()}
        onStart={vi.fn()}
        onStop={vi.fn()}
        onOpenLogs={vi.fn()}
      />
    )

    expect(markup).toMatch(
      /<button id="runtime-simulator-path"[^>]*disabled=""/
    )
    expect(markup).toContain('未启用仿真，无需选择')
  })
})
