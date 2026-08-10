import { Emitter, type Event } from '@theia/core/lib/common/event'
import { injectable } from '@theia/core/shared/inversify'

export type WorkbenchViewMode = 'workflow' | 'material' | 'device' | 'split'

/**
 * The single UI authority for which UniLab domain surfaces are visible.
 *
 * The service contains presentation state only. Workflow, Material and OS
 * facts remain owned by their existing stores and WorkbenchSession.
 */
@injectable()
export class WorkbenchViewState {
  protected mode: WorkbenchViewMode = 'workflow'
  protected readonly changeEmitter = new Emitter<WorkbenchViewMode>()

  readonly onDidChangeMode: Event<WorkbenchViewMode> = this.changeEmitter.event

  get currentMode(): WorkbenchViewMode {
    return this.mode
  }

  select(mode: WorkbenchViewMode): void {
    if (mode === this.mode) return
    this.mode = mode
    this.changeEmitter.fire(mode)
  }
}
