import {
  bindViewContribution,
  FrontendApplicationContribution,
  WebSocketConnectionProvider,
  WidgetFactory
} from '@theia/core/lib/browser'
import { ContainerModule } from '@theia/core/shared/inversify'
import '@unilab/design-system/theme.css'

import {
  WORKBENCH_SESSION_PATH,
  WorkbenchSessionServer
} from '../common/workbench-session-protocol'
import { TheiaWorkflowPrototypeContribution } from './theia-workflow-prototype-contribution'
import { TheiaWorkflowPrototypeWidget } from './theia-workflow-prototype-widget'
import '../../src/browser/style/index.css'

export default new ContainerModule((bind) => {
  bind(WorkbenchSessionServer).toDynamicValue(context =>
    WebSocketConnectionProvider.createProxy(
      context.container,
      WORKBENCH_SESSION_PATH
    )
  ).inSingletonScope()

  bindViewContribution(bind, TheiaWorkflowPrototypeContribution)
  bind(FrontendApplicationContribution)
    .toService(TheiaWorkflowPrototypeContribution)
  bind(TheiaWorkflowPrototypeWidget).toSelf()
  bind(WidgetFactory).toDynamicValue((context) => ({
    id: TheiaWorkflowPrototypeWidget.ID,
    createWidget: () => context.container.get(TheiaWorkflowPrototypeWidget)
  })).inSingletonScope()
})
