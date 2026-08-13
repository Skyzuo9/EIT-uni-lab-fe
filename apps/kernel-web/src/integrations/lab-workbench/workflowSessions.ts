import type { PanelConfig } from '@unilab/workbench-layout'

export function workflowUuidFromPanelConfig(
  config: PanelConfig | undefined
): string | null {
  const value = config?.workflow_uuid
  return typeof value === 'string' && value.length > 0 ? value : null
}

export class WorkflowDirtySessions {
  private readonly dirty = new Set<string>()

  constructor(
    private readonly onChange?: (hasUnsavedChanges: boolean) => void
  ) {}

  get hasUnsavedChanges(): boolean {
    return this.dirty.size > 0
  }

  update(sessionId: string, hasUnsavedChanges: boolean): void {
    if (hasUnsavedChanges) this.dirty.add(sessionId)
    else this.dirty.delete(sessionId)
    this.onChange?.(this.hasUnsavedChanges)
  }
}
