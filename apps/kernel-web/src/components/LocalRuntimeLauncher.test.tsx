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
  message: '本地调试环境未启动',
  simulatorRunning: false,
  bridgeRunning: false,
  edgeRunning: false
}

const baseConfig: LocalRuntimeLaunchConfig = {
  graphPath: '/tmp/device.json',
  osProjectPath: '/tmp/Uni-Lab-OS',
  szlabProjectPath: '/tmp/Uni-Lab-SZLab',
  environmentPath: '/tmp/envs/unilab',
  simulatorProjectPath: '',
  startSimulator: true
}

describe('LocalRuntimeLauncher', () => {
  it('requires the simulator directory only when simulation is enabled', () => {
    expect(validateConfig(baseConfig).errors.simulatorProjectPath).toBeTruthy()
    expect(validateConfig({ ...baseConfig, startSimulator: false })).toEqual({
      valid: true,
      errors: {}
    })
  })

  it('allows project directories to be typed or selected from the system picker', () => {
    const config: LocalRuntimeLaunchConfig = {
      graphPath: '',
      osProjectPath: '',
      szlabProjectPath: '',
      environmentPath: '',
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
    expect(markup).toContain('Uni-Lab-SZLab 项目根目录')
    expect(markup).toContain('unilab Conda 环境目录')
    expect(markup).toContain('自动识别，或选择 Conda 环境目录')
    expect(markup).toContain('PLC-Sim 项目根目录')
    expect(markup).toContain('role="switch"')
    expect(markup).toContain('同时启动本地 OPC UA')
    expect(markup).toContain('id="runtime-environment-path" type="button"')
    expect(markup).toContain('id="runtime-graph-path" type="button"')
    expect(markup).toContain('id="runtime-os-path" type="text"')
    expect(markup).toContain('id="runtime-szlab-path" type="text"')
    expect(markup).toContain('id="runtime-simulator-path" type="text"')
    expect(markup.match(/<input/g)).toHaveLength(4)
    expect(markup).not.toContain('<input id="runtime-environment-path"')
    expect(markup).not.toContain('<input id="runtime-graph-path"')
    expect(markup).toContain('aria-label="Uni-Lab-OS 项目根目录：选择目录"')
    expect(markup).toContain('aria-label="Uni-Lab-SZLab 项目根目录：选择目录"')
    expect(markup).toContain('aria-label="PLC-Sim 项目根目录：选择目录"')
    expect(markup).not.toContain('start_local_edge_runtime.sh')
    expect(markup).toContain('OPC UA')
    expect(markup).toContain('SZLab Edge')
    expect(markup).not.toContain('Bridge')
  })

  it('disables simulator directory selection when simulation is off', () => {
    const config: LocalRuntimeLaunchConfig = {
      graphPath: '',
      osProjectPath: '',
      szlabProjectPath: '',
      environmentPath: '',
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
      /<input id="runtime-simulator-path"[^>]*disabled=""/
    )
    expect(markup).toMatch(
      /<button[^>]*disabled=""[^>]*aria-label="PLC-Sim 项目根目录：选择目录"/
    )
    expect(markup).toContain('未启用本地 OPC UA，无需选择')
  })

  it('shows SZLab Edge as starting while its internal service initializes', () => {
    const markup = renderToStaticMarkup(
      <LocalRuntimeDialog
        config={{ ...baseConfig, startSimulator: false }}
        snapshot={{
          ...idleSnapshot,
          phase: 'waiting_bridge',
          message: 'SZLab Edge 正在初始化本地服务…',
          bridgeRunning: true
        }}
        error={null}
        submitted={false}
        validation={validateConfig({ ...baseConfig, startSimulator: false })}
        active
        transitioning
        onChange={vi.fn()}
        onChoosePath={vi.fn()}
        onClose={vi.fn()}
        onStart={vi.fn()}
        onStop={vi.fn()}
        onOpenLogs={vi.fn()}
      />
    )

    expect(markup).toMatch(/data-status="starting"[^>]*>.*SZLab Edge/s)
    expect(markup).toContain('启动中')
    expect(markup).not.toContain('Bridge')
  })
})
