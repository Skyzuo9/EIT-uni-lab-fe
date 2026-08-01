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
  workflowAuthoringInvalidationDecision,
  workflowAuthoringModeSwitchDecision,
  workflowAuthoringSurfacePolicy,
  workflowCanvasDraftSaveDecision,
  type WorkflowEditMode
} from '../utils/workflowCanvasPolicy'
import {
  projectPersistentAuthoringGraph,
  updatePersistentAuthoringNodePosition
} from '../utils/persistentAuthoringGraph'
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
  const [message, setMessage] = useState('正在读取 OS Authoring 状态…')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pendingMode, setPendingMode] = useState<WorkflowEditMode | null>(null)
  const [fullSourceDiff, setFullSourceDiff] =
    useState<FullSourceDiff | null>(null)
  const localState = useRef({
    mode,
    codeDirty: editor.isDirty,
    canvasDirty,
    editorValue: editor.value
  })
  localState.current = {
    mode,
    codeDirty: editor.isDirty,
    canvasDirty,
    editorValue: editor.value
  }

  const structure = useMemo(
    () => graph
      ? projectPersistentAuthoringGraph(graph)
      : { nodes: [], links: [], steps: [], error: null },
    [graph]
  )
  const dirty = mode === 'code' ? editor.isDirty : canvasDirty

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
    setAggregate(next)
    setGraph(authoritativeGraph(next))
    editor.replaceContent(authoritativePython(next))
    setCanvasDirty(false)
    setMessage(nextMessage)
  }, [editor.replaceContent])

  useEffect(() => {
    let active = true
    setBusy(true)
    setError(null)
    void runtime.getWorkflowAuthoring(workflowUuid)
      .then((next) => {
        if (!active) return
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
  }, [installAggregate, runtime, workflowUuid])

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
          const next = await runtime.getWorkflowAuthoring(workflowUuid)
          if (!active) return
          const current = localState.current
          const dirtyAtInstall = current.mode === 'code'
            ? current.codeDirty
            : current.canvasDirty
          if (dirtyAtInstall) {
            setMessage('检测到外部修改；请先保存或放弃当前本地修改')
            return
          }
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
      () => {
        const current = localState.current
        const decision = workflowAuthoringInvalidationDecision({
          dirty: current.mode === 'code'
            ? current.codeDirty
            : current.canvasDirty,
          localPython: current.editorValue
        })
        if (decision.kind === 'defer_remote') {
          setMessage('检测到外部修改；请先保存或放弃当前本地修改')
          return
        }
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
  }, [installAggregate, runtime, workflowUuid])

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

  const generateCanvasPython = useCallback(async (
    sourceGraph: WorkflowAuthoringGraph
  ): Promise<WorkflowAuthoringTransformResult> => {
    if (!aggregate) throw new Error('Authoring aggregate 尚未就绪')
    const sourceUri = aggregate.draft?.source_uri
    if (!sourceUri) throw new Error('当前 Workflow 尚未注册 package Python Draft')
    const generated = await runtime.generateWorkflowAuthoringPython({
      workflow_uuid: workflowUuid,
      revision: aggregate.workflow_revision,
      source_uri: sourceUri,
      graph: sourceGraph
    })
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
  }, [aggregate, runtime, workflowUuid])

  const enterMode = useCallback(async (
    nextMode: WorkflowEditMode
  ): Promise<void> => {
    if (!aggregate) throw new Error('Authoring aggregate 尚未就绪')
    if (nextMode === 'canvas') {
      const sourceGraph = authoritativeGraph(aggregate)
      const generated = await generateCanvasPython(sourceGraph)
      setGraph(generated.graph || sourceGraph)
      editor.replaceContent(generated.normalized_python_source as string)
      setCanvasDirty(false)
      setMode('canvas')
      setMessage('画布模式：Python 是 OS 生成的只读投影')
      return
    }
    setGraph(authoritativeGraph(aggregate))
    editor.replaceContent(authoritativePython(aggregate))
    setCanvasDirty(false)
    setMode('code')
    setMessage('代码模式：画布是 Candidate 的只读投影')
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
    setGraph(authoritativeGraph(aggregate))
    setCanvasDirty(false)
    void run(() => enterMode(nextMode))
  }

  const saveDraft = (): void => {
    if (!aggregate) return
    if (mode === 'code') {
      void run(async () => {
        const saved = await runtime.saveWorkflowAuthoringDraft(
          workflowUuid,
          {
            python_source: editor.value,
            expected_draft_hash: aggregate.draft?.draft_hash ?? null,
            expected_workflow_revision: aggregate.workflow_revision
          }
        )
        installAggregate(saved, 'Python Draft 已保存；Candidate 已由 OS 更新')
      })
      return
    }
    if (!graph) return
    void run(async () => {
      const generated = await generateCanvasPython(graph)
      const decision = workflowCanvasDraftSaveDecision({
        baselinePython: authoritativePython(aggregate),
        generatedPython: generated.normalized_python_source as string,
        fullDiffAccepted: false
      })
      if (decision.kind === 'review_full_diff') {
        setFullSourceDiff({
          before: decision.before,
          after: decision.after
        })
      }
    })
  }

  const acceptFullSourceDiff = (): void => {
    if (!aggregate || !fullSourceDiff) return
    const decision = workflowCanvasDraftSaveDecision({
      baselinePython: fullSourceDiff.before,
      generatedPython: fullSourceDiff.after,
      fullDiffAccepted: true
    })
    if (decision.kind !== 'write_complete_draft') return
    setFullSourceDiff(null)
    void run(async () => {
      const saved = await runtime.saveWorkflowAuthoringDraft(
        workflowUuid,
        {
          python_source: decision.python_source,
          expected_draft_hash: aggregate.draft?.draft_hash ?? null,
          expected_workflow_revision: aggregate.workflow_revision
        }
      )
      installAggregate(saved, '完整 Python 差异已接受并保存')
      setMode('canvas')
    })
  }

  const applyCandidate = (): void => {
    const candidateHash = aggregate?.candidate?.candidate_hash
    if (!candidateHash) {
      setError('当前没有可应用的 server-owned Candidate')
      return
    }
    void run(async () => {
      const applied = await runtime.applyWorkflowAuthoring(
        workflowUuid,
        { candidate_hash: candidateHash }
      )
      installAggregate(
        applied.authoring,
        `工作流已应用 · revision ${applied.apply_result.workflow_revision}`
      )
    })
  }

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
              {mode === 'code'
                ? '画布是 server-owned Candidate 的只读投影'
                : '画布编辑缓冲可写；保存时由 OS 生成完整 Python'}
            </p>
          </header>
          <div className="persistent-authoring__canvas-body">
            {graph ? (
              <WorkflowDag
                nodes={structure.nodes}
                links={structure.links}
                onNodeSelect={() => undefined}
                canBeautify={false}
                canvasMutationEnabled={policy.canvasMutationEnabled}
                onNodePositionChange={(nodeId, position) => {
                  setGraph((current) => current
                    ? updatePersistentAuthoringNodePosition(
                        current,
                        nodeId,
                        position
                      )
                    : current
                  )
                  setCanvasDirty(true)
                  setMessage('画布缓冲已修改；保存前将生成完整 Python 差异')
                }}
              />
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

      {fullSourceDiff && (
        <div className="workflow-save-prompt">
          <section
            className="workflow-save-prompt__dialog persistent-authoring__diff"
            role="dialog"
            aria-modal="true"
            aria-label="完整 Python 差异"
          >
            <header className="workflow-save-prompt__header">
              <span className="workflow-save-prompt__eyebrow">画布保存检查</span>
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

function authoritativeGraph(
  aggregate: WorkflowAuthoringAggregate
): WorkflowAuthoringGraph {
  return aggregate.candidate?.graph || aggregate.applied_graph
}

function authoritativePython(
  aggregate: WorkflowAuthoringAggregate
): string {
  return aggregate.draft?.python_source ||
    aggregate.applied_source?.python_source ||
    ''
}

function authoringStateMessage(
  aggregate: WorkflowAuthoringAggregate
): string {
  const labels: Record<WorkflowAuthoringAggregate['state'], string> = {
    draft_missing: 'Python Draft 尚未创建',
    draft_invalid: 'Python Draft 存在编译错误',
    candidate_stale: 'Candidate 已过期，请重新保存 Draft',
    unapplied_source_only: '源码有未应用修改',
    unapplied_graph: '图与源码有未应用修改',
    applied: 'Authoring 与已应用工作流一致',
    applied_source_stale: '已应用源码与当前 Draft 不一致'
  }
  return labels[aggregate.state]
}

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value)
}
