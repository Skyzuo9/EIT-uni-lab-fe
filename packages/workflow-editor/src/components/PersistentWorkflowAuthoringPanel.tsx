import { useCodeMirror, CodeEditor } from '@unilab/code-editor'
import type {
  WorkflowAuthoringAggregate,
  WorkflowAuthoringGraph,
  WorkflowAuthoringTransformResult,
  WorkflowRuntimePort
} from '@unilab/services'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'

import {
  workflowAuthoringModeSwitchDecision,
  workflowAuthoringSurfacePolicy,
  workflowCanvasDraftSaveDecision,
  type WorkflowEditMode
} from '../utils/workflowCanvasPolicy'
import {
  projectPersistentAuthoringGraph,
  updatePersistentAuthoringNodeName
} from '../utils/persistentAuthoringGraph'
import {
  AuthoringOperationQueue,
  authoringProjection,
  authoringStateMessage,
  diagnosticRange,
  draftSaveMessage,
  isAuthoringConflict,
  isCurrentAuthoringInvalidation,
  isSameAuthoringVersion
} from '../utils/persistentAuthoringSession'
import WorkflowDag from './WorkflowDag'
import styles from './workflow.module.scss'

interface PersistentWorkflowAuthoringPanelProps {
  runtime: WorkflowRuntimePort
  workflowUuid: string
  onUnsavedChangesChange?: (hasUnsavedChanges: boolean) => void
}

interface FullSourceDiff {
  before: string
  after: string
  expectedDraftHash: string | null
  expectedWorkflowRevision: number
  reason: 'canvas_save' | 'conflict_retry'
  resumeMode: WorkflowEditMode
}

interface RemoteConflict {
  remote: WorkflowAuthoringAggregate
  localMode: WorkflowEditMode
  localPython: string
  localGraph: WorkflowAuthoringGraph | null
  selectedNodeUuid: string | null
  selectedNodeName: string
  selectedNodeNameDirty: boolean
}

