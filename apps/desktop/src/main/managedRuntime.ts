import type { LocalRuntimeModeInfo } from '../shared/localRuntime'
import {
  ManagedRuntimeInstallation,
  type ManagedRuntimePaths
} from './managedRuntimeInstallation'
import {
  ManagedRuntimeSupervisorClient,
  type ManagedRuntimeSupervisorSnapshot,
  type ManagedSimulatorLaunch,
  type ManagedWorkerLaunch
} from './managedRuntimeSupervisor'

/** 把私有 Runtime 安装和 Supervisor 控制组合成 LocalRuntimeManager 的窄端口。 */
export class ManagedRuntime {
  private client: ManagedRuntimeSupervisorClient | null = null

  constructor(
    private readonly installation: ManagedRuntimeInstallation,
    private readonly supervisorStateDirectory: string
  ) {}

  getModeInfo(): Promise<LocalRuntimeModeInfo> {
    return this.installation.getModeInfo()
  }

  getRuntimePaths(): Promise<ManagedRuntimePaths> {
    return this.installation.ensureInstalled()
  }

  async startWorker(
    launch: ManagedWorkerLaunch
  ): Promise<ManagedRuntimeSupervisorSnapshot> {
    const client = await this.connectedClient()
    return client.startWorker(launch)
  }

  async stopWorker(): Promise<ManagedRuntimeSupervisorSnapshot> {
    const client = await this.connectedClient()
    return client.stopWorker()
  }

  async startSimulator(
    launch: ManagedSimulatorLaunch
  ): Promise<ManagedRuntimeSupervisorSnapshot> {
    const client = await this.connectedClient()
    return client.startSimulator(launch)
  }

  async stopSimulator(): Promise<ManagedRuntimeSupervisorSnapshot> {
    const client = await this.connectedClient()
    return client.stopSimulator()
  }

  private async connectedClient(): Promise<ManagedRuntimeSupervisorClient> {
    const paths = await this.installation.ensureInstalled()
    this.client ??= new ManagedRuntimeSupervisorClient({
      supervisorExecutable: paths.supervisorExecutable,
      runtimePrefix: paths.prefix,
      stateDirectory: this.supervisorStateDirectory
    })
    await this.client.connect()
    return this.client
  }
}
