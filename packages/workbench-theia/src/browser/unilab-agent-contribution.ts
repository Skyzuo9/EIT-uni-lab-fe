import {
  AbstractViewContribution,
  type FrontendApplication,
  type FrontendApplicationContribution
} from '@theia/core/lib/browser'
import type { Command } from '@theia/core/lib/common/command'
import { injectable } from '@theia/core/shared/inversify'

import { UniLabAgentWidget } from './unilab-agent-widget'

export const OpenUniLabAgent: Command = {
  id: 'unilab.agent.open',
  label: 'Open UniLab Agent'
}

@injectable()
export class UniLabAgentContribution
  extends AbstractViewContribution<UniLabAgentWidget>
  implements FrontendApplicationContribution {
  constructor() {
    super({
      widgetId: UniLabAgentWidget.ID,
      widgetName: UniLabAgentWidget.LABEL,
      defaultWidgetOptions: { area: 'right' },
      toggleCommandId: OpenUniLabAgent.id
    })
  }

  onStart(_app: FrontendApplication): void {
    void this.openView({ activate: false, reveal: true })
  }
}
