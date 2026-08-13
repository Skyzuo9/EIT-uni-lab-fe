import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import {
  captureWorkbenchUiOperation,
  WorkbenchSessionGate
} from './workbench-session-gate'

describe('WorkbenchSessionGate', () => {
  it('turns a rejected UI operation into a visible error value', async () => {
    const errors: string[] = []

    await expect(captureWorkbenchUiOperation(
      async () => { throw new Error('fixture operation failed') },
      message => errors.push(message)
    )).resolves.toBeUndefined()

    expect(errors).toEqual(['fixture operation failed'])
  })

  it('keeps environment management reachable while OS readiness is blocked', () => {
    const markup = renderToStaticMarkup(
      <WorkbenchSessionGate
        snapshot={{
          phase: 'failed',
          message: 'PLC 连接失败，Uni-Lab OS 未就绪',
          configuredGraphPath: 'deployment/graphs/szlab-local-debug.json',
          configuredExternalDevicesOnly: true,
          configuredRuntimeMode: 'normal',
          agent: null,
          identity: {
            workspacePath: '/workspace',
            osProjectPath: '/os',
            osRuntimeSource: 'checkout',
            environmentPath: '/python',
            graphPath: '/workspace/deployment/graphs/szlab-local-debug.json',
            graphFingerprint: 'graph',
            mode: 'normal',
            pid: 42,
            generation: 'generation',
            backendUrl: 'http://127.0.0.1:18103',
            logPath: '/workspace/.unilabos/logs/workbench/os.log',
            packageMounts: {
              schemaVersion: 'workspace-package-mounts/v1',
              editablePackageId: 'szlab',
              dependencyRevision: 'dependencies',
              catalogRevision: 'catalog',
              mountRevision: 'mounts',
              items: []
            },
            agent: null
          },
          diagnostic: {
            code: 'plc_connection_failed',
            message: '无法解析 PLC 的 OPC UA 主机名，OS 设备目录未完成初始化。',
            recovery: '检查设备图中的 PLC OPC UA 地址后重试'
          },
          plcSimulator: {
            phase: 'idle',
            message: 'PLC-Sim 未启动',
            diagnostic: null,
            projectPath: '/workspace/PLC-Sim',
            variableTablePath: '/workspace/devices/plc/table.csv',
            variableTableCandidates: [],
            handshakeProfile: 'szlab',
            guiUrl: 'http://127.0.0.1:8080',
            opcUaUrl: 'opc.tcp://127.0.0.1:4840',
            pid: null,
            logPath: '/workspace/.unilabos/logs/plc-sim.log'
          }
        }}
        onRetry={vi.fn()}
        onStop={vi.fn()}
        onOpenLog={vi.fn()}
        renderEnvironmentManager={onClose => (
          <section aria-label="环境管理">
            <button onClick={onClose}>关闭</button>
            <button>启动 PLC-Sim</button>
          </section>
        )}
      />
    )

    expect(markup).toContain('环境管理')
    expect(markup).toContain('启动 PLC-Sim')
    expect(markup).toContain('PLC 连接失败')
    expect(markup).toContain('无法解析 PLC 的 OPC UA 主机名')
    expect(markup).toContain('建议：')
    expect(markup).toContain('诊断代码：plc_connection_failed')
    expect(markup).toContain('unilab-workbench-session-actions')
    expect(markup).toContain('class="is-primary"')
    expect(markup).toContain('codicon-settings-gear')
    expect(markup).toContain('在编辑器中打开日志文件')
    expect(markup).toContain('/workspace/.unilabos/logs/workbench/os.log')
  })

  it('covers the workbench with startup progress while the session starts', () => {
    const markup = renderToStaticMarkup(
      <WorkbenchSessionGate
        snapshot={{
          phase: 'starting',
          message: '正在校验工作区并启动 Uni-Lab OS…',
          configuredGraphPath: 'deployment/graphs/szlab-local-debug.json',
          configuredExternalDevicesOnly: true,
          configuredRuntimeMode: 'normal',
          agent: null,
          identity: null,
          diagnostic: null,
          plcSimulator: {
            phase: 'idle',
            message: 'PLC-Sim 未启动',
            diagnostic: null,
            projectPath: '/workspace/PLC-Sim',
            variableTablePath: '/workspace/devices/plc/table.csv',
            variableTableCandidates: [],
            handshakeProfile: 'szlab',
            guiUrl: 'http://127.0.0.1:8080',
            opcUaUrl: 'opc.tcp://127.0.0.1:4840',
            pid: null,
            logPath: '/workspace/.unilabos/logs/plc-sim.log'
          }
        }}
        onRetry={vi.fn()}
        onStop={vi.fn()}
        renderEnvironmentManager={() => null}
      />
    )

    expect(markup).toContain('unilab-workbench-session-loading')
    expect(markup).toContain('正在启动 Unilab 调试工作台')
    expect(markup).toContain('取消启动')
  })
})
