import type {
  WorkflowAuthoringCandidate,
  WorkflowRevision,
  WorkflowRuntimePort
} from '@unilab/services'
import type { Dispatch, SetStateAction } from 'react'

/** 工作流（Workflow）创作区支持的源码模式。 */
export type WorkflowAuthoringMode = 'json' | 'python'

/** 工作流（Workflow）创作区可跨视图恢复的完整快照。 */
export interface WorkflowAuthoringSnapshot {
  authoringMode: WorkflowAuthoringMode
  sourceFileName: string | null
  sourceFileWriter: ((content: string) => Promise<void>) | null
  editorValue: string
  editorBaseline: string
  canonicalSource: string
  pythonBaseline: string | null
  pythonSourceMap: NonNullable<WorkflowAuthoringCandidate['source_map']>
  layoutDirty: boolean
}

/** 工作流（Workflow）创作协调器的外部依赖。 */
export interface UseWorkflowAuthoringParams {
  runtime: WorkflowRuntimePort
  activeWorkflowStorageKey?: string
  initial: WorkflowAuthoringSnapshot | null
  compactPane: 'code' | 'dag'
  onRequestCodePane: () => void
  onResetRun: () => void
  onRevisionRemapped: (
    previous: WorkflowRevision,
    next: WorkflowRevision
  ) => void
  onUnsavedChangesChange?: (hasUnsavedChanges: boolean) => void
  setMessage: Dispatch<SetStateAction<string>>
  setError: Dispatch<SetStateAction<string | null>>
  withBusy: (operation: () => Promise<void>) => Promise<void>
}