export function PersistentWorkflowAuthoringPanel({
  runtime,
  workflowUuid,
  onUnsavedChangesChange
}: PersistentWorkflowAuthoringPanelProps): React.JSX.Element {
  const [mode, setMode] = useState<WorkflowEditMode>('code')
  const [aggregate, setAggregate] =
    useState<WorkflowAuthoringAggregate | null>(null)
  const policy = workflowAuthoringSurfacePolicy(mode)
  const editor = useCodeMirror(
    '',
    'python',
    '',
    policy.pythonEditorReadOnly || aggregate === null
  )
  const [graph, setGraph] = useState<WorkflowAuthoringGraph | null>(null)
  const [canvasDirty, setCanvasDirty] = useState(false)
  const [selectedNodeUuid, setSelectedNodeUuid] = useState<string | null>(null)
  const [selectedNodeName, setSelectedNodeName] = useState('')
  const [selectedNodeNameDirty, setSelectedNodeNameDirty] = useState(false)
  const [message, setMessage] = useState('正在读取 OS Authoring 状态…')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pendingMode, setPendingMode] = useState<WorkflowEditMode | null>(null)
  const [fullSourceDiff, setFullSourceDiff] =
    useState<FullSourceDiff | null>(null)
  const [remoteConflict, setRemoteConflict] =
    useState<RemoteConflict | null>(null)
  const operationQueue = useRef<AuthoringOperationQueue | null>(null)
  if (operationQueue.current === null) {
    operationQueue.current = new AuthoringOperationQueue()
  }
  const queue = operationQueue.current
  const remotePending = useRef(false)
  const localState = useRef({
    mode,
    codeDirty: editor.isDirty,
    canvasDirty: canvasDirty || selectedNodeNameDirty,
    editorValue: editor.value,
    aggregate,
    graph,
    selectedNodeUuid,
    selectedNodeName,
    selectedNodeNameDirty
  })
  localState.current = {
    mode,
    codeDirty: editor.isDirty,
    canvasDirty: canvasDirty || selectedNodeNameDirty,
    editorValue: editor.value,
    aggregate,
    graph,
    selectedNodeUuid,
    selectedNodeName,
    selectedNodeNameDirty
  }

  const structure = useMemo(
    () => graph
      ? projectPersistentAuthoringGraph(graph)
      : { nodes: [], links: [], steps: [], error: null },
    [graph]
  )
  const dirty = mode === 'code'
    ? editor.isDirty
    : canvasDirty || selectedNodeNameDirty

  useEffect(() => {
    onUnsavedChangesChange?.(dirty)
  }, [dirty, onUnsavedChangesChange])

  useEffect(
    () => () => onUnsavedChangesChange?.(false),
    [onUnsavedChangesChange]
  )

  const installAggregate = useCallback((
    next: WorkflowAuthoringAggregate,
    nextMessage: string
  ): void => {
    const projection = authoringProjection(next)
    const python = authoritativePython(next)
    setAggregate(next)
    setGraph(projection.graph)
    editor.replaceContent(python)
    setCanvasDirty(false)
    setSelectedNodeUuid(null)
    setSelectedNodeName('')
    setSelectedNodeNameDirty(false)
    setRemoteConflict(null)
    setMessage(nextMessage)
    localState.current = {
      ...localState.current,
      codeDirty: false,
      canvasDirty: false,
      editorValue: python,
      aggregate: next,
      graph: projection.graph,
      selectedNodeUuid: null,
      selectedNodeName: '',
      selectedNodeNameDirty: false
    }
  }, [editor.replaceContent])

  useEffect(() => {
    let active = true
    setBusy(true)
    setError(null)
    void queue.run(
      () => runtime.getWorkflowAuthoring(workflowUuid)
    )
      .then((next) => {
        if (!active) return
        remotePending.current = false
        installAggregate(next, authoringStateMessage(next))
      })
      .catch((loadError) => {
        if (!active) return
        setError(errorMessage(loadError))
      })
      .finally(() => {
        if (active) setBusy(false)
      })
    return () => {
      active = false
    }
  }, [installAggregate, queue, runtime, workflowUuid])

  useEffect(() => {
    let active = true
    let refreshInFlight = false
    let refreshPending = false

    const refreshFromAuthority = async (): Promise<void> => {
      if (refreshInFlight) {
        refreshPending = true
        return
      }
      refreshInFlight = true
      try {
        do {
          refreshPending = false
          const next = await queue.run(
            () => runtime.getWorkflowAuthoring(workflowUuid)
          )
          if (!active) return
          const current = localState.current
          if (isSameAuthoringVersion(next, current.aggregate)) {
            remotePending.current = false
            continue
          }
          const dirtyAtInstall = current.mode === 'code'
            ? current.codeDirty
            : current.canvasDirty
          if (dirtyAtInstall) {
            remotePending.current = true
            setRemoteConflict({
              remote: next,
              localMode: current.mode,
              localPython: current.editorValue,
              localGraph: current.graph,
              selectedNodeUuid: current.selectedNodeUuid,
              selectedNodeName: current.selectedNodeName,
              selectedNodeNameDirty: current.selectedNodeNameDirty
            })
            setMessage('检测到外部修改；本地内容已保留，请比较后明确处理')
            return
          }
          remotePending.current = false
          installAggregate(next, '已同步外部修改')
        } while (active && refreshPending)
      } catch (refreshError) {
        if (active) setError(errorMessage(refreshError))
      } finally {
        refreshInFlight = false
      }
    }

    const subscription = runtime.subscribeWorkflowAuthoring(
      workflowUuid,
      (event) => {
        const current = localState.current
        if (isCurrentAuthoringInvalidation(event, current.aggregate)) return
        remotePending.current = true
        void refreshFromAuthority()
      },
      {
        onError: (streamError) => {
          setError(`Authoring 实时同步中断：${streamError.message}`)
        }
      }
    )
    return () => {
      active = false
      subscription.dispose()
    }
  }, [installAggregate, queue, runtime, workflowUuid])

  const run = useCallback(async (
    operation: () => Promise<void>
  ): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await operation()
    } catch (operationError) {
      setError(errorMessage(operationError))
    } finally {
      setBusy(false)
    }
  }, [])

  const readRemoteConflict = useCallback(async (): Promise<void> => {
    const remote = await queue.run(
      () => runtime.getWorkflowAuthoring(workflowUuid)
    )
    const current = localState.current
    const currentDirty = current.mode === 'code'
      ? current.codeDirty
      : current.canvasDirty
    if (!currentDirty) {
      remotePending.current = false
      installAggregate(remote, '已同步远端 Authoring 状态')
      return
    }
    remotePending.current = true
    setRemoteConflict({
      remote,
      localMode: current.mode,
      localPython: current.editorValue,
      localGraph: current.graph,
      selectedNodeUuid: current.selectedNodeUuid,
      selectedNodeName: current.selectedNodeName,
      selectedNodeNameDirty: current.selectedNodeNameDirty
    })
    setMessage('远端状态已补读；本地内容保持不变，请比较后明确处理')
  }, [installAggregate, queue, runtime, workflowUuid])

  const generateCanvasPython = useCallback(async (
    sourceGraph: WorkflowAuthoringGraph,
    authority: WorkflowAuthoringAggregate = aggregate as WorkflowAuthoringAggregate
  ): Promise<WorkflowAuthoringTransformResult> => {
    if (!authority) throw new Error('Authoring aggregate 尚未就绪')
    const sourceUri = authority.draft?.source_uri
    if (!sourceUri) throw new Error('当前 Workflow 尚未注册 package Python Draft')
    const generated = await queue.run(
      () => runtime.generateWorkflowAuthoringPython({
        workflow_uuid: workflowUuid,
        revision: authority.workflow_revision,
        source_uri: sourceUri,
        graph: sourceGraph
      })
    )
    const blocking = generated.diagnostics.filter(
      (diagnostic) => diagnostic.severity === 'error'
    )
    if (blocking.length > 0 || !generated.normalized_python_source) {
      throw new Error(
        blocking.map((item) => `${item.code}: ${item.message}`).join('\n') ||
        'OS 未返回完整规范化 Python'
      )
    }
    return generated
  }, [aggregate, queue, runtime, workflowUuid])

  const enterMode = useCallback(async (
    nextMode: WorkflowEditMode
  ): Promise<void> => {
    if (!aggregate) throw new Error('Authoring aggregate 尚未就绪')
    if (nextMode === 'canvas') {
      const sourceGraph = authoringProjection(aggregate).graph
      const generated = await generateCanvasPython(sourceGraph)
      setGraph(generated.graph || sourceGraph)
      editor.replaceContent(generated.normalized_python_source as string)
      setCanvasDirty(false)
      setSelectedNodeUuid(null)
      setSelectedNodeName('')
      setSelectedNodeNameDirty(false)
      setMode('canvas')
      setMessage('画布模式：Python 是 OS 生成的只读投影')
      return
    }
    setGraph(authoringProjection(aggregate).graph)
    editor.replaceContent(authoritativePython(aggregate))
    setCanvasDirty(false)
    setSelectedNodeUuid(null)
    setSelectedNodeName('')
    setSelectedNodeNameDirty(false)
    setMode('code')
    setMessage(authoringStateMessage(aggregate))
  }, [aggregate, editor.replaceContent, generateCanvasPython])

  const requestMode = (nextMode: WorkflowEditMode): void => {
    const decision = workflowAuthoringModeSwitchDecision({
      currentMode: mode,
      requestedMode: nextMode,
      activeSurfaceDirty: dirty
    })
    if (decision === 'stay') return
    if (decision === 'confirm_dirty') {
      setPendingMode(nextMode)
      return
    }
    void run(() => enterMode(nextMode))
  }

  const discardAndSwitch = (): void => {
    if (!pendingMode || !aggregate) return
    const nextMode = pendingMode
    setPendingMode(null)
    editor.replaceContent(authoritativePython(aggregate))
    setGraph(authoringProjection(aggregate).graph)
    setCanvasDirty(false)
    setSelectedNodeUuid(null)
    setSelectedNodeName('')
    setSelectedNodeNameDirty(false)
    void run(() => enterMode(nextMode))
  }

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
                python_source: editor.value,
                expected_draft_hash: aggregate.draft?.draft_hash ?? null,
                expected_workflow_revision: aggregate.workflow_revision
              }
            )
          )
          installAggregate(saved, draftSaveMessage(saved))
        } catch (saveError) {
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
          resumeMode: 'canvas'
        })
      }
    })
  }

  const acceptFullSourceDiff = (): void => {
    if (!fullSourceDiff) return
    const diff = fullSourceDiff
    const decision = workflowCanvasDraftSaveDecision({
      baselinePython: diff.before,
      generatedPython: diff.after,
      fullDiffAccepted: true
    })
    if (decision.kind !== 'write_complete_draft') return
    void run(async () => {
      try {
        const saved = await queue.run(
          () => runtime.saveWorkflowAuthoringDraft(
            workflowUuid,
            {
              python_source: decision.python_source,
              expected_draft_hash: diff.expectedDraftHash,
              expected_workflow_revision: diff.expectedWorkflowRevision
            }
          )
        )
        remotePending.current = false
        setFullSourceDiff(null)
        installAggregate(saved, draftSaveMessage(saved))
        setMode(diff.resumeMode)
      } catch (saveError) {
        if (!isAuthoringConflict(saveError)) throw saveError
        setFullSourceDiff(null)
        remotePending.current = true
        await readRemoteConflict()
      }
    })
  }

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
        resumeMode: conflict.localMode
      })
      setRemoteConflict(null)
    })
  }

  const adoptRemoteConflict = (): void => {
    if (!remoteConflict) return
    const remote = remoteConflict.remote
    remotePending.current = false
    setMode(remoteConflict.localMode)
    installAggregate(remote, '已采用远端 Authoring 状态，本地修改已放弃')
  }

  const applyCandidate = (): void => {
    const candidateHash = aggregate?.candidate?.candidate_hash
    if (!candidateHash) {
      setError('当前没有可应用的 server-owned Candidate')
      return
    }
    void run(async () => {
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
      } catch (applyError) {
        if (!isAuthoringConflict(applyError)) throw applyError
        remotePending.current = true
        const refreshed = await queue.run(
          () => runtime.getWorkflowAuthoring(workflowUuid)
        )
        remotePending.current = false
        installAggregate(refreshed, '预览已变化，已刷新最新 Authoring 状态')
        throw applyError
      }
    })
  }

  const selectCanvasNode = (nodeUuid: string): void => {
    if (selectedNodeNameDirty && nodeUuid !== selectedNodeUuid) {
      setError('请先保存当前节点名称修改，再选择其他节点')
      return
    }
    const node = graph?.nodes.find((item) => item.uuid === nodeUuid)
    if (!node) return
    setSelectedNodeUuid(nodeUuid)
    setSelectedNodeName(String(node.name || ''))
    setSelectedNodeNameDirty(false)
  }

  const projectionKind = aggregate
    ? authoringProjection(aggregate).kind
    : null
  const diagnostics = aggregate?.draft?.diagnostics ?? []

  return (
    <div
      className={[
        styles.workflow,
        'workflow-runtime persistent-authoring',
        'relative flex h-full w-full flex-col',
        'bg-[var(--unilab-color-canvas)] text-[var(--unilab-color-text)]'
      ].join(' ')}
    >
      <header className="workflow__toolbar persistent-authoring__toolbar">
        <div className="workflow__context">
          <div className="workflow__title-row">
            <span className="workflow__toolbar-label">工作流编写</span>
            <span className="workflow__format">OS Authoring</span>
          </div>
          <span
            className="workflow-runtime__message"
            role="status"
            aria-live="polite"
          >
            {message}
          </span>
        </div>

        <div
          className="workflow__mode-switch"
          role="group"
          aria-label="工作流单编辑权模式"
        >
          <button
            type="button"
            className={mode === 'code' ? 'is-active' : ''}
            aria-pressed={mode === 'code'}
            disabled={busy}
            onClick={() => requestMode('code')}
          >
            代码模式
          </button>
          <button
            type="button"
            className={mode === 'canvas' ? 'is-active' : ''}
            aria-pressed={mode === 'canvas'}
            disabled={busy}
            onClick={() => requestMode('canvas')}
          >
            画布模式
          </button>
        </div>

        <div className="workflow__toolbar-actions">
          <button
            type="button"
            className="workflow__upload"
            disabled={busy || !aggregate}
            onClick={saveDraft}
          >
            保存草稿
          </button>
          <button
            type="button"
            className="workflow-runtime__primary"
            disabled={busy || dirty || !aggregate?.candidate}
            title={dirty ? '请先保存当前可写表示' : undefined}
            onClick={applyCandidate}
          >
            应用工作流
          </button>
        </div>
      </header>

      {error && (
        <div className="workflow-runtime__problem" role="alert">
          <strong>Authoring 操作失败</strong>
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)}>关闭</button>
        </div>
      )}
      {diagnostics.length > 0 && (
        <section
          className="persistent-authoring__diagnostics"
          aria-label="Python 草稿诊断"
        >
          <strong>草稿诊断</strong>
          <ul>
            {diagnostics.map((diagnostic, index) => (
              <li key={`${diagnostic.code}:${index}`}>
                <code>{diagnostic.code}</code>
                <span>{diagnostic.message}</span>
                {diagnosticRange(diagnostic) && (
                  <span>位置 {diagnosticRange(diagnostic)}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <main className="persistent-authoring__workbench">
        <section
          className="persistent-authoring__pane persistent-authoring__code"
          aria-label="Python 编写面"
        >
          <CodeEditor
            title={`${workflowUuid}.py`}
            editor={editor}
            language="Python"
          />
          <p className="persistent-authoring__authority-note">
            {mode === 'canvas'
              ? 'Python 是 OS 生成的只读投影'
              : 'Python Draft 可编辑；保存使用 Draft hash 与 Workflow revision 双 CAS'}
          </p>
        </section>

        <section
          className="persistent-authoring__pane persistent-authoring__canvas"
          aria-label="工作流画布"
        >
          <header className="persistent-authoring__stage-header">
            <div>
              <strong>完整控制流 DAG</strong>
              <span>
                {structure.nodes.length} 个节点 · {structure.links.length} 条边
              </span>
            </div>
            <p>
              {projectionKind === 'candidate'
                ? mode === 'code'
                  ? '画布是 server-owned Candidate 的只读投影'
                  : '画布编辑缓冲以 Candidate 为起点；保存时由 OS 生成完整 Python'
                : mode === 'code'
                  ? '当前显示 Applied Graph；暂无可应用候选'
                  : '画布编辑缓冲以 Applied Graph 为起点；暂无可应用候选'}
            </p>
          </header>
          <div className="persistent-authoring__canvas-body">
            {graph ? (
              <>
                <div className="persistent-authoring__graph-stage">
                  <WorkflowDag
                    nodes={structure.nodes}
                    links={structure.links}
                    onNodeSelect={selectCanvasNode}
                    canBeautify={false}
                    canvasMutationEnabled={false}
                  />
                </div>
                <aside
                  className="persistent-authoring__node-editor"
                  aria-label="画布节点编辑器"
                >
                  <strong>节点属性</strong>
                  {selectedNodeUuid ? (
                    <label>
                      节点名称
                      <input
                        value={selectedNodeName}
                        disabled={
                          busy || !policy.canvasMutationEnabled
                        }
                        aria-describedby="persistent-node-name-help"
                        onChange={(event) => {
                          setSelectedNodeName(event.target.value)
                          setSelectedNodeNameDirty(true)
                          setMessage(
                            '画布缓冲已修改；保存前将生成完整 Python 差异'
                          )
                        }}
                      />
                    </label>
                  ) : (
                    <p>选择一个节点后可编辑可由 Python 表示的属性。</p>
                  )}
                  <p id="persistent-node-name-help">
                    {mode === 'canvas'
                      ? '名称修改属于画布缓冲，接受完整 Python 差异后才会持久化。'
                      : '代码模式下节点属性只读。'}
                  </p>
                </aside>
              </>
            ) : (
              <p className="persistent-authoring__empty">
                正在等待 OS Authoring aggregate…
              </p>
            )}
          </div>
        </section>
      </main>

      {pendingMode && (
        <div className="workflow-save-prompt">
          <section
            className="workflow-save-prompt__dialog"
            role="dialog"
            aria-modal="true"
            aria-label="未保存修改，确认切换模式"
          >
            <header className="workflow-save-prompt__header">
              <h2>未保存修改，确认切换模式</h2>
            </header>
            <div className="workflow-save-prompt__body">
              <p>当前可写表示仍有未保存修改。取消可继续编辑；放弃后才切换。</p>
            </div>
            <footer className="workflow-save-prompt__actions">
              <button
                type="button"
                className="workflow-save-prompt__cancel"
                onClick={() => setPendingMode(null)}
              >
                取消
              </button>
              <button
                type="button"
                className="workflow-save-prompt__revision"
                onClick={discardAndSwitch}
              >
                放弃修改并切换
              </button>
            </footer>
          </section>
        </div>
      )}

      {remoteConflict && (
        <div className="workflow-save-prompt">
          <section
            className="workflow-save-prompt__dialog persistent-authoring__diff"
            role="dialog"
            aria-modal="true"
            aria-label="远端修改冲突"
          >
            <header className="workflow-save-prompt__header">
              <span className="workflow-save-prompt__eyebrow">双 CAS 冲突</span>
              <h2>远端状态已变化</h2>
            </header>
            <div className="workflow-save-prompt__body">
              <p>
                本地修改仍保留。可以继续编辑、采用远端状态，或先查看完整源码差异，
                再使用刚补读的新 token 明确重试。
              </p>
            </div>
            <footer className="workflow-save-prompt__actions">
              <button
                type="button"
                className="workflow-save-prompt__cancel"
                onClick={() => {
                  setRemoteConflict(null)
                  setMessage('本地修改继续保留；保存时仍需先解决远端冲突')
                }}
              >
                继续编辑本地内容
              </button>
              <button
                type="button"
                className="workflow-save-prompt__revision"
                onClick={adoptRemoteConflict}
              >
                采用远端并放弃本地
              </button>
              <button
                type="button"
                className="workflow-save-prompt__file"
                onClick={retryLocalAfterConflict}
              >
                查看差异并用本地重试
              </button>
            </footer>
          </section>
        </div>
      )}

      {fullSourceDiff && (
        <div className="workflow-save-prompt">
          <section
            className="workflow-save-prompt__dialog persistent-authoring__diff"
            role="dialog"
            aria-modal="true"
            aria-label="完整 Python 差异"
          >
            <header className="workflow-save-prompt__header">
              <span className="workflow-save-prompt__eyebrow">
                {fullSourceDiff.reason === 'conflict_retry'
                  ? '冲突重试检查'
                  : '画布保存检查'}
              </span>
              <h2>完整 Python 差异</h2>
            </header>
            <div className="persistent-authoring__diff-grid">
              <section>
                <h3>当前 Python</h3>
                <pre>{fullSourceDiff.before}</pre>
              </section>
              <section>
                <h3>生成的完整 Python</h3>
                <pre>{fullSourceDiff.after}</pre>
              </section>
            </div>
            <footer className="workflow-save-prompt__actions">
              <button
                type="button"
                className="workflow-save-prompt__cancel"
                onClick={() => setFullSourceDiff(null)}
              >
                取消
              </button>
              <button
                type="button"
                className="workflow-save-prompt__file"
                onClick={acceptFullSourceDiff}
              >
                接受完整差异并保存
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  )
}

function authoritativePython(
  aggregate: WorkflowAuthoringAggregate
): string {
  return aggregate.draft?.python_source ||
    aggregate.applied_source?.python_source ||
    ''
}

function rebaseGraphIdentity(
  local: WorkflowAuthoringGraph,
  remote: WorkflowAuthoringAggregate
): WorkflowAuthoringGraph {
  const remoteGraph = authoringProjection(remote).graph
  return {
    ...local,
    workflow: {
      ...local.workflow,
      ...remoteGraph.workflow
    }
  }
}

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value)
}
