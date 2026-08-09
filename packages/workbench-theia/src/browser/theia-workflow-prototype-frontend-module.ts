import {
  bindViewContribution,
  FrontendApplicationContribution,
  WebSocketConnectionProvider,
  WidgetFactory
} from '@theia/core/lib/browser'
import { ContainerModule } from '@theia/core/shared/inversify'
import { PreferenceContribution } from '@theia/core/lib/common/preferences'
import '@unilab/design-system/theme.css'

import {
  WORKBENCH_SESSION_PATH,
  WorkbenchSessionClient,
  WorkbenchSessionServer
} from '../common/workbench-session-protocol'
import { TheiaWorkflowPrototypeContribution } from './theia-workflow-prototype-contribution'
import { TheiaWorkflowPrototypeWidget } from './theia-workflow-prototype-widget'
import { WorkbenchSessionClientImpl } from './workbench-session-client'
import { WorkbenchPrivateStatePreferenceContribution } from './workbench-private-state-preferences'
import { UniLabAgentContribution } from './unilab-agent-contribution'
import { UniLabAgentWidget } from './unilab-agent-widget'
import '../../src/browser/style/index.css'

export default new ContainerModule((bind) => {
  bind(WorkbenchPrivateStatePreferenceContribution).toSelf().inSingletonScope()
  bind(PreferenceContribution).toService(
    WorkbenchPrivateStatePreferenceContribution
  )
  bind(WorkbenchSessionClientImpl).toSelf().inSingletonScope()
  bind(WorkbenchSessionClient).toService(WorkbenchSessionClientImpl)
  bind(WorkbenchSessionServer).toDynamicValue(context =>
    WebSocketConnectionProvider.createProxy(
      context.container,
      WORKBENCH_SESSION_PATH,
      context.container.get(WorkbenchSessionClient)
    )
  ).inSingletonScope()

  bindViewContribution(bind, UniLabAgentContribution)
  bind(FrontendApplicationContribution).toService(UniLabAgentContribution)
  bind(UniLabAgentWidget).toSelf()
  bind(WidgetFactory).toDynamicValue(context => ({
    id: UniLabAgentWidget.ID,
    createWidget: () => context.container.get(UniLabAgentWidget)
  })).inSingletonScope()

  bindViewContribution(bind, TheiaWorkflowPrototypeContribution)
  bind(FrontendApplicationContribution)
    .toService(TheiaWorkflowPrototypeContribution)
  bind(TheiaWorkflowPrototypeWidget).toSelf()
  bind(WidgetFactory).toDynamicValue((context) => ({
    id: TheiaWorkflowPrototypeWidget.ID,
    createWidget: () => context.container.get(TheiaWorkflowPrototypeWidget)
  })).inSingletonScope()
})
