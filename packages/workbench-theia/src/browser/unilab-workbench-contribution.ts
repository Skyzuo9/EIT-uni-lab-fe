import {
  AbstractViewContribution,
  FrontendApplication,
  FrontendApplicationContribution
} from '@theia/core/lib/browser'
import { Command } from '@theia/core/lib/common/command'
import { inject, injectable } from '@theia/core/shared/inversify'
import type { IDisposable } from '@theia/monaco-editor-core'

import { registerPythonSyntaxHighlighting } from './python-monarch'
import {
  DeviceDomainEntryWidget,
  MaterialDomainEntryWidget,
  WorkflowDomainEntryWidget
} from './unilab-workbench-navigator-widget'
import { UniLabWorkbenchWidget } from './unilab-workbench-widget'

export const OpenUniLabWorkbench: Command = {
  id: 'unilab.authoring-workbench.open',
  label: '打开 UniLab 调试工作台'
}

export const OpenUniLabWorkflowView: Command = {
  id: 'unilab.workbench.workflow.open',
  label: '打开工作流'
}

export const OpenUniLabMaterialView: Command = {
  id: 'unilab.workbench.material.open',
  label: '打开物料'
}

export const OpenUniLabDeviceView: Command = {
  id: 'unilab.workbench.device-management.open',
  label: '打开仪器设备'
}

@injectable()
export class UniLabWorkbenchContribution
  extends AbstractViewContribution<UniLabWorkbenchWidget>
  implements FrontendApplicationContribution {
  protected pythonSyntaxHighlighting: IDisposable | undefined

  constructor() {
    super({
      widgetId: UniLabWorkbenchWidget.ID,
      widgetName: UniLabWorkbenchWidget.LABEL,
      defaultWidgetOptions: { area: 'main' },
      toggleCommandId: OpenUniLabWorkbench.id
    })
  }

  onStart(_app: FrontendApplication): void {
    this.pythonSyntaxHighlighting = registerPythonSyntaxHighlighting()
    void this.openView({ activate: true, reveal: true })
  }

  onStop(_app: FrontendApplication): void {
    this.pythonSyntaxHighlighting?.dispose()
    this.pythonSyntaxHighlighting = undefined
  }
}

@injectable()
export class WorkflowDomainEntryContribution
  extends AbstractViewContribution<WorkflowDomainEntryWidget> {
  constructor() {
    super({
      widgetId: WorkflowDomainEntryWidget.ID,
      widgetName: '工作流',
      defaultWidgetOptions: { area: 'left', rank: 73 },
      toggleCommandId: OpenUniLabWorkflowView.id
    })
  }
}

@injectable()
export class MaterialDomainEntryContribution
  extends AbstractViewContribution<MaterialDomainEntryWidget> {
  constructor() {
    super({
      widgetId: MaterialDomainEntryWidget.ID,
      widgetName: '物料',
      defaultWidgetOptions: { area: 'left', rank: 72 },
      toggleCommandId: OpenUniLabMaterialView.id
    })
  }
}

@injectable()
export class DeviceDomainEntryContribution
  extends AbstractViewContribution<DeviceDomainEntryWidget> {
  constructor() {
    super({
      widgetId: DeviceDomainEntryWidget.ID,
      widgetName: '仪器设备',
      defaultWidgetOptions: { area: 'left', rank: 71 },
      toggleCommandId: OpenUniLabDeviceView.id
    })
  }
}

@injectable()
export class UniLabDomainNavigationInitializer
implements FrontendApplicationContribution {
  @inject(WorkflowDomainEntryContribution)
  protected readonly workflow!: WorkflowDomainEntryContribution

  @inject(MaterialDomainEntryContribution)
  protected readonly material!: MaterialDomainEntryContribution

  @inject(DeviceDomainEntryContribution)
  protected readonly device!: DeviceDomainEntryContribution

  async onDidInitializeLayout(app: FrontendApplication): Promise<void> {
    await this.workflow.openView({ activate: false, reveal: false })
    await this.material.openView({ activate: false, reveal: false })
    await this.device.openView({ activate: false, reveal: false })
    await app.shell.collapsePanel('left')
  }
}
