import { useEffect, useState } from 'react'

import type {
  WorkflowRuntimePort,
  WorkflowSummary
} from '@unilab/services'

import type { WorkflowTracePort } from '../traceRuntime'
import type {
  WorkflowResourceSlotOptionsPort
} from '../utils/workflowResourceSlotOptions'
import {
  persistActiveWorkflowId,
  readActiveWorkflowId
} from '../utils/workflowAuthoringOperations'
import { PersistentWorkflowAuthoringPanel } from './PersistentWorkflowAuthoringPanel'
import styles from './workflow.module.scss'

export interface WorkflowPanelProps {
  runtime: WorkflowRuntimePort
  workflowUuid?: string
  traceRuntime?: WorkflowTracePort
  resourceSlotOptionsPort?: WorkflowResourceSlotOptionsPort
  activeWorkflowStorageKey?: string
  onUnsavedChangesChange?: (hasUnsavedChanges: boolean) => void
}

export default function WorkflowPanel({
  runtime,
  workflowUuid: explicitWorkflowUuid,
  traceRuntime,
  resourceSlotOptionsPort,
  activeWorkflowStorageKey,
  onUnsavedChangesChange
}: WorkflowPanelProps): React.JSX.Element {
  const [selectedWorkflowUuid, setSelectedWorkflowUuid] = useState<
    string | null
  >(null)
  const [showCatalog, setShowCatalog] = useState(false)
  const workflowUuid = showCatalog
    ? null
    : explicitWorkflowUuid || selectedWorkflowUuid ||
      readActiveWorkflowId(activeWorkflowStorageKey)

  if (workflowUuid && isWorkflowUuid(workflowUuid)) {
    return (
      <PersistentWorkflowAuthoringPanel
        key={workflowUuid}
        runtime={runtime}
        workflowUuid={workflowUuid}
        traceRuntime={traceRuntime}
        resourceSlotOptionsPort={resourceSlotOptionsPort}
        onUnsavedChangesChange={onUnsavedChangesChange}
        onChooseWorkflow={explicitWorkflowUuid
          ? undefined
          : () => {
              persistActiveWorkflowId(activeWorkflowStorageKey, '')
              setSelectedWorkflowUuid(null)
              setShowCatalog(true)
            }}
      />
    )
  }

  return (
    <WorkflowCatalog
      runtime={runtime}
      onSelect={(nextWorkflowUuid) => {
        persistActiveWorkflowId(activeWorkflowStorageKey, nextWorkflowUuid)
        setSelectedWorkflowUuid(nextWorkflowUuid)
        setShowCatalog(false)
      }}
    />
  )
}

function WorkflowCatalog({
  runtime,
  onSelect
}: {
  runtime: WorkflowRuntimePort
  onSelect: (workflowUuid: string) => void
}): React.JSX.Element {
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [requestRevision, setRequestRevision] = useState(0)

  useEffect(() => {
    let disposed = false
    setLoading(true)
    setError(null)
    void runtime.listWorkflows({ page: 1, page_size: 100 })
      .then((page) => {
        if (!disposed) setWorkflows(page.items)
      })
      .catch((reason: unknown) => {
        if (!disposed) {
          setError(
            reason instanceof Error ? reason.message : String(reason)
          )
        }
      })
      .finally(() => {
        if (!disposed) setLoading(false)
      })
    return () => {
      disposed = true
    }
  }, [requestRevision, runtime])

  return (
    <div
      className={[
        styles.workflow,
        'workflow-runtime workflow-runtime__catalog',
        'relative flex h-full w-full flex-col',
        'bg-[var(--unilab-color-canvas)] text-[var(--unilab-color-text)]'
      ].join(' ')}
    >
      <header className="workflow-runtime__catalog-header">
        <div>
          <h2>可用工作流</h2>
          <p>从当前 OS 读取并选择要编写或运行的工作流</p>
        </div>
        {!loading && !error && (
          <span aria-label={`共 ${workflows.length} 个工作流`}>
            {workflows.length}
          </span>
        )}
      </header>

      {loading && (
        <div className="workflow-runtime__catalog-state" role="status">
          正在读取工作流…
        </div>
      )}
      {!loading && error && (
        <div className="workflow-runtime__catalog-state is-error" role="alert">
          <strong>工作流读取失败</strong>
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setRequestRevision((value) => value + 1)}
          >
            重试
          </button>
        </div>
      )}
      {!loading && !error && workflows.length === 0 && (
        <div className="workflow-runtime__catalog-state" role="status">
          当前 OS 没有可用工作流
        </div>
      )}
      {!loading && !error && workflows.length > 0 && (
        <div className="workflow-runtime__catalog-list" role="list">
          {workflows.map((workflow) => (
            <div key={workflow.uuid} role="listitem">
              <button
                type="button"
                onClick={() => onSelect(workflow.uuid)}
                aria-label={`打开工作流 ${workflow.name}`}
              >
                <span
                  className="workflow-runtime__catalog-mark"
                  aria-hidden="true"
                >
                  ◇
                </span>
                <span className="workflow-runtime__catalog-copy">
                  <strong>{workflow.name}</strong>
                  <small>
                    修订 {workflow.revision}
                    {workflow.tags.length > 0
                      ? ` · ${workflow.tags.join(' · ')}`
                      : ''}
                  </small>
                </span>
                <span
                  className="workflow-runtime__catalog-open"
                  aria-hidden="true"
                >
                  →
                </span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function isWorkflowUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(value)
}
