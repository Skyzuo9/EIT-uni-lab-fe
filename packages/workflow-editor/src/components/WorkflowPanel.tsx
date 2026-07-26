import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import {
  CodeEditor,
  type CodeLineMarker,
  useCodeMirror
} from '@unilab/code-editor'
import { useResizableSplit } from '@unilab/app-shell'
import type {
  WorkflowAuthoringCandidate,
  WorkflowAuthoringResult,
  WorkflowDebugCommand,
  WorkflowRevision,
  WorkflowRun,
  WorkflowRunEvent,
  WorkflowRunNode,
  WorkflowRuntimePort
} from '@unilab/services'
import WorkflowDag from './WorkflowDag'
import {
  CONTROL_DAG_JSON,
  createWorkflowExecutionScope,
  parseCanonicalWorkflow,
  remapWorkflowBreakpoints,
  remapWorkflowNodeId
} from '../utils/canonicalWorkflow'

export interface WorkflowStepFocus {
  stepId: string
  args: Readonly<Record<string, unknown>>
}

export interface WorkflowPanelProps {
  runtime: WorkflowRuntimePort
  onStepFocus?: (focus: WorkflowStepFocus) => void
}

const TERMINAL_RUN_STATES = new Set(['completed', 'failed', 'cancelled'])
type AuthoringMode = 'json' | 'python'

