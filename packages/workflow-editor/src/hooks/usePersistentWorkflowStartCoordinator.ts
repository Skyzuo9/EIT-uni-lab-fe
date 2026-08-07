import type {
  WorkflowAuthoringAggregate,
  WorkflowAuthoringApplyResponse,
  WorkflowAuthoringGraph,
  WorkflowAuthoringTransformResult,
  WorkflowRuntimePort
} from '@unilab/services'
import type {
  Dispatch,
  MutableRefObject,
  SetStateAction
} from 'react'

import {
  updatePersistentAuthoringNodeName
} from '../utils/persistentAuthoringGraph'
import {
  draftSaveMessage,
  isAuthoringConflict,
  type AuthoringOperationQueue
} from '../utils/persistentAuthoringSession'
import {
  authoritativePython
} from '../utils/persistentAuthoringProjection'
import type { WorkflowEditMode } from '../utils/workflowCanvasPolicy'
import type { FullSourceDiff } from './persistentWorkflowAuthoringTypes'
import { usePersistentWorkflowStartFlow } from './usePersistentWorkflowStartFlow'

interface PersistentWorkflowStartCoordinatorOptions {
  runtime: WorkflowRuntimePort
  workflowUuid: string
  queue: AuthoringOperationQueue
  aggregate: WorkflowAuthoringAggregate | null
  mode: WorkflowEditMode
  dirty: boolean
  blockedReason: string | null
  graph: WorkflowAuthoringGraph | null
  editorValue: string
  selectedNodeUuid: string | null
  selectedNodeName: string
  selectedNodeNameDirty: boolean
  remotePending: MutableRefObject<boolean>
  generateCanvasPython: (
    graph: WorkflowAuthoringGraph,
    authority?: WorkflowAuthoringAggregate
  ) => Promise<WorkflowAuthoringTransformResult>
  applyCandidateByHash: (
    candidateHash: string
  ) => Promise<WorkflowAuthoringApplyResponse>
  installAggregate: (
    aggregate: WorkflowAuthoringAggregate,
    message: string
  ) => void
  readRemoteConflict: () => Promise<void>
  presentWorkflowImportMismatch: (
    saveError: unknown,
    pythonSource: string
  ) => Promise<boolean>
  openTaskInput: (authority: WorkflowAuthoringAggregate) => Promise<void>
  run: (operation: () => Promise<void>) => Promise<void>
  setGraph: Dispatch<SetStateAction<WorkflowAuthoringGraph | null>>
  setCanvasDirty: Dispatch<SetStateAction<boolean>>
  setSelectedNodeNameDirty: Dispatch<SetStateAction<boolean>>
  setPendingPythonImport: Dispatch<SetStateAction<string | null>>
  setFullSourceDiff: Dispatch<SetStateAction<FullSourceDiff | null>>
  setMode: Dispatch<SetStateAction<WorkflowEditMode>>
  setMessage: Dispatch<SetStateAction<string>>
  setError: Dispatch<SetStateAction<string | null>>
  isErrorHandled?: (error: unknown) => boolean
}

/**
 * 组合工作流（Workflow）运行前的保存、源码确认、应用和任务输入链路。
 *
 * @param options 当前创作状态、操作系统（OS）端口和界面状态写入器。
 * @returns 单一运行入口的状态投影，以及接受或取消源码确认的命令。
 */
