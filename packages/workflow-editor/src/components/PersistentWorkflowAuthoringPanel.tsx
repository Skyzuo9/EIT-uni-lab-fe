import {
  usePersistentWorkflowAuthoring,
  type PersistentWorkflowAuthoringOptions
} from '../hooks/usePersistentWorkflowAuthoring'
import { PersistentWorkflowAuthoringView } from './PersistentWorkflowAuthoringView'

export {
  filterMaterialSourceSites,
  MaterialSourceInspector
} from './MaterialSourceInspector'
export type {
  MaterialSourceInspectorProps
} from './MaterialSourceInspector'

type PersistentWorkflowAuthoringPanelProps = PersistentWorkflowAuthoringOptions

/**
 * 保留稳定的工作流编写面板入口，把会话状态与纯视图交给深模块处理。
 */
export function PersistentWorkflowAuthoringPanel(
  props: PersistentWorkflowAuthoringPanelProps
): React.JSX.Element {
  const model = usePersistentWorkflowAuthoring(
    props satisfies PersistentWorkflowAuthoringOptions
  )
  return <PersistentWorkflowAuthoringView model={model} />
}