export default function WorkflowPanel({
  runtime,
  onStepFocus
}: WorkflowPanelProps): React.JSX.Element {
  const [authoringMode, setAuthoringMode] = useState<AuthoringMode>('json')
  const editor = useCodeMirror(CONTROL_DAG_JSON, authoringMode)
  const [canonicalSource, setCanonicalSource] = useState(CONTROL_DAG_JSON)
  const pythonBaseline = useRef<string | null>(null)
  const [pythonSourceMap, setPythonSourceMap] = useState<
    NonNullable<WorkflowAuthoringCandidate['source_map']>
  >([])
  const parsed = useMemo(
    () => parseCanonicalWorkflow(
      authoringMode === 'json' ? editor.value : canonicalSource
    ),
    [authoringMode, canonicalSource, editor.value]
  )
  const [run, setRun] = useState<WorkflowRun | null>(null)
  const [runNodes, setRunNodes] = useState<WorkflowRunNode[]>([])
  const [events, setEvents] = useState<WorkflowRunEvent[]>([])
  const [breakpoints, setBreakpoints] = useState<Set<string>>(
    () => new Set(['branch'])
  )
  const [startNodeId, setStartNodeId] = useState<string | null>('measure')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [message, setMessage] = useState('完整 Canonical DAG 已就绪')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const latestSequence = useRef(0)
  const { containerRef, leftRatio, isDragging, handlePointerDown } =
    useResizableSplit({
      initialRatio: 0.38,
      minRatio: 0.28,
      maxRatio: 0.58
    })

  const nodeStates = useMemo(
    () => Object.fromEntries(
      runNodes.map((node) => [node.sourceNodeId || node.nodeId, node.state])
    ),
    [runNodes]
  )
  const executionScope = useMemo(
    () => createWorkflowExecutionScope(
      parsed.nodes,
      parsed.links,
      startNodeId
    ),
    [parsed.links, parsed.nodes, startNodeId]
  )
  const codeMarkers = useMemo(
    () => workflowCodeMarkers({
      source: editor.value,
      mode: authoringMode,
      nodeIds: parsed.nodes.map((node) => node.id),
      sourceMap: pythonSourceMap,
      startNodeId: executionScope.startNodeId,
      beforeStartNodeIds: executionScope.beforeStartNodeIds,
      breakpoints,
      pausedBeforeNodeId: run?.debug?.pausedBeforeNodeId || null,
      nodeStates
    }),
    [
      authoringMode,
      breakpoints,
      editor.value,
      executionScope.beforeStartNodeIds,
      executionScope.startNodeId,
      nodeStates,
      parsed.nodes,
      pythonSourceMap,
      run?.debug?.pausedBeforeNodeId
    ]
  )

  useEffect(() => {
    editor.setLineMarkers(codeMarkers)
  }, [codeMarkers, editor.setLineMarkers])

  const selectedNode = runNodes.find(
    (node) =>
      node.nodeId === selectedNodeId ||
      node.sourceNodeId === selectedNodeId
  )

  const refreshRun = useCallback(async (runId: string) => {
    const [nextRun, nodes] = await Promise.all([
      runtime.getRun(runId),
      runtime.listRunNodes(runId)
    ])
    setRun(nextRun)
    setRunNodes(nodes)
  }, [runtime])

  useEffect(() => {
    if (!run?.id) return
    const runId = run.id
    const subscription = runtime.subscribeRunEvents(
      runId,
      (event) => {
        latestSequence.current = Math.max(latestSequence.current, event.seq)
        if (event.type === 'node.exception') {
          const detail = String(
            event.payload.message ||
            event.payload.detail ||
            event.payload.code ||
            'OS 返回节点执行失败'
          )
          setError(`节点 ${event.nodeId || 'unknown'} 执行异常：${detail}`)
        }
        setEvents((current) => (
          current.some((item) => item.seq === event.seq)
            ? current
            : [...current, event].sort((left, right) => left.seq - right.seq)
        ))
        void refreshRun(runId)
      },
      {
        afterSeq: latestSequence.current,
        onError: (subscriptionError) => setError(subscriptionError.message)
      }
    )
    void refreshRun(runId)
    return () => subscription.dispose()
  }, [refreshRun, run?.id, runtime])

  const withBusy = useCallback(async (
    operation: () => Promise<void>
  ): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await operation()
    } catch (operationError) {
      setError(
        operationError instanceof Error
          ? operationError.message
          : String(operationError)
      )
    } finally {
      setBusy(false)
    }
  }, [])

  const projectToPython = useCallback(async (
    revision: WorkflowRevision
  ): Promise<WorkflowAuthoringCandidate> => {
    const baseRevisionId = revision.revision_id
    const sourceUri = workflowSourceUri(revision.workflow_id)
    const generated = requireAuthoringCandidate(
      await runtime.generatePythonWorkflow(
        baseRevisionId,
        revision,
        sourceUri
      ),
      'Canonical → Python 转换失败'
    )
    return requireAuthoringCandidate(
      await runtime.validateAuthoringCandidate(baseRevisionId, generated),
      '生成的 Python 工作流未通过编写校验'
    )
  }, [runtime])

  const resolveRevision = useCallback(async (
    forcePythonCompile = false
  ): Promise<WorkflowRevision> => {
    if (authoringMode === 'json') {
      const current = parseCanonicalWorkflow(editor.value)
      if (!current.revision) {
        throw new Error(current.error || 'Canonical DAG 无法解析')
      }
      setCanonicalSource(editor.value)
      return current.revision
    }

    const current = parseCanonicalWorkflow(canonicalSource)
    if (!current.revision) {
      throw new Error(current.error || '缺少可供 Python 编译的基础 Revision')
    }
    if (!forcePythonCompile && editor.value === pythonBaseline.current) {
      return current.revision
    }

    const baseRevisionId = current.revision.revision_id
    const sourceUri = workflowSourceUri(current.revision.workflow_id)
    const compiled = requireAuthoringCandidate(
      await runtime.compilePythonWorkflow(
        baseRevisionId,
        editor.value,
        sourceUri
      ),
      'Python → Canonical 编译失败'
    )
    const validated = requireAuthoringCandidate(
      await runtime.validateAuthoringCandidate(baseRevisionId, compiled),
      'Python 工作流未通过编写校验'
    )
    const nextCanonical = JSON.stringify(validated.canonical_ir, null, 2)
    const next = parseCanonicalWorkflow(nextCanonical)
    if (!next.revision) {
      throw new Error(next.error || 'OS 返回了无效的 Canonical Revision')
    }
    setBreakpoints((currentBreakpoints) =>
      remapWorkflowBreakpoints(
        current.revision as WorkflowRevision,
        next.revision as WorkflowRevision,
        currentBreakpoints
      )
    )
    setStartNodeId((currentStartNodeId) =>
      remapWorkflowNodeId(
        current.revision as WorkflowRevision,
        next.revision as WorkflowRevision,
        currentStartNodeId
      )
    )
    setPythonSourceMap(validated.source_map || [])
    setCanonicalSource(nextCanonical)
    pythonBaseline.current = editor.value
    setMessage(
      `Python 已编译 · ${next.nodes.length} 节点 · ${next.links.length} 边`
    )
    return next.revision
  }, [authoringMode, canonicalSource, editor.value, runtime])

  const validate = useCallback(async (): Promise<WorkflowRevision | null> => {
    const revision = await resolveRevision()
    const result = await runtime.validateWorkflow(revision)
    if (!result.valid) {
      setError(result.issues.map((issue) => `${issue.code}: ${issue.message}`).join('\n'))
      setMessage('校验未通过')
      return null
    }
    setMessage(
      `校验通过 · ${result.nodeCount ?? revision.invocations.length} 节点 · ${
        result.edgeCount ?? revision.control_edges.length
      } 边`
    )
    return revision
  }, [resolveRevision, runtime])

  const switchAuthoringMode = (nextMode: AuthoringMode): void => {
    if (nextMode === authoringMode) return
    void withBusy(async () => {
      if (nextMode === 'python') {
        const revision = await resolveRevision()
        const candidate = await projectToPython(revision)
        const nextCanonical = JSON.stringify(candidate.canonical_ir, null, 2)
        setCanonicalSource(nextCanonical)
        setPythonSourceMap(candidate.source_map || [])
        pythonBaseline.current = candidate.python_source
        setAuthoringMode('python')
        editor.replaceContent(candidate.python_source)
        setMessage('已由 OS 生成 Python，可编辑后编译、保存或运行')
        return
      }

      const revision = await resolveRevision()
      const nextCanonical = JSON.stringify(revision, null, 2)
      setCanonicalSource(nextCanonical)
      setAuthoringMode('json')
      editor.replaceContent(nextCanonical)
      setMessage('Python 已通过 OS 编译并切换为 Canonical JSON')
    })
  }

  const save = (): void => {
    void withBusy(async () => {
      const revision = await validate()
      if (!revision) return
      const document = await runtime.saveWorkflow(
        revision.workflow_id,
        revision
      )
      setCanonicalSource(
        JSON.stringify(document.revision.canonical, null, 2)
      )
      editor.markSaved()
      setMessage(`已保存 Revision ${document.revision.id}`)
    })
  }

  const load = (): void => {
    void withBusy(async () => {
      const document = await runtime.getWorkflow('control-demo')
      const revision = document.revision.canonical
      if (authoringMode === 'python') {
        const candidate = await projectToPython(revision)
        setCanonicalSource(JSON.stringify(candidate.canonical_ir, null, 2))
        setPythonSourceMap(candidate.source_map || [])
        pythonBaseline.current = candidate.python_source
        editor.replaceContent(candidate.python_source)
      } else {
        const nextCanonical = JSON.stringify(revision, null, 2)
        setCanonicalSource(nextCanonical)
        editor.replaceContent(nextCanonical)
      }
      setMessage(`已载入 OS Revision ${document.revision.id}`)
    })
  }

  const startRun = (debug: boolean): void => {
    void withBusy(async () => {
      const revision = await validate()
      if (!revision) return
      latestSequence.current = 0
      setEvents([])
      setRunNodes([])
      const created = await runtime.createRun({
        client_request_id: globalThis.crypto?.randomUUID?.() || String(Date.now()),
        source: {
          format: 'workflow_revision_v2',
          revision
        },
        ...(debug
          ? {
              debug: {
                pause_on_start: true,
                breakpoints: [...breakpoints].filter((nodeId) =>
                  executionScope.executableNodeIds.has(nodeId)
                ),
                ...(executionScope.startNodeId
                  ? { start_node_id: executionScope.startNodeId }
                  : {})
              }
            }
          : {})
      })
      setRun(created)
      setMessage(
        debug
          ? `调试运行 ${created.id.slice(0, 8)} 已创建，等待安全暂停`
          : `整图运行 ${created.id.slice(0, 8)} 已下发`
      )
    })
  }

  const command = (name: WorkflowDebugCommand, payload = {}): void => {
    if (!run) return
    void withBusy(async () => {
      const next = await runtime.command(run.id, name, payload)
      setRun(next)
      await refreshRun(run.id)
      setMessage(`调试命令 ${name} 已由 OS 接受`)
    })
  }

  const toggleBreakpoint = (nodeId: string): void => {
    const next = new Set(breakpoints)
    if (next.has(nodeId)) next.delete(nodeId)
    else next.add(nodeId)
    setBreakpoints(next)
    if (run?.debug?.enabled && !TERMINAL_RUN_STATES.has(run.status)) {
      command('set_breakpoints', { node_ids: [...next] })
    }
  }

  const setExecutionStart = (nodeId: string): void => {
    if (run?.debug?.enabled && !TERMINAL_RUN_STATES.has(run.status)) {
      setError('起始点在本次运行创建后不可修改；请先终止运行再重新设置')
      return
    }
    setStartNodeId((current) => {
      const next = current === nodeId ? null : nodeId
      setMessage(
        next
          ? `已设置调试起始点 ${nodeId}；其之前及不可达节点在调试运行中不执行`
          : '已取消指定起始点，将从 DAG 根节点开始'
      )
      return next
    })
  }

  const selectNode = (nodeId: string): void => {
    setSelectedNodeId(nodeId)
    const sourceLine = workflowNodeLine(
      editor.value,
      authoringMode,
      pythonSourceMap,
      nodeId
    )
    if (sourceLine) editor.revealLine(sourceLine)
    const step = parsed.steps[
      parsed.nodes.findIndex((node) => node.id === nodeId)
    ]
    if (step) onStepFocus?.({ stepId: nodeId, args: step.args })
  }

  const debugStatus = run?.debug?.status || 'disabled'
  const paused = debugStatus === 'paused'
  const running = ['running', 'pause_pending', 'stepping'].includes(debugStatus)
  const canCommand = Boolean(run?.debug?.enabled) &&
    !TERMINAL_RUN_STATES.has(run?.status || '')
  const sourceInvalid = authoringMode === 'json' && Boolean(parsed.error)

  return (
    <div className="workflow workflow-runtime">
      <div className="workflow__toolbar">
        <span className="workflow__toolbar-label">Workflow Runtime</span>
        <div
          className="workflow__mode-switch"
          role="group"
          aria-label="工作流代码格式"
        >
          <button
            type="button"
            className={authoringMode === 'json' ? 'is-active' : ''}
            aria-pressed={authoringMode === 'json'}
            disabled={busy}
            onClick={() => switchAuthoringMode('json')}
          >
            JSON
          </button>
          <button
            type="button"
            className={authoringMode === 'python' ? 'is-active' : ''}
            aria-pressed={authoringMode === 'python'}
            disabled={busy}
            onClick={() => switchAuthoringMode('python')}
          >
            Python
          </button>
        </div>
        <span className="workflow__format">
          {authoringMode === 'json' ? 'Canonical v2' : 'from_python_script'}
        </span>
        <span className={`workflow-runtime__run-state workflow-runtime__run-state--${run?.status || 'draft'}`}>
          {run?.status || 'draft'}
        </span>
        <span className="workflow-runtime__message">{message}</span>
        <div className="workflow__toolbar-actions">
          <button type="button" className="workflow__upload" disabled={busy} onClick={load}>
            从 OS 载入
          </button>
          {authoringMode === 'python' && (
            <button
              type="button"
              className="workflow__upload"
              disabled={busy}
              onClick={() => void withBusy(async () => {
                await resolveRevision(true)
              })}
            >
              编译 Python
            </button>
          )}
          <button
            type="button"
            className="workflow__upload"
            disabled={busy || sourceInvalid}
            onClick={() => void withBusy(async () => { await validate() })}
          >
            校验
          </button>
          <button type="button" className="workflow__upload" disabled={busy} onClick={save}>
            保存 Revision
          </button>
          <button
            type="button"
            className="workflow-runtime__primary"
            disabled={busy || sourceInvalid}
            onClick={() => startRun(false)}
          >
            ▶ 整图执行
          </button>
          <button
            type="button"
            className="workflow-runtime__debug-start"
            disabled={busy || sourceInvalid}
            onClick={() => startRun(true)}
          >
            ◆ 调试启动
          </button>
        </div>
      </div>

      {error && (
        <div className="workflow-runtime__problem" role="alert">
          <strong>异常处理</strong>
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)}>关闭</button>
        </div>
      )}

      <div
        ref={containerRef}
        className={`workbench workflow-runtime__workbench${
          isDragging ? ' workbench--dragging' : ''
        }`}
      >
        <div className="workbench__pane" style={{ flexBasis: `${leftRatio * 100}%` }}>
          <CodeEditor
            title={
              authoringMode === 'json'
                ? `${parsed.revision?.workflow_id || 'workflow'}.revision.json`
                : `${parsed.revision?.workflow_id || 'workflow'}.py`
            }
            editor={editor}
            language={authoringMode === 'json' ? 'JSON' : 'Python'}
          />
        </div>
        <div
          className="workbench__divider"
          role="separator"
          aria-orientation="vertical"
          onPointerDown={handlePointerDown}
        >
          <span className="workbench__grip" />
        </div>
        <div
          className="workbench__pane workflow-runtime__stage"
          style={{ flexBasis: `${(1 - leftRatio) * 100}%` }}
        >
          <header className="workflow-runtime__stage-header">
            <div>
              <strong>完整控制流 DAG</strong>
              <span>{parsed.nodes.length} 节点 · {parsed.links.length} 控制边</span>
            </div>
            <span className="workflow-runtime__hint">
              单击同步代码 · 右键/⚑ 设置起点 · 双击/● 设置断点
            </span>
          </header>
          <div className="workflow-runtime__legend" aria-label="节点颜色图例">
            <span className="is-start">⚑ 起始点</span>
            <span className="is-breakpoint">● 断点</span>
            <span className="is-paused">蓝色 · 下一步/暂停位置</span>
            <span className="is-running">橙色 · 正在运行</span>
            <span className="is-success">绿色 · 执行成功</span>
            <span className="is-excluded">灰色 · 起点前不执行/已跳过</span>
          </div>
          {parsed.error ? (
            <div className="workflow-runtime__empty">{parsed.error}</div>
          ) : (
            <div className="workflow-runtime__canvas">
              <WorkflowDag
                nodes={parsed.nodes}
                links={parsed.links}
                nodeStates={nodeStates}
                breakpoints={breakpoints}
                startNodeId={executionScope.startNodeId}
                beforeStartNodeIds={executionScope.beforeStartNodeIds}
                pausedBeforeNodeId={run?.debug?.pausedBeforeNodeId || null}
                onNodeSelect={selectNode}
                onSetStart={setExecutionStart}
                onToggleBreakpoint={toggleBreakpoint}
              />
            </div>
          )}

          <div className="workflow-runtime__debugger">
            <div className="workflow-runtime__debug-status">
              <span>Debugger</span>
              <strong className={`is-${debugStatus}`}>{debugStatus}</strong>
              {run?.debug?.pausedBeforeNodeId && (
                <span>暂停于 {run.debug.pausedBeforeNodeId} 之前</span>
              )}
              <span>起点 {executionScope.startNodeId || 'DAG 根节点'}</span>
              <span>{breakpoints.size} 个断点</span>
            </div>
            <div className="workflow-runtime__debug-actions">
              <button disabled={!canCommand || paused || busy} onClick={() => command('pause')}>
                Ⅱ 暂停
              </button>
              <button disabled={!paused || busy} onClick={() => command('step')}>
                ↦ 单步
              </button>
              <button disabled={!paused || busy} onClick={() => command('step_over')}>
                ⇥ 步过
              </button>
              <button disabled={!paused || busy} onClick={() => command('step_into')}>
                ↳ 步入
              </button>
              <button disabled={!paused || busy} onClick={() => command('continue')}>
                ▶ 继续
              </button>
              <button
                className="is-danger"
                disabled={!canCommand || (!paused && !running) || busy}
                onClick={() => command('terminate')}
              >
                ■ 终止
              </button>
              <button
                className="is-danger"
                disabled={!canCommand || busy}
                onClick={() => command('emergency_stop')}
              >
                ⚠ 急停
              </button>
            </div>
          </div>

          <div className="workflow-runtime__results">
            <section>
              <header>
                <strong>节点反馈 / 结果</strong>
                <span>{runNodes.filter((node) => ['success', 'skipped'].includes(node.state)).length}/{runNodes.length || parsed.nodes.length}</span>
              </header>
              <div className="workflow-runtime__node-list">
                {(runNodes.length ? runNodes : parsed.nodes.map((node) => ({
                  nodeId: node.id,
                  sourceNodeId: node.id,
                  nodeType: node.type,
                  deviceId: '',
                  action: node.className,
                  state: executionScope.beforeStartNodeIds.has(node.id)
                    ? 'excluded'
                    : 'pending',
                  result: {},
                  attempt: 0
                }))).map((node) => (
                  <button
                    key={node.nodeId}
                    type="button"
                    className={[
                      selectedNodeId === node.sourceNodeId ? 'is-selected' : '',
                      run?.debug?.pausedBeforeNodeId === node.sourceNodeId
                        ? 'is-paused-before'
                        : ''
                    ].filter(Boolean).join(' ')}
                    onClick={() => selectNode(node.sourceNodeId)}
                  >
                    <i
                      className={
                        run?.debug?.pausedBeforeNodeId === node.sourceNodeId
                          ? 'is-paused-before'
                          : `is-${node.state}`
                      }
                    />
                    <span>{node.sourceNodeId}</span>
                    <em>{node.state}</em>
                  </button>
                ))}
              </div>
              {selectedNode && (
                <pre className="workflow-runtime__node-result">
                  {JSON.stringify(selectedNode.result, null, 2)}
                </pre>
              )}
            </section>
            <section>
              <header>
                <strong>事件流</strong>
                <span>seq {latestSequence.current || '—'}</span>
              </header>
              <div className="workflow-runtime__events">
                {[...events].reverse().slice(0, 7).map((event) => (
                  <div key={event.seq}>
                    <code>#{event.seq}</code>
                    <span>{event.type}</span>
                    <em>{event.nodeId || 'run'}</em>
                  </div>
                ))}
                {events.length === 0 && <p>等待 OS 节点反馈…</p>}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}

