import type { BackendApplicationContribution } from '@theia/core/lib/node'
import { ILogger } from '@theia/core/lib/common/logger'
import type { Disposable } from '@theia/core/lib/common/disposable'
import { inject, injectable } from '@theia/core/shared/inversify'
import {
  createManagedLocalWorkbenchSession,
  type WorkbenchSession
} from '@unilab/workbench-session'

import type {
  WorkbenchSessionClient,
  WorkbenchSessionServer
} from '../common/workbench-session-protocol'

@injectable()
export class WorkbenchSessionService
implements WorkbenchSessionServer, BackendApplicationContribution {
  @inject(ILogger)
  private readonly logger!: ILogger

  private readonly session: WorkbenchSession =
    createManagedLocalWorkbenchSession({
      workspacePath: process.env['THEIA_WORKSPACE'] ?? '',
      osProjectPath: process.env['UNILAB_OS_PROJECT'],
      environmentPath: process.env['UNILAB_PYTHON_ENV'],
      enableAgent: process.env['UNILAB_AGENT_ENABLED'] !== '0',
      agentAppPath: process.env['UNILAB_AIONUI_APP'],
      agentBrandIconPath: process.env['UNILAB_AGENT_ICON'],
      plcSimulatorProjectPath: process.env['UNILAB_PLC_SIM_PROJECT']
    })
  private sessionListener: Disposable | undefined

  onStart(): void {
    void this.session.start().catch(error => {
      this.logger.error('Managed-local Uni-Lab OS failed to start', error)
    })
  }

  onStop(): Promise<void> {
    return this.session.stopAll().then(() => undefined)
  }

  getSnapshot() {
    return Promise.resolve(this.session.getSnapshot())
  }

  start() {
    return this.session.start()
  }

  stop() {
    return this.session.stop()
  }

  restart() {
    return this.session.restart()
  }

  readLogTail(maxBytes?: number) {
    return this.session.readLogTail(maxBytes)
  }

  readEnvironmentLog(
    kind: Parameters<WorkbenchSession['readEnvironmentLog']>[0],
    maxBytes?: number
  ) {
    return this.session.readEnvironmentLog(kind, maxBytes)
  }

  configureGraph(graphPath: string) {
    return this.session.configureGraph(graphPath)
  }

  configurePlcSimulator(projectPath: string) {
    return this.session.configurePlcSimulator(projectPath)
  }

  startPlcSimulator() {
    return this.session.startPlcSimulator()
  }

  stopPlcSimulator() {
    return this.session.stopPlcSimulator()
  }

  setRuntimeMode(mode: Parameters<WorkbenchSession['setRuntimeMode']>[0]) {
    return this.session.setRuntimeMode(mode)
  }

  setClient(client: WorkbenchSessionClient): void {
    this.sessionListener?.dispose()
    this.sessionListener = this.session.onDidChange(snapshot => {
      client.onDidChange(snapshot)
    })
    client.onDidChange(this.session.getSnapshot())
  }
}
