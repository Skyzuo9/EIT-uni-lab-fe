import type {
  WorkflowActionCatalogSnapshot,
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
  applyMaterializedWorkflowCandidate,
  authoringSaveFailureAction,
  draftSaveMessage,
  isAuthoringConflict,
  isTemplateCatalogConflict,
  type AuthoringLocalSnapshot,
  type AuthoringOperationQueue
} from '../utils/persistentAuthoringSession'
import {
  authoritativePython,
  rebaseGraphIdentity
} from '../utils/persistentAuthoringProjection'
import { rehydrateTypedActionGraph } from '../utils/workflowActionCatalog'
import {
  workflowCandidateMaterializationDecision,
  workflowCanvasDraftSaveDecision,
  type WorkflowEditMode
} from '../utils/workflowCanvasPolicy'
import type {
  FullSourceDiff,
  RemoteConflict
} from './persistentWorkflowAuthoringTypes'

interface PersistentWorkflowDraftPersistenceOptions {
  runtime: WorkflowRuntimePort
  workflowUuid: string
  queue: AuthoringOperationQueue
  aggregate: WorkflowAuthoringAggregate | null
  mode: WorkflowEditMode
  graph: WorkflowAuthoringGraph | null
  busy: boolean
  fullSourceDiff: FullSourceDiff | null
  pendingPythonImport: string | null
  remoteConflict: RemoteConflict | null
  selectedNodeUuid: string | null
  selectedNodeName: string
  selectedNodeNameDirty: boolean
  editorValue: string
  localState: MutableRefObject<AuthoringLocalSnapshot>
  remotePending: MutableRefObject<boolean>
  generateCanvasPython: (
    graph: WorkflowAuthoringGraph,
    authority?: WorkflowAuthoringAggregate
  ) => Promise<WorkflowAuthoringTransformResult>
  run: (operation: () => Promise<void>) => Promise<void>
  installAggregate: (
    aggregate: WorkflowAuthoringAggregate,
    message: string
  ) => void
  readRemoteConflict: () => Promise<void>
  presentWorkflowImportMismatch: (
    saveError: unknown,
    pythonSource: string
  ) => Promise<boolean>
  refreshWorkflowCatalogsAfterConflict: () => Promise<{
    action: WorkflowActionCatalogSnapshot
  }>
  setGraph: Dispatch<SetStateAction<WorkflowAuthoringGraph | null>>
  setCanvasDirty: Dispatch<SetStateAction<boolean>>
  setSelectedNodeNameDirty: Dispatch<SetStateAction<boolean>>
  setFullSourceDiff: Dispatch<SetStateAction<FullSourceDiff | null>>
  setPendingPythonImport: Dispatch<SetStateAction<string | null>>
  setRemoteConflict: Dispatch<SetStateAction<RemoteConflict | null>>
  setMode: Dispatch<SetStateAction<WorkflowEditMode>>
  setMessage: Dispatch<SetStateAction<string>>
  setError: Dispatch<SetStateAction<string | null>>
}

/**
 * 维护工作流源码（Workflow Source）的保存、冲突和候选应用事务。
 *
 * @param options 当前权威聚合、本地编辑快照、OS 端口与界面状态写入器。
 * @returns 草稿保存、差异确认、冲突处置和候选应用命令。
 */
