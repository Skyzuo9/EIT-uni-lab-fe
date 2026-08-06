import type { WorkflowRuntimePort } from '@unilab/services'

import type { WorkflowTracePort } from '../traceRuntime'
import type { WorkflowPanelRuntimeProjection } from '../workflowPanelProjection'
import {
  usePersistentWorkflowAuthoring,
  type PersistentWorkflowAuthoringOptions
} from '../hooks/usePersistentWorkflowAuthoring'
import type { WorkflowResourceSlotOptionsPort } from '../utils/workflowResourceSlotOptions'
import { PersistentWorkflowAuthoringView } from './PersistentWorkflowAuthoringView'

export {
  filterMaterialSourceSites,
  MaterialSourceInspector
} from './MaterialSourceInspector'
export type {
  MaterialSourceInspectorProps
} from './MaterialSourceInspector'

interface PersistentWorkflowAuthoringPanelProps {
  runtime: WorkflowRuntimePort
  workflowUuid: string
  traceRuntime?: WorkflowTracePort
  resourceSlotOptionsPort?: WorkflowResourceSlotOptionsPort
  onUnsavedChangesChange?: (hasUnsavedChanges: boolean) => void
  onWorkflowRuntimeProjectionChange?: (
    projection: WorkflowPanelRuntimeProjection | null
  ) => void
  onSelectedWorkflowStepChange?: (workflowNodeUuid: string | null) => void
  onChooseWorkflow?: () => void
}

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
