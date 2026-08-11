import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { BrowserWindow, IpcMain } from 'electron'

import {
  DeviceCardAgentBridge,
  deviceCardAgentEndpoint
} from './deviceCardAgentBridge'
import { DeviceCardAgentCliManager } from './deviceCardAgentCli'
import type { DeviceCardManager } from './deviceCardManager'

interface DeviceCardAgentEnvironmentOptions {
  ipcMain: IpcMain
  deviceCardManager: DeviceCardManager
  userDataPath: string
  resourcesPath: string
  processExecutable: string
  isPackaged: boolean
  baseDirectory: string
  getMainWindow: () => BrowserWindow | null
  log: (message: string) => void
}

/** 管理设备卡 Agent Bridge 与 CLI 的同生命周期装配。 */
export class DeviceCardAgentEnvironment {
  private readonly agentRoot: string
  private readonly bridge: DeviceCardAgentBridge
  private readonly cli: DeviceCardAgentCliManager

  constructor(private readonly options: DeviceCardAgentEnvironmentOptions) {
    this.agentRoot = join(
      options.userDataPath,
      'device-cards',
      'agent'
    )
    this.bridge = new DeviceCardAgentBridge({
      automation: options.deviceCardManager.authoring,
      agentRoot: this.agentRoot,
      endpoint: deviceCardAgentEndpoint(options.userDataPath),
      log: options.log
    })
    const cliPath = options.isPackaged
      ? join(options.resourcesPath, 'device-card-agent', 'cli.mjs')
      : join(
          options.baseDirectory,
          '../../../../packages/device-card-agent-cli/dist/cli.mjs'
        )
    this.cli = new DeviceCardAgentCliManager({
      cliPath,
      descriptorPath: this.bridge.descriptorPath,
      electronExecutable: options.processExecutable
    })
  }

  /** 按持久化开关启动 Bridge，并注册受主渲染器保护的 IPC。 */
  async start(): Promise<void> {
    if (await this.readBridgeEnabled()) await this.bridge.start()
    this.registerIpc()
  }

  /** 停止 Agent Bridge，供应用退出阶段安全收口。 */
  async stop(): Promise<void> {
    await this.bridge.stop()
  }

  /** 注册 Agent 环境查询、CLI 安装和 Bridge 开关 IPC。 */
  private registerIpc(): void {
    const { ipcMain } = this.options
    ipcMain.handle('device-cards:agent:getInfo', (event) => {
      this.assertMainRenderer(event.sender.id)
      return this.getInfo()
    })
    ipcMain.handle('device-cards:agent:installCli', async (event) => {
      this.assertMainRenderer(event.sender.id)
      await this.cli.install()
      return this.getInfo()
    })
    ipcMain.handle('device-cards:agent:removeCli', async (event) => {
      this.assertMainRenderer(event.sender.id)
      await this.cli.remove()
      return this.getInfo()
    })
    ipcMain.handle(
      'device-cards:agent:setBridgeEnabled',
      async (event, enabled: unknown) => {
        this.assertMainRenderer(event.sender.id)
        if (typeof enabled !== 'boolean') {
          throw new Error('Agent Bridge enabled 参数无效。')
        }
        if (enabled) await this.bridge.start()
        else await this.bridge.stop()
        await this.writeBridgeEnabled(enabled)
        return this.getInfo()
      }
    )
  }

  /** 汇总 CLI、Bridge 与最近自动化请求，供设置界面展示。 */
  private async getInfo() {
    const info = await this.cli.getInfo(this.bridge.getInfo().enabled)
    return {
      ...info,
      recentRequests: this.bridge.getRecentRequests()
    }
  }

  /** 验证 Agent IPC 只能由当前主窗口的渲染进程调用。 */
  private assertMainRenderer(senderId: number): void {
    const window = this.options.getMainWindow()
    if (!window || window.isDestroyed() || senderId !== window.webContents.id) {
      throw new Error('IPC 调用方不是主渲染进程。')
    }
  }

  /** 读取 Bridge 持久化开关；缺失或损坏时保持默认启用。 */
  private async readBridgeEnabled(): Promise<boolean> {
    try {
      const settings = JSON.parse(
        await readFile(join(this.agentRoot, 'settings.json'), 'utf8')
      ) as { enabled?: unknown }
      return settings.enabled !== false
    } catch {
      return true
    }
  }

  /** 以用户私有权限原子覆盖 Bridge 开关配置。 */
  private async writeBridgeEnabled(enabled: boolean): Promise<void> {
    await mkdir(this.agentRoot, { recursive: true, mode: 0o700 })
    await writeFile(
      join(this.agentRoot, 'settings.json'),
      `${JSON.stringify({ enabled }, null, 2)}\n`,
      { encoding: 'utf8', mode: 0o600 }
    )
  }
}