export function usePersistentWorkflowDraftPersistence({
  runtime,
  workflowUuid,
  queue,
  aggregate,
  mode,
  graph,
  busy,
  fullSourceDiff,
  pendingPythonImport,
  remoteConflict,
  selectedNodeUuid,
  selectedNodeName,
  selectedNodeNameDirty,
  editorValue,
  localState,
  remotePending,
  generateCanvasPython,
  run,
  installAggregate,
  readRemoteConflict,
  presentWorkflowImportMismatch,
  refreshWorkflowCatalogsAfterConflict,
  setGraph,
  setCanvasDirty,
  setSelectedNodeNameDirty,
  setFullSourceDiff,
  setPendingPythonImport,
  setRemoteConflict,
  setMode,
  setMessage,
  setError
}: PersistentWorkflowDraftPersistenceOptions) {
  /**
   * 保存当前可写工作流源码；规范化变化时冻结完整差异供用户确认。
   *
   * @returns 无返回值；保存结果通过界面状态呈现。
   */
  const saveDraft = (): void => {
    if (!aggregate) return
    if (remotePending.current) {
      void run(readRemoteConflict)
      return
    }
    if (mode === 'code') {
      void run(async () => {
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
          installAggregate(saved, draftSaveMessage(saved))
          const materialization = saved.candidate && saved.draft
            ? workflowCandidateMaterializationDecision({
                draftPython: saved.draft.python_source,
                normalizedPython: saved.candidate.normalized_python_source
              })
            : null
          if (materialization?.kind === 'review_normalized_source') {
            setFullSourceDiff({
              before: materialization.before,
              after: materialization.after,
              expectedDraftHash: saved.draft?.draft_hash ?? null,
              expectedWorkflowRevision: saved.workflow_revision,
              reason: 'source_normalization',
              resumeMode: 'code',
              applyAfterSave: false
            })
            setMessage(
              pendingPythonImport
                ? `${pendingPythonImport} 已保存；请接受 OS 规范化 Python 后再应用`
                : '草稿已保存；请接受 OS 规范化 Python 后再应用'
            )
          } else {
            setPendingPythonImport(null)
          }
        } catch (saveError) {
          if (await presentWorkflowImportMismatch(
            saveError,
            editorValue
          )) return
          if (!isAuthoringConflict(saveError)) throw saveError
          remotePending.current = true
          await readRemoteConflict()
        }
      })
      return
    }
    if (!graph) return
    void run(async () => {
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
      const decision = workflowCanvasDraftSaveDecision({
        baselinePython: authoritativePython(aggregate),
        generatedPython: generated.normalized_python_source as string,
        fullDiffAccepted: false
      })
      if (decision.kind === 'review_full_diff') {
        setFullSourceDiff({
          before: decision.before,
          after: decision.after,
          expectedDraftHash: aggregate.draft?.draft_hash ?? null,
          expectedWorkflowRevision: aggregate.workflow_revision,
          reason: 'canvas_save',
          resumeMode: 'canvas',
          applyAfterSave: false
        })
      }
    })
  }

  /**
   * 接受编辑流程产生的完整工作流源码差异并保存或应用。
   *
   * @returns 无返回值；异步失败由统一运行包装器转为用户可见错误。
   */
  const acceptDraftFullSourceDiff = (): void => {
    if (!fullSourceDiff || busy) return
    const diff = fullSourceDiff
    const decision = workflowCanvasDraftSaveDecision({
      baselinePython: diff.before,
      generatedPython: diff.after,
      fullDiffAccepted: true
    })
    if (decision.kind !== 'write_complete_draft') return
    void run(async () => {
      try {
        /** 使用冻结的双 CAS 坐标保存用户已接受的规范化源码。 */
        const saveNormalizedDraft = () => queue.run(
          () => runtime.saveWorkflowAuthoringDraft(
            workflowUuid,
            {
              python_source: decision.python_source,
              expected_draft_hash: diff.expectedDraftHash,
              expected_workflow_revision: diff.expectedWorkflowRevision
            }
          )
        )
        if (diff.applyAfterSave) {
          const { applied } = await applyMaterializedWorkflowCandidate({
            save: saveNormalizedDraft,
            apply: (candidateHash) => queue.run(
              () => runtime.applyWorkflowAuthoring(
                workflowUuid,
                { candidate_hash: candidateHash }
              )
            )
          })
          remotePending.current = false
          setFullSourceDiff(null)
          setPendingPythonImport(null)
          setMode(diff.resumeMode)
          installAggregate(
            applied.authoring,
            applied.apply_result.kind === 'graph'
              ? `工作流已应用，当前版本为 ${applied.apply_result.workflow_revision}`
              : '源码已应用，工作流图未发生变化'
          )
          return
        }
        const saved = await saveNormalizedDraft()
        remotePending.current = false
        setFullSourceDiff(null)
        installAggregate(saved, draftSaveMessage(saved))
        if (diff.reason === 'source_normalization') {
          setPendingPythonImport(null)
        }
        setMode(diff.resumeMode)
      } catch (saveError) {
        const failureAction = authoringSaveFailureAction(saveError)
        if (failureAction === 'close_diff_and_report') {
          setFullSourceDiff(null)
          if (await presentWorkflowImportMismatch(
            saveError,
            decision.python_source
          )) return
          throw saveError
        }
        if (failureAction === 'report') throw saveError
        setFullSourceDiff(null)
        remotePending.current = true
        await readRemoteConflict()
      }
    })
  }

  /** 关闭编辑流程产生的完整源码差异，不撤销已持久化事实。 */
  const cancelDraftFullSourceDiff = (): void => setFullSourceDiff(null)

  /** 把本地冲突缓冲重放到最新远端修订并重新打开完整差异。 */
  const retryLocalAfterConflict = (): void => {
    if (!remoteConflict) return
    const conflict = remoteConflict
    void run(async () => {
      let localPython = conflict.localPython
      if (conflict.localMode === 'canvas') {
        if (!conflict.localGraph) throw new Error('本地画布缓冲不存在')
        let localGraph = conflict.localGraph
        if (
          conflict.selectedNodeNameDirty &&
          conflict.selectedNodeUuid
        ) {
          localGraph = updatePersistentAuthoringNodeName(
            localGraph,
            conflict.selectedNodeUuid,
            conflict.selectedNodeName
          )
        }
        localGraph = rebaseGraphIdentity(localGraph, conflict.remote)
        const generated = await generateCanvasPython(
          localGraph,
          conflict.remote
        )
        localPython = generated.normalized_python_source as string
      }
      setFullSourceDiff({
        before: authoritativePython(conflict.remote),
        after: localPython,
        expectedDraftHash: conflict.remote.draft?.draft_hash ?? null,
        expectedWorkflowRevision: conflict.remote.workflow_revision,
        reason: 'conflict_retry',
        resumeMode: conflict.localMode,
        applyAfterSave: false
      })
      setRemoteConflict(null)
    })
  }

  /** 采用远端权威聚合并明确放弃本地冲突缓冲。 */
  const adoptRemoteConflict = (): void => {
    if (!remoteConflict) return
    const remote = remoteConflict.remote
    remotePending.current = false
    setPendingPythonImport(null)
    setMode(remoteConflict.localMode)
    installAggregate(remote, '已采用远端工作流编辑状态，本地修改已放弃')
  }

  /**
   * 使用 OS 签发的候选哈希应用工作流创作候选。
   *
   * @param candidateHash 当前候选的稳定内容身份。
   * @returns 应用结果与最新工作流创作权威聚合。
   */
  const applyCandidateByHash = async (
    candidateHash: string
  ): Promise<WorkflowAuthoringApplyResponse> => {
    try {
      const applied = await queue.run(
        () => runtime.applyWorkflowAuthoring(
          workflowUuid,
          { candidate_hash: candidateHash }
        )
      )
      installAggregate(
        applied.authoring,
        applied.apply_result.kind === 'graph'
          ? `工作流已应用，当前版本为 ${applied.apply_result.workflow_revision}`
          : '源码已应用，工作流图未发生变化'
      )
      return applied
    } catch (applyError) {
      if (!isAuthoringConflict(applyError)) throw applyError
      let catalogRecovery: {
        catalog: WorkflowActionCatalogSnapshot
        localGraph: WorkflowAuthoringGraph
      } | null = null
      if (isTemplateCatalogConflict(applyError)) {
        const refreshedCatalog = (
          await refreshWorkflowCatalogsAfterConflict()
        ).action
        const currentGraph = localState.current.graph
        if (currentGraph) {
          catalogRecovery = {
            catalog: refreshedCatalog,
            localGraph: currentGraph
          }
        }
      }
      remotePending.current = true
      const refreshed = await queue.run(
        () => runtime.getWorkflowAuthoring(workflowUuid)
      )
      remotePending.current = false
      installAggregate(refreshed, '预览已变化，已刷新最新工作流编辑状态')
      if (catalogRecovery) {
        const rehydrated = rehydrateTypedActionGraph(
          catalogRecovery.catalog,
          catalogRecovery.localGraph
        )
        setGraph(rehydrated)
        setCanvasDirty(true)
        localState.current = {
          ...localState.current,
          graph: rehydrated,
          canvasDirty: true
        }
        setMessage(
          '操作目录与工作流编辑数据已刷新；本地画布已按稳定 UUID 恢复'
        )
      }
      throw applyError
    }
  }

  /**
   * 应用服务器候选；规范化源码尚未物化时先打开完整差异确认。
   *
   * @returns 无返回值；异步应用结果通过工作流编辑器状态呈现。
   */
  const applyCandidate = (): void => {
    const candidate = aggregate?.candidate
    if (!candidate) {
      setError('当前没有可应用的服务器候选版本')
      return
    }
    const draft = aggregate?.draft
    if (!draft) {
      setError('当前候选缺少可确认的工作流源码，请刷新后重试')
      return
    }
    const materialization = workflowCandidateMaterializationDecision({
      draftPython: draft.python_source,
      normalizedPython: candidate.normalized_python_source
    })
    if (materialization.kind === 'review_normalized_source') {
      setFullSourceDiff({
        before: materialization.before,
        after: materialization.after,
        expectedDraftHash: draft.draft_hash,
        expectedWorkflowRevision: aggregate.workflow_revision,
        reason: 'source_normalization',
        resumeMode: mode,
        applyAfterSave: true
      })
      setMessage('请确认 OS 规范化 Python；接受后将自动应用工作流')
      return
    }
    // 候选哈希是 OS 签发的单次应用身份，只能在源码物化门禁通过后提交。
    const candidateHash = candidate.candidate_hash
    void run(async () => {
      await applyCandidateByHash(candidateHash)
    })
  }

  return {
    saveDraft,
    acceptDraftFullSourceDiff,
    cancelDraftFullSourceDiff,
    retryLocalAfterConflict,
    adoptRemoteConflict,
    applyCandidateByHash,
    applyCandidate
  }
}
