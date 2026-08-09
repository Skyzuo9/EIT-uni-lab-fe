import {
  bindViewContribution,
  FrontendApplicationContribution,
  WidgetFactory
} from '@theia/core/lib/browser'
import { ContainerModule } from '@theia/core/shared/inversify'
import '@unilab/design-system/theme.css'

import { TheiaAionUiContribution } from './theia-aionui-contribution'
import { TheiaAionUiWidget } from './theia-aionui-widget'
import { TheiaWorkflowPrototypeContribution } from './theia-workflow-prototype-contribution'
import { TheiaWorkflowPrototypeWidget } from './theia-workflow-prototype-widget'
import '../../src/browser/style/index.css'

export default new ContainerModule((bind) => {
  bindViewContribution(bind, TheiaAionUiContribution)
  bind(FrontendApplicationContribution)
    .toService(TheiaAionUiContribution)
  bind(TheiaAionUiWidget).toSelf()
  bind(WidgetFactory).toDynamicValue((context) => ({
    id: TheiaAionUiWidget.ID,
    createWidget: () => context.container.get(TheiaAionUiWidget)
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
