import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type {
  LocalRuntimeLaunchConfig,
  LocalRuntimeLogsSnapshot,
  LocalRuntimeSnapshot
} from '../types/electron'
import {
  LocalRuntimeDialog,
  LocalRuntimeLogDrawer,
  validateEdgeConfig,
  validateSimulatorConfig
} from './LocalRuntimeLauncher'

const idleSnapshot: LocalRuntimeSnapshot = {
  phase: 'idle',
  message: 'PLC-Sim 与 SZLab Edge 均未启动',
  simulatorRunning: false,
  bridgeRunning: false,
  edgeRunning: false
}

const baseConfig: LocalRuntimeLaunchConfig = {
  graphPath: '/tmp/device.json',
  osProjectPath: '/tmp/Uni-Lab-OS',
  szlabProjectPath: '/tmp/Uni-Lab-SZLab',
  environmentPath: '/tmp/envs/unilab',
  simulatorProjectPath: '/tmp/PLC-Sim'
}

describe('LocalRuntimeLauncher', () => {
  it('validates PLC-Sim and Edge as independent launch forms', () => {
    expect(validateSimulatorConfig({
      ...baseConfig,
      simulatorProjectPath: ''
    }).errors.simulatorProjectPath).toBeTruthy()
    expect(validateEdgeConfig({
      ...baseConfig,
      simulatorProjectPath: ''
    })).toEqual({ valid: true, errors: {} })
    expect(validateSimulatorConfig({
      ...baseConfig,
      graphPath: '',
      osProjectPath: '',
      szlabProjectPath: ''
    })).toEqual({ valid: true, errors: {} })
  })

  it('renders separate PLC and Edge controls with the variable-table reminder', () => {
    const markup = renderDialog(baseConfig, idleSnapshot)
    const headerMarkup = markup.match(/<header[^>]*>.*?<\/header>/s)?.[0] ?? ''
    const footerMarkup = markup.match(/<footer[^>]*>.*?<\/footer>/s)?.[0] ?? ''

    expect(markup).toContain('PLC-Sim（可选）')
    expect(markup).toContain('SZLab Edge')
    expect(markup).toContain('启动 PLC')
    expect(markup).toContain('启动 Edge')
    expect(markup).toContain('使用 PLC 时，请先上传变量表')
    expect(markup).toContain(
      '先启动 PLC-Sim，在 PLC-Sim 中上传 PLC 变量表，确认完成后再启动 SZLab Edge。'
    )
    expect(markup).not.toContain('同时启动本地 OPC UA')
    expect(markup).not.toContain('Bridge')
    expect(markup).toContain('id="runtime-environment-path" type="button"')
    expect(markup).toContain('id="runtime-graph-path" type="button"')
    expect(markup).toContain('id="runtime-os-path" type="text"')
    expect(markup).toContain('id="runtime-szlab-path" type="text"')
    expect(markup).toContain('id="runtime-simulator-path" type="text"')
    expect(markup.match(/<input/g)).toHaveLength(3)
    expect(headerMarkup).toContain('查看日志')
    expect(footerMarkup).not.toContain('查看日志')
  })

  it('keeps Edge available after PLC starts and reminds the user to upload variables', () => {
    const markup = renderDialog(baseConfig, {
      ...idleSnapshot,
      phase: 'simulator_ready',
      message: 'PLC-Sim 已就绪；请上传 PLC 变量表后再启动 SZLab Edge',
      simulatorRunning: true
    })

    expect(markup).toContain('停止 PLC')
    expect(markup).toContain('启动 Edge')
    expect(markup).toContain('请上传 PLC 变量表后再启动 SZLab Edge')
    expect(markup).toMatch(/data-status="running"[^>]*>.*PLC-Sim/s)
    expect(markup).toMatch(/data-status="idle"[^>]*>.*SZLab Edge/s)
  })

  it('prevents PLC changes while Edge is running', () => {
    const markup = renderDialog(baseConfig, {
      ...idleSnapshot,
      phase: 'ready',
      message: 'PLC-Sim 与 SZLab Edge 已就绪',
      simulatorRunning: true,
      bridgeRunning: true,
      edgeRunning: true
    })

    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>停止 PLC<\/button>/)
    expect(markup).toContain('停止 Edge')
    expect(markup.match(/>运行中<\/span>/g)).toHaveLength(2)
  })

  it('shows Edge as starting while its internal service initializes', () => {
    const markup = renderDialog(baseConfig, {
      ...idleSnapshot,
      phase: 'waiting_bridge',
      message: 'SZLab Edge 正在初始化本地服务…',
      bridgeRunning: true
    })

    expect(markup).toMatch(/data-status="starting"[^>]*>.*SZLab Edge/s)
    expect(markup).toContain('正在启动…')
    expect(markup).not.toContain('Bridge')
  })

  it('renders process output directly in the log drawer', () => {
    const logsSnapshot: LocalRuntimeLogsSnapshot = {
      readAt: 1_785_499_200_000,
      entries: [
        {
          kind: 'simulator',
          content: 'OPC UA ready on 127.0.0.1:18765',
          available: true,
          truncated: false
        },
        {
          kind: 'bridge',
          content: 'Edge service ready',
          available: true,
          truncated: false
        },
        {
          kind: 'edge',
          content: 'latest edge output',
          available: true,
          truncated: true
        }
      ]
    }

    const markup = renderToStaticMarkup(
      <LocalRuntimeLogDrawer
        snapshot={logsSnapshot}
        activeKind="edge"
        loading={false}
        error={null}
        onSelect={vi.fn()}
        onRefresh={vi.fn()}
        onClose={vi.fn()}
      />
    )

    expect(markup).toContain('本地运行日志')
    expect(markup).toContain('PLC-Sim')
    expect(markup).toContain('Edge 服务')
    expect(markup).toContain('Edge 运行时')
    expect(markup).toContain('latest edge output')
    expect(markup).toContain('当前展示最新 128 KB')
    expect(markup).not.toContain('>Bridge<')
  })
})

function renderDialog(
  config: LocalRuntimeLaunchConfig,
  snapshot: LocalRuntimeSnapshot
): string {
  const transitioning = ![
    'idle',
    'simulator_ready',
    'ready',
    'failed'
  ].includes(snapshot.phase)
  return renderToStaticMarkup(
    <LocalRuntimeDialog
      config={config}
      snapshot={snapshot}
      error={null}
      simulatorSubmitted={false}
      edgeSubmitted={false}
      simulatorValidation={validateSimulatorConfig(config)}
      edgeValidation={validateEdgeConfig(config)}
      transitioning={transitioning}
      onChange={vi.fn()}
      onChoosePath={vi.fn()}
      onClose={vi.fn()}
      onStartSimulator={vi.fn()}
      onStopSimulator={vi.fn()}
      onStartEdge={vi.fn()}
      onStopEdge={vi.fn()}
      logControl={<button type="button">查看日志</button>}
    />
  )
}
