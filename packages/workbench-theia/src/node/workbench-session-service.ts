import type { BackendApplicationContribution } from '@theia/core/lib/node'
import { injectable } from '@theia/core/shared/inversify'
import {
  createManagedLocalWorkbenchSession,
  type WorkbenchSession
} from '@unilab/workbench-session'

import type { WorkbenchSessionServer } from '../common/workbench-session-protocol'

@injectable()
export class WorkbenchSessionService
implements WorkbenchSessionServer, BackendApplicationContribution {
  private readonly session: WorkbenchSession =
    createManagedLocalWorkbenchSession({
      workspacePath: process.env['THEIA_WORKSPACE'] ?? '',
      osProjectPath: process.env['UNILAB_OS_PROJECT'],
      environmentPath: process.env['UNILAB_PYTHON_ENV']
    })

  onStart(): void {
    void this.session.start().catch(() => undefined)
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
}
