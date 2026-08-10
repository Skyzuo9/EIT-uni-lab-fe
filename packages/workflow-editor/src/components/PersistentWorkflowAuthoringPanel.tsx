import type { WorkflowRuntimePort } from '@unilab/services'
import { useEffect } from 'react'

import type { WorkflowTracePort } from '../traceRuntime'
import type { WorkflowPanelRuntimeProjection } from '../workflowPanelProjection'
import {
  usePersistentWorkflowAuthoring,
  type PersistentWorkflowAuthoringOptions
} from '../hooks/usePersistentWorkflowAuthoring'
import type { WorkflowResourceSlotOptionsPort } from '../utils/workflowResourceSlotOptions'
import type { WorkflowIdeBridge } from '../utils/workflowSourceNavigation'
import { projectWorkflowIdeDiagnostics } from '../utils/workflowSourceNavigation'
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
  materialRoleFilter?: string | null
  onMaterialRoleFilterChange?: (materialRole: string | null) => void
  onChooseWorkflow?: () => void
  ideBridge?: WorkflowIdeBridge
  hideEmbeddedCodeEditor?: boolean
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
  const onDiagnosticsChange = props.ideBridge?.onDiagnosticsChange
  useEffect(() => {
    onDiagnosticsChange?.(projectWorkflowIdeDiagnostics(
      model.aggregate,
      model.sourceProjection
    ))
    return () => onDiagnosticsChange?.([])
  }, [model.aggregate, model.sourceProjection, onDiagnosticsChange])
  return (
    <PersistentWorkflowAuthoringView
      model={model}
      materialRoleFilter={props.materialRoleFilter}
      onMaterialRoleFilterChange={props.onMaterialRoleFilterChange}
      hideEmbeddedCodeEditor={props.hideEmbeddedCodeEditor}
    />
  )
}