function requireAuthoringCandidate(
  result: WorkflowAuthoringResult,
  fallback: string
): WorkflowAuthoringCandidate {
  const diagnostics = [
    ...result.diagnostics,
    ...(result.candidate?.diagnostics || [])
  ]
  const errors = diagnostics.filter((item) => item.severity === 'error')
  if (!result.candidate || errors.length > 0) {
    const detail = (errors.length > 0 ? errors : diagnostics)
      .map((item) => {
        const location = item.start_line
          ? `L${item.start_line}:${item.start_column || 1} `
          : ''
        return `${location}${item.code}: ${item.message}`
      })
      .join('\n')
    throw new Error(detail || fallback)
  }
  return result.candidate
}

function workflowSourceUri(workflowId: string): string {
  const safeName = workflowId
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'workflow'
  return `workflows/${safeName}.py`
}

interface WorkflowCodeMarkerOptions {
  source: string
  mode: AuthoringMode
  nodeIds: ReadonlyArray<string>
  sourceMap: NonNullable<WorkflowAuthoringCandidate['source_map']>
  startNodeId: string | null
  beforeStartNodeIds: ReadonlySet<string>
  breakpoints: ReadonlySet<string>
  pausedBeforeNodeId: string | null
  nodeStates: Readonly<Record<string, string>>
}

