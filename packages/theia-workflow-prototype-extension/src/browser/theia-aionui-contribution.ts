import {
  AbstractViewContribution,
  FrontendApplication,
  FrontendApplicationContribution
} from '@theia/core/lib/browser'
import { Command } from '@theia/core/lib/common/command'
import { injectable } from '@theia/core/shared/inversify'

import { TheiaAionUiWidget } from './theia-aionui-widget'

export const OpenTheiaAionUi: Command = {
  id: 'unilab.aionui.open',
  label: 'Open AionUi Agent'
}

@injectable()
export class TheiaAionUiContribution
  extends AbstractViewContribution<TheiaAionUiWidget>
  implements FrontendApplicationContribution {
  constructor() {
    super({
      widgetId: TheiaAionUiWidget.ID,
      widgetName: TheiaAionUiWidget.LABEL,
      defaultWidgetOptions: { area: 'right' },
      toggleCommandId: OpenTheiaAionUi.id
    })
  }

  onStart(_app: FrontendApplication): void {
    void this.openView({ activate: true, reveal: true })
  }
}
