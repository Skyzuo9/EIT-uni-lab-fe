import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type {
  LocalRuntimeLaunchConfig,
  LocalRuntimeModeInfo,
  LocalRuntimeSnapshot
} from '../types/electron'
import {
  LocalRuntimeDialog,
  validateEdgeConfig,
  validateSimulatorConfig
} from './LocalRuntimeLauncher'

const managedConfig: LocalRuntimeLaunchConfig = {
  graphPath: '/opt/unilab/workspace/deployment/graphs/device.json',
  osProjectPath: '',
  szlabProjectPath: '/opt/unilab/workspace',
  environmentPath: '',
  simulatorProjectPath: '/opt/plc-sim',
  edgeCommandMode: 'generated',
  customEdgeCommand: {
    executable: '',
    workingDirectory: '',
    args: [],
    environment: []
  }
}
const runtimeInfo: LocalRuntimeModeInfo = {
  mode: 'managed',
  label: '内置 Runtime',
  runtimeVersion: '0.11.3'
}
const idleSnapshot: LocalRuntimeSnapshot = {
  phase: 'idle',
  message: 'PLC-Sim 与领域侧 Edge 均未启动',
  simulatorRunning: false,
  bridgeRunning: false,
  edgeRunning: false
}

/** 覆盖安装包内私有运行时（Runtime）的专属本地调试界面合同。 */
describe('LocalRuntimeLauncher managed mode', () => {
  /** 证明托管模式无需用户提供 Conda 环境或 OS 源码。 */
  it('uses the bundled Runtime without Conda or OS source fields', () => {
    expect(validateEdgeConfig(managedConfig, 'managed')).toEqual({
      valid: true,
      errors: {}
    })
    expect(validateSimulatorConfig(managedConfig, 'managed')).toEqual({
      valid: true,
      errors: {}
    })

    const markup = renderManagedDialog(idleSnapshot)
    expect(markup).toContain('内置 Runtime')
    expect(markup).toContain('0.11.3')
    expect(markup).not.toContain('unilab Conda 环境目录')
    expect(markup).not.toContain('Uni-Lab-OS 项目根目录')
    expect(markup).not.toContain('结构化启动模板')
    expect(markup).toContain('设备包由你决定是否运行')
  })

  /** 证明托管模式强制选择领域设备包和设备图。 */
  it('requires a workspace and graph while keeping PLC-Sim optional', () => {
    const validation = validateEdgeConfig({
      ...managedConfig,
      graphPath: '',
      szlabProjectPath: ''
    }, 'managed')

    expect(validation.errors.graphPath).toContain('设备图')
    expect(validation.errors.szlabProjectPath).toContain('领域项目')
    expect(renderManagedDialog(idleSnapshot)).toContain(
      'PLC-Sim 源码目录或已安装可执行文件'
    )
  })

  /** 证明 Edge 运行期间仍可独立启动 PLC-Sim 并触发设备包验收。 */
  it('keeps PLC control and package acceptance available with Edge running', () => {
    const markup = renderManagedDialog({
      ...idleSnapshot,
      phase: 'ready',
      message: '领域侧 Edge 已就绪',
      edgeRunning: true
    })
    const plcButton = markup.match(/<button[^>]*>启动 PLC<\/button>/)?.[0] ?? ''

    expect(plcButton).not.toContain('disabled')
    expect(markup).toContain('设备包验收：未验证')
    expect(markup).toContain('运行验收（完成后清理）')
  })
})

/** 渲染固定托管 Runtime 配置的本地环境弹窗。 */
function renderManagedDialog(snapshot: LocalRuntimeSnapshot): string {
  return renderToStaticMarkup(
    <LocalRuntimeDialog
      config={managedConfig}
      runtimeInfo={runtimeInfo}
      snapshot={snapshot}
      error={null}
      simulatorSubmitted={false}
      edgeSubmitted={false}
      resolvingGeneratedEdgeCommand={false}
      simulatorValidation={validateSimulatorConfig(managedConfig, 'managed')}
      edgeValidation={validateEdgeConfig(managedConfig, 'managed')}
      transitioning={false}
      onChange={vi.fn()}
      onChoosePath={vi.fn()}
      onClose={vi.fn()}
      onStartSimulator={vi.fn()}
      onStopSimulator={vi.fn()}
      onStartEdge={vi.fn()}
      onStopEdge={vi.fn()}
      onRunAcceptance={vi.fn()}
      onLoadGeneratedEdgeCommand={vi.fn()}
      logControl={<button type="button">查看日志</button>}
    />
  )
}
