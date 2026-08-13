import { Emitter, type Event } from '@theia/core/lib/common/event'
import { injectable } from '@theia/core/shared/inversify'
import type { WorkbenchSessionSnapshot } from '@unilab/workbench-session'

import type {
  WorkbenchSessionClient
} from '../common/workbench-session-protocol'

/** Frontend projection of the event-driven managed OS session state. */
@injectable()
export class WorkbenchSessionClientImpl implements WorkbenchSessionClient {
  private readonly changeEmitter = new Emitter<WorkbenchSessionSnapshot>()

  readonly onSessionChanged: Event<WorkbenchSessionSnapshot> =
    this.changeEmitter.event

  onDidChange(snapshot: WorkbenchSessionSnapshot): void {
    this.changeEmitter.fire(snapshot)
  }
}
