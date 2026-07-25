import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import { CodeEditor, useCodeMirror } from '@unilab/code-editor'
import { useResizableSplit } from '@unilab/app-shell'
import type {
  WorkflowDebugCommand,
  WorkflowRun,
  WorkflowRunEvent,
  WorkflowRunNode,
  WorkflowRuntimePort
} from '@unilab/services'
import WorkflowDag from './WorkflowDag'
import {
  CONTROL_DAG_JSON,
  parseCanonicalWorkflow
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

export default function WorkflowPanel({
  runtime,
  onStepFocus
}: WorkflowPanelProps): React.JSX.Element {
  const editor = useCodeMirror(CONTROL_DAG_JSON, 'json')
  const parsed = useMemo(
    () => parseCanonicalWorkflow(editor.value),
    [editor.value]
  )
  const [run, setRun] = useState<WorkflowRun | null>(null)
  const [runNodes, setRunNodes] = useState<WorkflowRunNode[]>([])
  const [events, setEvents] = useState<WorkflowRunEvent[]>([])
  const [breakpoints, setBreakpoints] = useState<Set<string>>(
    () => new Set(['branch'])
  )
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

  const validate = useCallback(async (): Promise<boolean> => {
    if (!parsed.revision) {
      setError(parsed.error || 'Canonical DAG 无法解析')
      return false
    }
    const result = await runtime.validateWorkflow(parsed.revision)
    if (!result.valid) {
      setError(result.issues.map((issue) => `${issue.code}: ${issue.message}`).join('\n'))
      setMessage('校验未通过')
      return false
    }
    setMessage(
      `校验通过 · ${result.nodeCount ?? parsed.nodes.length} 节点 · ${
        result.edgeCount ?? parsed.links.length
      } 边`
    )
    return true
  }, [parsed, runtime])

  const save = (): void => {
    void withBusy(async () => {
      if (!parsed.revision || !await validate()) return
      const document = await runtime.saveWorkflow(
        parsed.revision.workflow_id,
        parsed.revision
      )
      setMessage(`已保存 Revision ${document.revision.id}`)
    })
  }

  const load = (): void => {
    void withBusy(async () => {
      const document = await runtime.getWorkflow('control-demo')
      editor.replaceContent(JSON.stringify(document.revision.canonical, null, 2))
      setMessage(`已载入 OS Revision ${document.revision.id}`)
    })
  }

  const startRun = (debug: boolean): void => {
    void withBusy(async () => {
      if (!parsed.revision || !await validate()) return
      latestSequence.current = 0
      setEvents([])
      setRunNodes([])
      const created = await runtime.createRun({
        client_request_id: globalThis.crypto?.randomUUID?.() || String(Date.now()),
        source: {
          format: 'workflow_revision_v2',
          revision: parsed.revision
        },
        ...(debug
          ? {
              debug: {
                pause_on_start: true,
                breakpoints: [...breakpoints]
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

  const selectNode = (nodeId: string): void => {
    setSelectedNodeId(nodeId)
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

  return (
    <div className="workflow workflow-runtime">
      <div className="workflow__toolbar">
        <span className="workflow__toolbar-label">Workflow Runtime</span>
        <span className="workflow__format">Canonical v2</span>
        <span className={`workflow-runtime__run-state workflow-runtime__run-state--${run?.status || 'draft'}`}>
          {run?.status || 'draft'}
        </span>
        <span className="workflow-runtime__message">{message}</span>
        <div className="workflow__toolbar-actions">
          <button type="button" className="workflow__upload" disabled={busy} onClick={load}>
            从 OS 载入
          </button>
          <button
            type="button"
            className="workflow__upload"
            disabled={busy || Boolean(parsed.error)}
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
            disabled={busy || Boolean(parsed.error)}
            onClick={() => startRun(false)}
          >
            ▶ 整图执行
          </button>
          <button
            type="button"
            className="workflow-runtime__debug-start"
            disabled={busy || Boolean(parsed.error)}
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
            title={`${parsed.revision?.workflow_id || 'workflow'}.revision.json`}
            editor={editor}
            language="JSON"
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
            <span className="workflow-runtime__hint">双击节点设置断点</span>
          </header>
          {parsed.error ? (
            <div className="workflow-runtime__empty">{parsed.error}</div>
          ) : (
            <div className="workflow-runtime__canvas">
              <WorkflowDag
                nodes={parsed.nodes}
                links={parsed.links}
                nodeStates={nodeStates}
                breakpoints={breakpoints}
                onNodeSelect={selectNode}
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
                  state: 'pending',
                  result: {},
                  attempt: 0
                }))).map((node) => (
                  <button
                    key={node.nodeId}
                    type="button"
                    className={selectedNodeId === node.sourceNodeId ? 'is-selected' : ''}
                    onClick={() => setSelectedNodeId(node.sourceNodeId)}
                  >
                    <i className={`is-${node.state}`} />
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
