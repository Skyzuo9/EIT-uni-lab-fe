import {
  AbstractViewContribution,
  FrontendApplication,
  FrontendApplicationContribution
} from '@theia/core/lib/browser'
import { Command } from '@theia/core/lib/common/command'
import { injectable } from '@theia/core/shared/inversify'
import type { IDisposable } from '@theia/monaco-editor-core'

import { registerPythonSyntaxHighlighting } from './python-monarch'
import { UniLabWorkbenchWidget } from './unilab-workbench-widget'

export const OpenUniLabWorkbench: Command = {
  id: 'unilab.authoring-workbench.open',
  label: '打开 UniLab 调试工作台'
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
