import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { disconnect, reconnect, useWorkbench } = vi.hoisted(() => ({
  disconnect: vi.fn(),
  reconnect: vi.fn(),
  useWorkbench: vi.fn()
}))

vi.mock('../context/WorkbenchContext', () => ({
  useWorkbench
}))

vi.mock('../hooks/useBackendConnection', () => ({
  useBackendConnection: () => ({
    client: null,
    isOnline: true,
    disconnect,
    reconnect
  })
}))

import ConnectionBar from './ConnectionBar'

describe('ConnectionBar', () => {
  beforeEach(() => {
    useWorkbench.mockReturnValue({
      backend: {
        id: 'local-python',
        name: 'Local Python OS',
        serverKind: 'edge',
        apiUrl: 'http://127.0.0.1:8002'
      },
      backendEnabled: true,
      connection: 'connected',
      capabilityHealth: {
        devices: { status: 'ready', summary: '2 台设备' },
        materials: { status: 'ready', summary: '12 项物料' },
        workflows: { status: 'ready', summary: '18 个工作流' }
      },
      availableBackends: [
        {
          id: 'local-python',
          name: 'Local Python OS',
          serverKind: 'edge',
          apiUrl: 'http://127.0.0.1:8002'
        }
      ],
      selectBackend: vi.fn(),
      updateBackend: vi.fn(),
      setBackendEnabled: vi.fn(),
      requestRecovery: vi.fn()
    })
  })

  it('keeps the confirmed connection status visible', () => {
    const markup = renderToStaticMarkup(<ConnectionBar />)

    expect(markup).toContain('Edge 已连接')
    expect(markup).toContain('data-connection-state="connected"')
    expect(markup).toContain('aria-label="切换后端权威"')
    expect(markup).toContain('aria-label="后端权威 API 地址"')
    expect(markup).toContain('设备目录')
    expect(markup).toContain('物料图')
    expect(markup).toContain('工作流目录')
  })

  it('summarizes module failures without hiding the confirmed Edge connection', () => {
    useWorkbench.mockReturnValue({
      ...useWorkbench(),
      capabilityHealth: {
        ...useWorkbench().capabilityHealth,
        devices: {
          status: 'error',
          summary: '设备运行节点尚未就绪',
          technicalDetail: 'Host node not initialized'
        }
      }
    })

    const markup = renderToStaticMarkup(<ConnectionBar />)

    expect(markup).toContain('Edge 已连接 · 1 项待恢复')
    expect(markup).toContain('重连并重新读取')
    expect(markup).toContain('技术信息')
  })

  it('offers an explicit connection path while the managed Edge is idle', () => {
    useWorkbench.mockReturnValue({
      ...useWorkbench(),
      backendEnabled: false,
      connection: 'disconnected'
    })

    const markup = renderToStaticMarkup(<ConnectionBar />)

    expect(markup).toContain('Edge 未连接')
    expect(markup).toContain('>连接</button>')
  })
})
