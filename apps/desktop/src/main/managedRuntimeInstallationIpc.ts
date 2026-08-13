import type {
  BrowserWindow,
  IpcMain,
  IpcMainInvokeEvent
} from 'electron'

import {
  UNAVAILABLE_MANAGED_RUNTIME_INSTALLATION,
  type ManagedRuntimeInstallationSnapshot
} from '../shared/managedRuntimeInstallation'
import type { ManagedRuntimeInstallation } from './managedRuntimeInstallation'

interface ManagedRuntimeInstallationIpcOptions {
  ipcMain: IpcMain
  installation?: ManagedRuntimeInstallation
  discoverExistingEnvironment: () => Promise<string | null>
  assertSender: (event: IpcMainInvokeEvent) => void
  getMainWindow: () => BrowserWindow | null
  onEnvironmentReady: (environmentPath: string) => void
  log: (message: string) => void
}

/**
 * Electron 主进程拥有的 Runtime 安装控制面。Renderer 只能请求检查和安装，
 * 不能提供安装器、目标前缀或命令行参数。
 */
export class ManagedRuntimeInstallationController {
  private snapshot: ManagedRuntimeInstallationSnapshot =
    UNAVAILABLE_MANAGED_RUNTIME_INSTALLATION
  private pending: Promise<ManagedRuntimeInstallationSnapshot> | null = null
  private externalEnvironmentPath: string | null = null

  constructor(private readonly options: ManagedRuntimeInstallationIpcOptions) {}

  async initialize(): Promise<ManagedRuntimeInstallationSnapshot> {
    if (!this.options.installation) return this.snapshot
    try {
      const inspection = await this.options.installation.inspect()
      this.externalEnvironmentPath = await this.options.discoverExistingEnvironment()
      if (inspection.installed) {
        this.options.onEnvironmentReady(inspection.paths.prefix)
        return this.publish({
          phase: 'ready',
          bundled: true,
          managed: true,
          runtimeVersion: inspection.paths.runtimeVersion,
          platform: inspection.paths.platform,
          environmentPath: inspection.paths.prefix,
          availableEnvironments: this.environmentChoices(
            inspection.paths.prefix,
            inspection.paths.runtimeVersion
          ),
          error: null
        })
      }
      const existing = this.externalEnvironmentPath
      if (existing) {
        this.options.onEnvironmentReady(existing)
        return this.publish({
          phase: 'external',
          bundled: true,
          managed: false,
          runtimeVersion: inspection.paths.runtimeVersion,
          platform: inspection.paths.platform,
          environmentPath: existing,
          availableEnvironments: this.environmentChoices(null, null),
          error: null
        })
      }
      return this.publish({
        phase: 'not-installed',
        bundled: true,
        managed: false,
        runtimeVersion: inspection.paths.runtimeVersion,
        platform: inspection.paths.platform,
        environmentPath: null,
        availableEnvironments: [],
        error: null
      })
    } catch (error) {
      const message = errorMessage(error)
      this.options.log(`检查内置 Runtime 失败: ${message}`)
      const existing = await this.options.discoverExistingEnvironment()
        .catch(() => null)
      this.externalEnvironmentPath = existing
      if (existing) {
        this.options.onEnvironmentReady(existing)
        return this.publish({
          phase: 'external',
          bundled: true,
          managed: false,
          runtimeVersion: null,
          platform: null,
          environmentPath: existing,
          availableEnvironments: this.environmentChoices(null, null),
          error: message
        })
      }
      return this.publish({
        phase: 'failed',
        bundled: true,
        managed: false,
        runtimeVersion: null,
        platform: null,
        environmentPath: null,
        availableEnvironments: [],
        error: message
      })
    }
  }

  getSnapshot(): ManagedRuntimeInstallationSnapshot {
    return this.snapshot
  }

  install(): Promise<ManagedRuntimeInstallationSnapshot> {
    if (!this.options.installation) {
      return Promise.reject(new Error('当前应用没有内置 Runtime 安装载荷'))
    }
    this.pending ??= this.performInstall().finally(() => {
      this.pending = null
    })
    return this.pending
  }

  selectEnvironment(path: string): ManagedRuntimeInstallationSnapshot {
    const selected = this.snapshot.availableEnvironments.find(
      environment => environment.path === path
    )
    if (!selected) throw new Error('所选 UniLabOS 环境不可用，请刷新后重试')
    this.options.onEnvironmentReady(selected.path)
    return this.publish({
      ...this.snapshot,
      phase: selected.kind === 'managed' ? 'ready' : 'external',
      managed: selected.kind === 'managed',
      environmentPath: selected.path,
      error: null
    })
  }

  private async performInstall(): Promise<ManagedRuntimeInstallationSnapshot> {
    const previous = this.snapshot
    this.publish({
      ...previous,
      phase: 'installing',
      bundled: true,
      managed: false,
      environmentPath: null,
      error: null
    })
    try {
      const paths = await this.options.installation!.ensureInstalled()
      this.options.onEnvironmentReady(paths.prefix)
      return this.publish({
        phase: 'ready',
        bundled: true,
        managed: true,
        runtimeVersion: paths.runtimeVersion,
        platform: paths.platform,
        environmentPath: paths.prefix,
        availableEnvironments: this.environmentChoices(
          paths.prefix,
          paths.runtimeVersion
        ),
        error: null
      })
    } catch (error) {
      const message = errorMessage(error)
      this.options.log(`安装内置 Runtime 失败: ${message}`)
      this.publish({
        ...previous,
        phase: 'failed',
        bundled: true,
        managed: false,
        environmentPath: null,
        error: message
      })
      throw error
    }
  }

  private environmentChoices(
    managedPath: string | null,
    runtimeVersion: string | null
  ): ManagedRuntimeInstallationSnapshot['availableEnvironments'] {
    return [
      ...(managedPath ? [{
        kind: 'managed' as const,
        label: `内置 Runtime${runtimeVersion ? ` ${runtimeVersion}` : ''}`,
        path: managedPath
      }] : []),
      ...(this.externalEnvironmentPath && this.externalEnvironmentPath !== managedPath
        ? [{
            kind: 'external' as const,
            label: '本机 UniLab 环境',
            path: this.externalEnvironmentPath
          }]
        : [])
    ]
  }

  private publish(
    snapshot: ManagedRuntimeInstallationSnapshot
  ): ManagedRuntimeInstallationSnapshot {
    this.snapshot = Object.freeze({ ...snapshot })
    const window = this.options.getMainWindow()
    if (window && !window.isDestroyed()) {
      window.webContents.send('managed-runtime:snapshot', this.snapshot)
    }
    return this.snapshot
  }
}

export function registerManagedRuntimeInstallationIpc(
  options: ManagedRuntimeInstallationIpcOptions
): ManagedRuntimeInstallationController {
  const controller = new ManagedRuntimeInstallationController(options)
  options.ipcMain.handle('managed-runtime:getSnapshot', event => {
    options.assertSender(event)
    return controller.getSnapshot()
  })
  options.ipcMain.handle('managed-runtime:install', event => {
    options.assertSender(event)
    return controller.install()
  })
  options.ipcMain.handle('managed-runtime:selectEnvironment', (event, path: unknown) => {
    options.assertSender(event)
    if (typeof path !== 'string') throw new Error('UniLabOS 环境路径无效')
    return controller.selectEnvironment(path)
  })
  return controller
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