export function usePersistentWorkflowStartCoordinator({
  runtime,
  workflowUuid,
  queue,
  aggregate,
  mode,
  dirty,
  blockedReason,
  graph,
  editorValue,
  selectedNodeUuid,
  selectedNodeName,
  selectedNodeNameDirty,
  remotePending,
  generateCanvasPython,
  applyCandidateByHash,
  installAggregate,
  readRemoteConflict,
  presentWorkflowImportMismatch,
  openTaskInput,
  run,
  setGraph,
  setCanvasDirty,
  setSelectedNodeNameDirty,
  setPendingPythonImport,
  setFullSourceDiff,
  setMode,
  setMessage,
  setError,
  isErrorHandled
}: PersistentWorkflowStartCoordinatorOptions) {
  const workflowStart = usePersistentWorkflowStartFlow({
    context: {
      aggregate,
      dirty,
      blockedReason,
      editMode: mode
    },
    hasRemoteInvalidation: () => remotePending.current,
    commands: {
      /**
       * 保存当前可写工作流源码（Workflow Source），或为画布生成完整差异。
       *
       * @returns 已保存权威聚合，或等待用户确认的完整源码差异。
       */
      saveDraft: async () => {
        if (!aggregate) throw new Error('工作流编辑数据尚未就绪')
        if (mode === 'code') {
          try {
            const saved = await queue.run(
              () => runtime.saveWorkflowAuthoringDraft(
                workflowUuid,
                {
                  python_source: editorValue,
                  expected_draft_hash: aggregate.draft?.draft_hash ?? null,
                  expected_workflow_revision: aggregate.workflow_revision
                }
              )
            )
            remotePending.current = false
            installAggregate(saved, draftSaveMessage(saved))
            return { kind: 'saved' as const, aggregate: saved, editMode: mode }
          } catch (saveError) {
            if (await presentWorkflowImportMismatch(
              saveError,
              editorValue
            )) throw saveError
            if (!isAuthoringConflict(saveError)) throw saveError
            remotePending.current = true
            await readRemoteConflict()
            throw saveError
          }
        }
        if (!graph) throw new Error('当前画布数据尚未就绪')
        const sourceGraph = selectedNodeNameDirty && selectedNodeUuid
          ? updatePersistentAuthoringNodeName(
              graph,
              selectedNodeUuid,
              selectedNodeName
            )
          : graph
        if (sourceGraph !== graph) {
          setGraph(sourceGraph)
          setCanvasDirty(true)
          setSelectedNodeNameDirty(false)
        }
        const generated = await generateCanvasPython(sourceGraph)
        const generatedPython = generated.normalized_python_source
        if (!generatedPython) throw new Error('OS 未返回完整规范化 Python')
        return {
          kind: 'review' as const,
          review: {
            before: authoritativePython(aggregate),
            after: generatedPython,
            expectedDraftHash: aggregate.draft?.draft_hash ?? null,
            expectedWorkflowRevision: aggregate.workflow_revision,
            reason: 'canvas_save' as const,
            resumeMode: 'canvas' as const
          }
        }
      },

      /**
       * 使用用户接受的完整源码与双 CAS 坐标保存工作流源码（Workflow Source）。
       *
       * @param command 状态机冻结的源码、修订和恢复模式。
       * @returns 保存后的权威聚合与恢复编辑模式。
       */
      saveReviewedSource: async (command) => {
        try {
          const saved = await queue.run(
            () => runtime.saveWorkflowAuthoringDraft(
              workflowUuid,
              {
                python_source: command.pythonSource,
                expected_draft_hash: command.expectedDraftHash,
                expected_workflow_revision: command.expectedWorkflowRevision
              }
            )
          )
          remotePending.current = false
          setFullSourceDiff(null)
          installAggregate(saved, draftSaveMessage(saved))
          if (command.reason === 'source_normalization') {
            setPendingPythonImport(null)
          }
          setMode(command.resumeMode)
          return { aggregate: saved, editMode: command.resumeMode }
        } catch (saveError) {
          if (await presentWorkflowImportMismatch(
            saveError,
            command.pythonSource
          )) throw saveError
          if (!isAuthoringConflict(saveError)) throw saveError
          remotePending.current = true
          const refreshed = await queue.run(
            () => runtime.getWorkflowAuthoring(workflowUuid)
          )
          setFullSourceDiff({
            before: authoritativePython(refreshed),
            after: command.pythonSource,
            expectedDraftHash: refreshed.draft?.draft_hash ?? null,
            expectedWorkflowRevision: refreshed.workflow_revision,
            reason: 'conflict_retry',
            resumeMode: command.resumeMode,
            applyAfterSave: false
          })
          setMessage(
            '运行前检测到外部修改；本地完整源码已保留，请比较后明确处理'
          )
          throw saveError
        }
      },
      applyCandidate: applyCandidateByHash,
      readApplied: () => queue.run(
        () => runtime.getWorkflowAuthoring(workflowUuid)
      ),
      openTaskInput,
      resolveRemoteConflict: () => {
        void run(readRemoteConflict)
      }
    },
    setFullSourceDiff,
    setMessage,
    setError,
    isErrorHandled
  })

  return workflowStart
}
