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
      environmentPath: process.env['UNILAB_PYTHON_ENV']
    })
  private sessionListener: Disposable | undefined

  onStart(): void {
    void this.session.start().catch(error => {
      this.logger.error('Managed-local Uni-Lab OS failed to start', error)
    })
  }

  onStop(): Promise<void> {
    return this.session.stop().then(() => undefined)
  }

  getSnapshot() {
    return Promise.resolve(this.session.getSnapshot())
  }

  start() {
    return this.session.start()
  }

  setClient(client: WorkbenchSessionClient): void {
    this.sessionListener?.dispose()
    this.sessionListener = this.session.onDidChange(snapshot => {
      client.onDidChange(snapshot)
    })
    client.onDidChange(this.session.getSnapshot())
  }
}
