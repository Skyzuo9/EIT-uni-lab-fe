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
import {
  DeviceDomainEntryContribution,
  MaterialDomainEntryContribution,
  SplitDomainEntryContribution,
  UniLabDomainNavigationInitializer,
  UniLabWorkbenchContribution,
  WorkflowDomainEntryContribution
} from './unilab-workbench-contribution'
import {
  DeviceDomainEntryWidget,
  MaterialDomainEntryWidget,
  SplitDomainEntryWidget,
  WorkflowDomainEntryWidget
} from './unilab-workbench-navigator-widget'
import { UniLabWorkbenchWidget } from './unilab-workbench-widget'
import { WorkbenchViewState } from './workbench-view-state'
import { WorkbenchSessionClientImpl } from './workbench-session-client'
import { WorkbenchPrivateStatePreferenceContribution } from './workbench-private-state-preferences'
import { UniLabAgentContribution } from './unilab-agent-contribution'
import { UniLabAgentWidget } from './unilab-agent-widget'
import '../../src/browser/style/index.css'

export default new ContainerModule((bind) => {
  bind(WorkbenchViewState).toSelf().inSingletonScope()
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

  bindViewContribution(bind, UniLabWorkbenchContribution)
  bind(FrontendApplicationContribution)
    .toService(UniLabWorkbenchContribution)
  bind(UniLabWorkbenchWidget).toSelf()
  bind(WidgetFactory).toDynamicValue((context) => ({
    id: UniLabWorkbenchWidget.ID,
    createWidget: () => context.container.get(UniLabWorkbenchWidget)
  })).inSingletonScope()

  bindViewContribution(bind, WorkflowDomainEntryContribution)
  bind(WorkflowDomainEntryWidget).toSelf()
  bind(WidgetFactory).toDynamicValue((context) => ({
    id: WorkflowDomainEntryWidget.ID,
    createWidget: () => context.container.get(WorkflowDomainEntryWidget)
  })).inSingletonScope()

  bindViewContribution(bind, MaterialDomainEntryContribution)
  bind(MaterialDomainEntryWidget).toSelf()
  bind(WidgetFactory).toDynamicValue((context) => ({
    id: MaterialDomainEntryWidget.ID,
    createWidget: () => context.container.get(MaterialDomainEntryWidget)
  })).inSingletonScope()

  bindViewContribution(bind, DeviceDomainEntryContribution)
  bind(DeviceDomainEntryWidget).toSelf()
  bind(WidgetFactory).toDynamicValue((context) => ({
    id: DeviceDomainEntryWidget.ID,
    createWidget: () => context.container.get(DeviceDomainEntryWidget)
  })).inSingletonScope()

  bindViewContribution(bind, SplitDomainEntryContribution)
  bind(SplitDomainEntryWidget).toSelf()
  bind(WidgetFactory).toDynamicValue((context) => ({
    id: SplitDomainEntryWidget.ID,
    createWidget: () => context.container.get(SplitDomainEntryWidget)
  })).inSingletonScope()

  bind(UniLabDomainNavigationInitializer).toSelf().inSingletonScope()
  bind(FrontendApplicationContribution)
    .toService(UniLabDomainNavigationInitializer)
})
