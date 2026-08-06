import type {
  WorkflowAuthoringAggregate,
  WorkflowAuthoringGraph,
  WorkflowRuntimePort
} from '@unilab/services'

import type { WorkflowTracePort } from '../traceRuntime'
import type { WorkflowPanelRuntimeProjection } from '../workflowPanelProjection'
import type { WorkflowEditMode } from '../utils/workflowCanvasPolicy'
import type { WorkflowResourceSlotOptionsPort } from '../utils/workflowResourceSlotOptions'

export interface PersistentWorkflowAuthoringOptions {
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
  initialPythonImport?: WorkflowPythonImport
  onInitialPythonImportConsumed?: () => void
  onOpenWorkflow?: (
    workflowUuid: string,
    importedPython: WorkflowPythonImport
  ) => void
}

export interface WorkflowPythonImport {
  fileName: string
  content: string
}

export interface WorkflowImportMismatchPrompt {
  currentWorkflowUuid: string
  currentWorkflowName: string | null
  importedWorkflowUuid: string | null
  importedWorkflowName: string | null
  canOpenImportedWorkflow: boolean
  importedFileName: string | null
  importedPythonSource: string
}

export interface FullSourceDiff {
  before: string
  after: string
  expectedDraftHash: string | null
  expectedWorkflowRevision: number
  reason: 'canvas_save' | 'conflict_retry' | 'source_normalization'
  resumeMode: WorkflowEditMode
  applyAfterSave: boolean
}

export interface RemoteConflict {
  remote: WorkflowAuthoringAggregate
  localMode: WorkflowEditMode
  localPython: string
  localGraph: WorkflowAuthoringGraph | null
  selectedNodeUuid: string | null
  selectedNodeName: string
  selectedNodeNameDirty: boolean
}

export type WorkflowCodeProjection = 'python' | 'json'
