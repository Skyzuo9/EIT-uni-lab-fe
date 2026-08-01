import type { WorkflowRuntimePort } from '@unilab/services'

import { readActiveWorkflowId } from '../utils/workflowAuthoringOperations'
import { PersistentWorkflowAuthoringPanel } from './PersistentWorkflowAuthoringPanel'
import styles from './workflow.module.scss'

export interface WorkflowPanelProps {
  runtime: WorkflowRuntimePort
  workflowUuid?: string
  activeWorkflowStorageKey?: string
  onUnsavedChangesChange?: (hasUnsavedChanges: boolean) => void
}

export default function WorkflowPanel({
  runtime,
  workflowUuid: explicitWorkflowUuid,
  activeWorkflowStorageKey,
  onUnsavedChangesChange
}: WorkflowPanelProps): React.JSX.Element {
  const workflowUuid = explicitWorkflowUuid ||
    readActiveWorkflowId(activeWorkflowStorageKey)

  if (workflowUuid && isWorkflowUuid(workflowUuid)) {
    return (
      <PersistentWorkflowAuthoringPanel
        key={workflowUuid}
        runtime={runtime}
        workflowUuid={workflowUuid}
        onUnsavedChangesChange={onUnsavedChangesChange}
      />
    )
  }

  return (
    <div
      className={[
        styles.workflow,
        'workflow-runtime relative flex h-full w-full flex-col',
        'bg-[var(--unilab-color-canvas)] text-[var(--unilab-color-text)]'
      ].join(' ')}
    >
      <div className="workflow-runtime__empty" role="status">
        请选择一个已应用的工作流，再进入编写与运行工作台
      </div>
    </div>
  )
}

function isWorkflowUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(value)
}
