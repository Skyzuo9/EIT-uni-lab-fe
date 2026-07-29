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
import { migrateCloudWorkflowJson } from '../utils/parseWorkflowJson'
import { workflowDebugControls } from '../utils/debugControls'
import { useWorkflowFileUpload } from '../hooks/useWorkflowFileUpload'

export interface WorkflowStepFocus {
  stepId: string
  args: Readonly<Record<string, unknown>>
}

export interface WorkflowPanelProps {
  runtime: WorkflowRuntimePort
  activeWorkflowStorageKey?: string
  onStepFocus?: (focus: WorkflowStepFocus) => void
}

const TERMINAL_RUN_STATES = new Set(['completed', 'failed', 'cancelled'])
type AuthoringMode = 'json' | 'python'
type RunMode = 'run' | 'debug'
type OutputTab = 'nodes' | 'events' | 'errors'
type CompactPane = 'code' | 'dag'

export default function WorkflowPanel({
  runtime,
  activeWorkflowStorageKey,
  onStepFocus
}: WorkflowPanelProps): React.JSX.Element {
  const [authoringMode, setAuthoringMode] = useState<AuthoringMode>('json')
  const [runMode, setRunMode] = useState<RunMode>('debug')
  const [legendOpen, setLegendOpen] = useState(false)
  const [outputExpanded, setOutputExpanded] = useState(true)
  const [outputTab, setOutputTab] = useState<OutputTab>('nodes')
  const [compactPane, setCompactPane] = useState<CompactPane>('dag')
  const [sourceFileName, setSourceFileName] = useState<string | null>(null)
  const editor = useCodeMirror(CONTROL_DAG_JSON, authoringMode)
  const [canonicalSource, setCanonicalSource] = useState(CONTROL_DAG_JSON)
  const pythonBaseline = useRef<string | null>(null)
  const [pythonSourceMap, setPythonSourceMap] = useState<
    NonNullable<WorkflowAuthoringCandidate['source_map']>
  >([])
  const parsed = useMemo(() => {
    const source = authoringMode === 'json' ? editor.value : canonicalSource
    return parseCanonicalWorkflow(source)
  }, [authoringMode, canonicalSource, editor.value])
  const [run, setRun] = useState<WorkflowRun | null>(null)
  const [runNodes, setRunNodes] = useState<WorkflowRunNode[]>([])
  const [events, setEvents] = useState<WorkflowRunEvent[]>([])
  const [breakpoints, setBreakpoints] = useState<Set<string>>(
    () => new Set(['branch'])
  )
  const [startNodeId, setStartNodeId] = useState<string | null>('measure')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [message, setMessage] = useState('标准工作流 DAG 已就绪')
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

  useEffect(() => {
    if (!error) return
    setOutputExpanded(true)
    setOutputTab('errors')
  }, [error])

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
          setError(`节点 ${event.nodeId || '未知节点'} 执行异常：${detail}`)
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

  useEffect(() => {
    const workflowId = readActiveWorkflowId(activeWorkflowStorageKey)
    if (!workflowId) return

    let active = true
    setBusy(true)
    setError(null)
    void runtime.getWorkflow(workflowId)
      .then((document) => {
        if (!active) return
        const canonicalText = JSON.stringify(
          document.revision.canonical,
          null,
          2
        )
        setAuthoringMode('json')
        editor.replaceContent(canonicalText)
        setCanonicalSource(canonicalText)
        setSourceFileName(null)
        setPythonSourceMap([])
        pythonBaseline.current = null
        latestSequence.current = 0
        setRun(null)
        setRunNodes([])
        setEvents([])
        setBreakpoints(new Set())
        setStartNodeId(null)
        setSelectedNodeId(null)
        setMessage(`已恢复修订版本 ${document.revision.id}`)
      })
      .catch((restoreError) => {
        if (!active) return
        setError(
          `无法恢复最近保存的工作流 ${workflowId}：${
            restoreError instanceof Error
              ? restoreError.message
              : String(restoreError)
          }`
        )
      })
      .finally(() => {
        if (active) setBusy(false)
      })

    return () => {
      active = false
    }
  }, [activeWorkflowStorageKey, editor.replaceContent, runtime])

  const fileUpload = useWorkflowFileUpload({
    onLoaded: ({ content, fileName }) => {
      void withBusy(async () => {
        const canonical = parseCanonicalWorkflow(content)
        const migrated = canonical.revision
          ? null
          : migrateCloudWorkflowJson(content)
        const revision = canonical.revision || migrated?.revision
        if (!revision) {
          throw new Error(
            `无法导入 ${fileName}：${
              migrated?.error || canonical.error || '无法识别工作流格式'
            }`
          )
        }

        const canonicalText = JSON.stringify(revision, null, 2)
        const structure = parseCanonicalWorkflow(canonicalText)
        if (!structure.revision) {
          throw new Error(
            `无法导入 ${fileName}：${
              structure.error || '转换后的 Canonical v2 无法解析'
            }`
          )
        }

        setAuthoringMode('json')
        editor.replaceContent(canonicalText)
        setCanonicalSource(canonicalText)
        setSourceFileName(fileName)
        setPythonSourceMap([])
        pythonBaseline.current = null
        latestSequence.current = 0
        setRun(null)
        setRunNodes([])
        setEvents([])
        setBreakpoints(new Set())
        setStartNodeId(null)
        setSelectedNodeId(null)

        if (!migrated) {
          setMessage(
            `${fileName} 已导入 · ${structure.nodes.length} 个节点 · ${
              structure.links.length
            } 条控制边`
          )
          return
        }

        const warningSuffix = migrated.warnings.length > 0
          ? ` · ${migrated.warnings.join('；')}`
          : ''
        setMessage(
          `${fileName} 已自动迁移为 Canonical v2，正在由 OS 校验${warningSuffix}`
        )
        let result
        try {
          result = await runtime.validateWorkflow(revision)
        } catch (validationError) {
          throw new Error(
            `${fileName} 已自动迁移为 Canonical v2，但 OS 校验请求失败：${
              validationError instanceof Error
                ? validationError.message
                : String(validationError)
            }`
          )
        }
        if (!result.valid) {
          setMessage(
            `${fileName} 已自动迁移为 Canonical v2，但 OS 校验未通过${warningSuffix}`
          )
          setError(
            result.issues
              .map((issue) => `${issue.code}: ${issue.message}`)
              .join('\n')
          )
          return
        }
        setMessage(
          `${fileName} 已自动迁移并通过 OS 校验 · ${
            result.nodeCount ?? structure.nodes.length
          } 节点 · ${result.edgeCount ?? structure.links.length} 边${
            warningSuffix
          }`
        )
      })
    },
    onError: (uploadError) => setError(uploadError)
  })

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
      '标准工作流转换为 Python 失败'
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
        throw new Error(current.error || '标准工作流 DAG 无法解析')
      }
      setCanonicalSource(editor.value)
      return current.revision
    }

    const current = parseCanonicalWorkflow(canonicalSource)
    if (!current.revision) {
      throw new Error(current.error || '缺少可供 Python 编译的基础修订版本')
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
      'Python 编译为标准工作流失败'
    )
    const validated = requireAuthoringCandidate(
      await runtime.validateAuthoringCandidate(baseRevisionId, compiled),
      'Python 工作流未通过编写校验'
    )
    const nextCanonical = JSON.stringify(validated.canonical_ir, null, 2)
    const next = parseCanonicalWorkflow(nextCanonical)
    if (!next.revision) {
      throw new Error(next.error || 'OS 返回了无效的标准工作流修订版本')
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
      setMessage('Python 已通过 OS 编译并切换为标准 JSON')
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
      persistActiveWorkflowId(
        activeWorkflowStorageKey,
        document.revision.canonical.workflow_id
      )
      editor.markSaved()
      setMessage(`已保存修订版本 ${document.revision.id}`)
    })
  }

  const load = (): void => {
    void withBusy(async () => {
      const document = await runtime.getWorkflow('control-demo')
      const revision = document.revision.canonical
      persistActiveWorkflowId(
        activeWorkflowStorageKey,
        revision.workflow_id
      )
      setSourceFileName(null)
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
      setMessage(`已从 OS 载入修订版本 ${document.revision.id}`)
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

  const command = (
    name: WorkflowDebugCommand,
    payload: Record<string, unknown> = {},
    acceptedMessage?: string
  ): void => {
    if (!run) return
    void withBusy(async () => {
      const next = await runtime.command(run.id, name, payload)
      setRun(next)
      await refreshRun(run.id)
      setMessage(acceptedMessage || `调试命令 ${name} 已由 OS 接受`)
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
  const debugControls = workflowDebugControls({
    debugEnabled: Boolean(run?.debug?.enabled),
    debugStatus,
    runStatus: run?.status || 'draft',
    busy
  })
  const runStatus = run?.status || 'draft'
  const debugStatusLabel = workflowDebugStatusLabel(debugStatus)
  const runStatusLabel = workflowRunStatusLabel(runStatus)
  const completedNodeCount = runNodes.filter(
    (node) => ['success', 'skipped'].includes(node.state)
  ).length
  const sourceInvalid = authoringMode === 'json' && Boolean(parsed.error)
  const sourceRunnable = !sourceInvalid

  return (
    <div className="workflow workflow-runtime">
      <div className="workflow__toolbar">
        <div className="workflow__context">
          <div className="workflow__title-row">
            <span className="workflow__toolbar-label">工作流运行</span>
            <span className="workflow__format">
              {authoringMode === 'json'
                ? '标准工作流 v2'
                : 'Python 编写模式'}
            </span>
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
          aria-label="工作流编写格式"
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

        <div
          className="workflow__mode-switch workflow__mobile-view"
          role="group"
          aria-label="紧凑屏幕工作区"
        >
          <button
            type="button"
            className={compactPane === 'code' ? 'is-active' : ''}
            aria-pressed={compactPane === 'code'}
            onClick={() => setCompactPane('code')}
          >
            代码
          </button>
          <button
            type="button"
            className={compactPane === 'dag' ? 'is-active' : ''}
            aria-pressed={compactPane === 'dag'}
            onClick={() => setCompactPane('dag')}
          >
            DAG
          </button>
        </div>

        <div className="workflow__toolbar-actions">
          <input
            ref={fileUpload.inputRef}
            className="workflow__file-input"
            type="file"
            accept=".json,application/json"
            aria-label="选择工作流 JSON 文件"
            onChange={fileUpload.handleFileChange}
          />
          <button
            type="button"
            className="workflow__upload"
            disabled={busy}
            onClick={fileUpload.openFilePicker}
          >
            导入 JSON
          </button>
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
            disabled={busy || !sourceRunnable}
            onClick={() => void withBusy(async () => { await validate() })}
          >
            校验
          </button>
          <button
            type="button"
            className="workflow__upload"
            disabled={busy || !sourceRunnable}
            onClick={save}
          >
            保存修订版本
          </button>

          <span className="workflow__toolbar-divider" aria-hidden="true" />
          <div
            className="workflow__mode-switch workflow__run-mode"
            role="group"
            aria-label="运行方式"
          >
            <button
              type="button"
              className={runMode === 'run' ? 'is-active' : ''}
              aria-pressed={runMode === 'run'}
              disabled={busy}
              onClick={() => setRunMode('run')}
            >
              整图运行
            </button>
            <button
              type="button"
              className={runMode === 'debug' ? 'is-active' : ''}
              aria-pressed={runMode === 'debug'}
              disabled={busy}
              onClick={() => setRunMode('debug')}
            >
              调试运行
            </button>
          </div>
          <button
            type="button"
            className="workflow-runtime__primary"
            aria-label={
              runMode === 'debug'
                ? '调试启动：开始调试'
                : '整图执行：开始运行'
            }
            disabled={busy || !sourceRunnable}
            onClick={() => startRun(runMode === 'debug')}
          >
            {busy
              ? '处理中…'
              : runMode === 'debug'
                ? '开始调试'
                : '开始运行'}
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
        className={[
          'workbench',
          'workflow-runtime__workbench',
          `workflow-runtime__workbench--${compactPane}`,
          isDragging ? 'workbench--dragging' : ''
        ].filter(Boolean).join(' ')}
      >
        <div className="workbench__pane" style={{ flexBasis: `${leftRatio * 100}%` }}>
          <CodeEditor
            title={
              sourceFileName && authoringMode === 'json'
                ? sourceFileName
                : authoringMode === 'json'
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
              <strong>
                完整控制流 DAG
              </strong>
              <span>
                {parsed.nodes.length} 个节点 · {parsed.links.length} 条控制边
              </span>
            </div>
            <div className="workflow-runtime__stage-tools">
              <button
                type="button"
                aria-expanded={legendOpen}
                onClick={() => setLegendOpen((current) => !current)}
              >
                状态图例
              </button>
              <details className="workflow-runtime__help">
                <summary>操作帮助</summary>
                <div>
                  单击节点可同步定位代码。起始点与断点可通过节点内按钮设置；
                  右键和双击仅作为快捷操作。
                </div>
              </details>
            </div>
          </header>
          {legendOpen && (
            <div className="workflow-runtime__legend" aria-label="节点状态图例">
              <span className="is-start">⚑ 起始点</span>
              <span className="is-breakpoint">● 断点</span>
              <span className="is-paused">Ⅱ 暂停位置</span>
              <span className="is-running">● 正在运行</span>
              <span className="is-success">✓ 执行成功</span>
              <span className="is-excluded">— 不执行或已跳过</span>
            </div>
          )}
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
              <div className="workflow-runtime__debug-heading">
                <span
                  className={`workflow-runtime__debug-mark is-${debugStatus}`}
                  aria-hidden="true"
                />
                <div>
                  <span>工作流调试器</span>
                  <small>OS 运行控制</small>
                </div>
              </div>
              <div className="workflow-runtime__debug-summary">
                <strong
                  className={`is-${debugStatus}`}
                  data-debug-status={debugStatus}
                >
                  {debugStatusLabel}
                </strong>
                <span
                  className={`workflow-runtime__run-state workflow-runtime__run-state--${runStatus}`}
                  data-run-status={runStatus}
                >
                  整体：{runStatusLabel}
                </span>
                {run?.debug?.pausedBeforeNodeId && (
                  <span className="is-location">
                    暂停于 {run.debug.pausedBeforeNodeId} 执行之前
                  </span>
                )}
                <span className="is-meta">
                  <i>起点</i>
                  {executionScope.startNodeId || 'DAG 根节点'}
                </span>
                <span className="is-meta">
                  <i>断点</i>
                  {breakpoints.size}
                </span>
              </div>
            </div>
            <div className="workflow-runtime__debug-actions">
              <div
                className="workflow-runtime__debug-action-group"
                aria-label="调试执行控制"
              >
                {debugControls.filter((control) => !control.danger).map((control) => (
                  <button
                    key={control.command}
                    type="button"
                    className={
                      control.command === 'continue'
                        ? 'is-primary'
                        : undefined
                    }
                    data-debug-command={control.command}
                    aria-label={control.label}
                    title={control.title}
                    disabled={control.disabled}
                    onClick={() => command(
                      control.command,
                      {},
                      control.message
                    )}
                  >
                    <span
                      className="workflow-runtime__debug-glyph"
                      aria-hidden="true"
                    >
                      {control.glyph}
                    </span>
                    <span>{control.label}</span>
                  </button>
                ))}
              </div>
              <div
                className="workflow-runtime__debug-action-group is-danger"
                aria-label="调试停止控制"
              >
                {debugControls.filter((control) => control.danger).map((control) => (
                  <button
                    key={control.command}
                    type="button"
                    className={
                      control.command === 'emergency_stop'
                        ? 'is-emergency'
                        : 'is-danger'
                    }
                    data-debug-command={control.command}
                    aria-label={control.label}
                    title={control.title}
                    disabled={control.disabled}
                    onClick={() => command(
                      control.command,
                      {},
                      control.message
                    )}
                  >
                    <span
                      className="workflow-runtime__debug-glyph"
                      aria-hidden="true"
                    >
                      {control.glyph}
                    </span>
                    <span>{control.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div
            className={`workflow-runtime__results${
              outputExpanded ? ' is-expanded' : ' is-collapsed'
            }`}
          >
            <header className="workflow-runtime__output-header">
              <div className="workflow-runtime__output-title">
                <strong>运行输出</strong>
                <span>
                  {completedNodeCount}/{runNodes.length || parsed.nodes.length}
                  {' '}个节点已有结果
                </span>
              </div>
              {outputExpanded && (
                <div
                  className="workflow-runtime__output-tabs"
                  role="tablist"
                  aria-label="运行输出类型"
                >
                  <button
                    id="workflow-output-tab-nodes"
                    type="button"
                    role="tab"
                    aria-controls="workflow-output-panel-nodes"
                    aria-selected={outputTab === 'nodes'}
                    className={outputTab === 'nodes' ? 'is-active' : ''}
                    onClick={() => setOutputTab('nodes')}
                  >
                    节点结果
                    <span>{runNodes.length || parsed.nodes.length}</span>
                  </button>
                  <button
                    id="workflow-output-tab-events"
                    type="button"
                    role="tab"
                    aria-controls="workflow-output-panel-events"
                    aria-selected={outputTab === 'events'}
                    className={outputTab === 'events' ? 'is-active' : ''}
                    onClick={() => setOutputTab('events')}
                  >
                    事件流
                    <span>{events.length}</span>
                  </button>
                  <button
                    id="workflow-output-tab-errors"
                    type="button"
                    role="tab"
                    aria-controls="workflow-output-panel-errors"
                    aria-selected={outputTab === 'errors'}
                    className={outputTab === 'errors' ? 'is-active' : ''}
                    onClick={() => setOutputTab('errors')}
                  >
                    运行异常
                    {error && <span className="is-error">1</span>}
                  </button>
                </div>
              )}
              <button
                type="button"
                className="workflow-runtime__output-toggle"
                aria-expanded={outputExpanded}
                aria-label={
                  outputExpanded ? '收起运行输出' : '展开运行输出'
                }
                onClick={() => setOutputExpanded((current) => !current)}
              >
                {outputExpanded ? '收起' : '展开'}
              </button>
            </header>

            {outputExpanded && (
              <div className="workflow-runtime__output-body">
                <section
                  id="workflow-output-panel-nodes"
                  className="workflow-runtime__output-panel"
                  role="tabpanel"
                  aria-labelledby="workflow-output-tab-nodes"
                  tabIndex={0}
                  hidden={outputTab !== 'nodes'}
                >
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
                    }))).map((node) => {
                      const pausedBefore =
                        run?.debug?.pausedBeforeNodeId === node.sourceNodeId
                      return (
                        <button
                          key={node.nodeId}
                          type="button"
                          data-node-state={
                            pausedBefore ? 'paused-before' : node.state
                          }
                          className={[
                            selectedNodeId === node.sourceNodeId
                              ? 'is-selected'
                              : '',
                            pausedBefore ? 'is-paused-before' : ''
                          ].filter(Boolean).join(' ')}
                          onClick={() => selectNode(node.sourceNodeId)}
                        >
                          <i
                            className={
                              pausedBefore
                                ? 'is-paused-before'
                                : `is-${node.state}`
                            }
                          />
                          <span className="is-node-id">{node.sourceNodeId}</span>
                          <span className="is-node-type">
                            {workflowNodeTypeLabel(node.nodeType)}
                          </span>
                          <em>
                            {pausedBefore
                              ? '暂停位置'
                              : workflowNodeStateLabel(node.state)}
                          </em>
                        </button>
                      )
                    })}
                  </div>
                  {selectedNode && (
                    <pre className="workflow-runtime__node-result">
                      {JSON.stringify(selectedNode.result, null, 2)}
                    </pre>
                  )}
                </section>

                <section
                  id="workflow-output-panel-events"
                  className="workflow-runtime__output-panel"
                  role="tabpanel"
                  aria-labelledby="workflow-output-tab-events"
                  tabIndex={0}
                  hidden={outputTab !== 'events'}
                >
                  <div className="workflow-runtime__events">
                    {[...events].reverse().slice(0, 50).map((event) => (
                      <div key={event.seq}>
                        <code>#{event.seq}</code>
                        <span>
                          <strong>{workflowEventLabel(event.type)}</strong>
                          <small>{event.type}</small>
                        </span>
                        <em>{event.nodeId || '整体运行'}</em>
                      </div>
                    ))}
                    {events.length === 0 && <p>等待 OS 节点反馈……</p>}
                  </div>
                </section>

                <section
                  id="workflow-output-panel-errors"
                  className="workflow-runtime__output-panel"
                  role="tabpanel"
                  aria-labelledby="workflow-output-tab-errors"
                  tabIndex={0}
                  hidden={outputTab !== 'errors'}
                >
                  {error ? (
                    <div className="workflow-runtime__error-detail">
                      <strong>运行或编写过程中发生异常</strong>
                      <p>{error}</p>
                      <button type="button" onClick={() => setError(null)}>
                        清除异常
                      </button>
                    </div>
                  ) : (
                    <div className="workflow-runtime__output-empty">
                      当前没有运行异常
                    </div>
                  )}
                </section>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function readActiveWorkflowId(storageKey?: string): string | null {
  if (!storageKey) return null
  try {
    const raw = globalThis.localStorage?.getItem(storageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw) as {
      version?: unknown
      workflowId?: unknown
    }
    return parsed.version === 1 &&
      typeof parsed.workflowId === 'string' &&
      parsed.workflowId.trim()
      ? parsed.workflowId
      : null
  } catch {
    return null
  }
}

function persistActiveWorkflowId(
  storageKey: string | undefined,
  workflowId: string
): void {
  if (!storageKey) return
  try {
    globalThis.localStorage?.setItem(
      storageKey,
      JSON.stringify({ version: 1, workflowId })
    )
  } catch {
    // OS persistence succeeded; unavailable browser storage must not fail save.
  }
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

const DEBUG_STATUS_LABELS: Readonly<Record<string, string>> = {
  disabled: '未开始',
  pending: '启动中',
  running: '正在运行',
  pause_pending: '等待暂停',
  paused: '已暂停',
  stepping: '单步执行中',
  completed: '已完成',
  failed: '执行失败',
  cancelled: '已取消',
  terminated: '已终止'
}

const RUN_STATUS_LABELS: Readonly<Record<string, string>> = {
  draft: '草稿',
  pending: '等待执行',
  running: '运行中',
  completed: '已完成',
  failed: '执行失败',
  cancelled: '已取消',
  reconciling: '状态核对中'
}

const NODE_STATE_LABELS: Readonly<Record<string, string>> = {
  pending: '等待执行',
  ready: '已就绪',
  running: '正在运行',
  success: '执行成功',
  skipped: '已跳过',
  excluded: '不执行',
  failed: '执行失败',
  cancelled: '已取消',
  reconciling: '状态核对中'
}

const NODE_TYPE_LABELS: Readonly<Record<string, string>> = {
  action: '操作节点',
  branch: '分支节点',
  join: '汇合节点',
  group: '节点组',
  subworkflow: '子工作流'
}

const EVENT_TYPE_LABELS: Readonly<Record<string, string>> = {
  'run.created': '运行已创建',
  'run.started': '运行已开始',
  'run.status': '运行状态已更新',
  'run.completed': '运行已完成',
  'run.failed': '运行失败',
  'node.ready': '节点已就绪',
  'node.started': '节点开始执行',
  'node.completed': '节点执行成功',
  'node.skipped': '节点已跳过',
  'node.exception': '节点执行异常',
  'debug.paused': '调试已暂停',
  'debug.pause_pending': '正在等待安全暂停',
  'debug.stepping': '正在单步执行',
  'debug.continued': '调试已继续',
  'debug.terminate_requested': '已请求终止运行',
  'debug.emergency_stop_requested': '已请求当前运行急停',
  'debug.cancelled': '调试运行已取消'
}

function workflowDebugStatusLabel(status: string): string {
  return DEBUG_STATUS_LABELS[status] || status
}

function workflowRunStatusLabel(status: string): string {
  return RUN_STATUS_LABELS[status] || status
}

function workflowNodeStateLabel(status: string): string {
  return NODE_STATE_LABELS[status] || status
}

function workflowNodeTypeLabel(type: string): string {
  return NODE_TYPE_LABELS[type] || type || '操作节点'
}

function workflowEventLabel(type: string): string {
  return EVENT_TYPE_LABELS[type] || '运行事件'
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
