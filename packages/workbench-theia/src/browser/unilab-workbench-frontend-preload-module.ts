import { TextReplacementContribution } from '@theia/core/lib/browser/preload/text-replacement-contribution'
import { ContainerModule } from '@theia/core/shared/inversify'

import { WorkbenchChineseTextReplacementContribution } from './workbench-chinese-localization'

export default new ContainerModule((bind) => {
  bind(WorkbenchChineseTextReplacementContribution).toSelf().inSingletonScope()
  bind(TextReplacementContribution).toService(
    WorkbenchChineseTextReplacementContribution
  )
})