function workflowCodeMarkers(
  options: WorkflowCodeMarkerOptions
): CodeLineMarker[] {
  const markers: CodeLineMarker[] = []
  for (const nodeId of options.nodeIds) {
    const line = workflowNodeLine(
      options.source,
      options.mode,
      options.sourceMap,
      nodeId
    )
    if (!line) continue
    if (options.beforeStartNodeIds.has(nodeId)) {
      markers.push({ line, kind: 'before-start', label: '不执行' })
    } else {
      const state = options.nodeStates[nodeId]
      if (state === 'running') {
        markers.push({ line, kind: 'running', label: '正在运行' })
      } else if (state === 'success') {
        markers.push({ line, kind: 'success', label: '成功' })
      } else if (state === 'failed' || state === 'reconciling') {
        markers.push({ line, kind: 'failed', label: '失败' })
      } else if (state === 'skipped') {
        markers.push({ line, kind: 'skipped', label: '已跳过' })
      }
    }
    if (options.startNodeId === nodeId) {
      markers.push({ line, kind: 'start', label: '⚑ 起始点' })
    }
    if (options.breakpoints.has(nodeId)) {
      markers.push({ line, kind: 'breakpoint', label: '● 断点' })
    }
    if (options.pausedBeforeNodeId === nodeId) {
      markers.push({ line, kind: 'paused', label: '下一步' })
    }
  }
  return markers
}

function workflowNodeLine(
  source: string,
  mode: AuthoringMode,
  sourceMap: NonNullable<WorkflowAuthoringCandidate['source_map']>,
  nodeId: string
): number | null {
  if (mode === 'python') {
    const span = sourceMap.find((item) => item.node_id === nodeId)
    return span?.start_line || null
  }
  const encodedNodeId = JSON.stringify(nodeId)
  const lines = source.split(/\r?\n/)
  const index = lines.findIndex(
    (line) => line.includes('"node_id"') && line.includes(encodedNodeId)
  )
  return index >= 0 ? index + 1 : null
}
