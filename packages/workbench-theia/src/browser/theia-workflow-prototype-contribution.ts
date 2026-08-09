import {
  AbstractViewContribution,
  FrontendApplication,
  FrontendApplicationContribution
} from '@theia/core/lib/browser'
import { Command } from '@theia/core/lib/common/command'
import { injectable } from '@theia/core/shared/inversify'
import type { IDisposable } from '@theia/monaco-editor-core'

import { registerPythonSyntaxHighlighting } from './python-monarch'
import { TheiaWorkflowPrototypeWidget } from './theia-workflow-prototype-widget'

export const OpenTheiaWorkflowPrototype: Command = {
  id: 'unilab.authoring-workbench.open',
  label: 'Open UniLab Authoring Workbench'
}

@injectable()
export class TheiaWorkflowPrototypeContribution
  extends AbstractViewContribution<TheiaWorkflowPrototypeWidget>
  implements FrontendApplicationContribution {
  protected pythonSyntaxHighlighting: IDisposable | undefined

  constructor() {
    super({
      widgetId: TheiaWorkflowPrototypeWidget.ID,
      widgetName: TheiaWorkflowPrototypeWidget.LABEL,
      defaultWidgetOptions: { area: 'main' },
      toggleCommandId: OpenTheiaWorkflowPrototype.id
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
