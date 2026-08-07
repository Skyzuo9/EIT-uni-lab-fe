import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState
} from 'react'

import { WorkflowButton } from './WorkflowButton'

import type {
  WorkflowTracePort,
  WorkflowTraceRecord
} from '../traceRuntime'
import {
  WorkflowTraceCloseGlyph as CloseGlyph,
  WorkflowTraceGlyph as TraceGlyph,
  WorkflowTraceRefreshGlyph as RefreshGlyph,
  WorkflowTraceState as TraceState
} from './WorkflowTracePrimitives'
import {
  errorMessage,
  formatDuration,
  formatTimestamp,
  listWorkflowRunTraces,
  mergeTraceRecords,
  shortId,
  statusLabel,
  statusTone,
  traceIdFor,
  workflowSpanSummaries,
  workflowTraceSummary,
  type WorkflowSpanSummary,
  type WorkflowTraceSummary
} from './workflowTraceProjection'

export {
  listWorkflowRunTraces,
  traceMatchesWorkflowRun,
  workflowSpanSummaries,
  workflowTraceSummary,
  type WorkflowSpanSummary,
  type WorkflowTraceSummary
} from './workflowTraceProjection'

type TraceScope = 'current' | 'recent'

interface WorkflowTraceViewerProps {
  open: boolean
  currentRunId: string | null
  runtime: WorkflowTracePort
  onClose: () => void
}

/** 展示当前或近期工作流（Workflow）运行的跟踪抽屉。 */
export function WorkflowTraceViewer({
  open,
  currentRunId,
  runtime,
  onClose
}: WorkflowTraceViewerProps): React.JSX.Element | null {
  const titleId = useId()
  const drawerRef = useRef<HTMLElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const listRequestRef = useRef(0)
  const detailRequestRef = useRef(0)
  const [scope, setScope] = useState<TraceScope>(
    currentRunId ? 'current' : 'recent'
  )
  const [traces, setTraces] = useState<WorkflowTraceRecord[]>([])
  const [serverMatchedTraceIds, setServerMatchedTraceIds] = useState(
    () => new Set<string>()
  )
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(
    null
  )
  const [spans, setSpans] = useState<WorkflowTraceRecord[]>([])
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(
    null
  )
  const [listLoading, setListLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [detailRevision, setDetailRevision] = useState(0)

  const traceSummaries = useMemo(
    () => traces
      .map((trace) => workflowTraceSummary(
        trace,
        currentRunId,
        serverMatchedTraceIds
      ))
      .filter((trace): trace is WorkflowTraceSummary => Boolean(trace)),
    [currentRunId, serverMatchedTraceIds, traces]
  )
  const currentTraceCount = traceSummaries.filter(
    (trace) => trace.matchesCurrentRun
  ).length
  const visibleTraces = useMemo(
    () => scope === 'current'
      ? traceSummaries.filter((trace) => trace.matchesCurrentRun)
      : traceSummaries,
    [scope, traceSummaries]
  )
  const spanSummaries = useMemo(
    () => workflowSpanSummaries(spans),
    [spans]
  )
  const selectedSpan = spanSummaries.find(
    (span) => span.spanId === selectedSpanId
  ) ?? spanSummaries[0]

  const loadTraces = useCallback(async (): Promise<void> => {
    const requestId = ++listRequestRef.current
    setListLoading(true)
    setListError(null)
    try {
      const [recentResult, currentRunTraces] = await Promise.all([
        runtime.listTraces({
          limit: 100,
          sort: 'start_time',
          order: 'desc',
          includeSpans: true
        }),
        currentRunId
          ? listWorkflowRunTraces(runtime, currentRunId)
          : Promise.resolve([])
      ])
      if (requestId !== listRequestRef.current) return
      setServerMatchedTraceIds(new Set(
        currentRunTraces.map(traceIdFor).filter(Boolean)
      ))
      setTraces(mergeTraceRecords(
        currentRunTraces,
        recentResult.traces
      ))
      setDetailRevision((current) => current + 1)
    } catch (error) {
      if (requestId !== listRequestRef.current) return
      setListError(errorMessage(error, 'Trace 列表读取失败'))
    } finally {
      if (requestId === listRequestRef.current) setListLoading(false)
    }
  }, [currentRunId, runtime])

  useEffect(() => {
    if (!open) return
    setScope(currentRunId ? 'current' : 'recent')
    void loadTraces()
    return () => {
      listRequestRef.current += 1
      detailRequestRef.current += 1
    }
  }, [currentRunId, loadTraces, open])

  useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement as HTMLElement | null
    closeButtonRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = drawerRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], input:not(:disabled), ' +
        'select:not(:disabled), textarea:not(:disabled), ' +
        '[tabindex]:not([tabindex="-1"])'
      )
      if (!focusable?.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previousFocus?.focus()
    }
  }, [onClose, open])

  useEffect(() => {
    if (
      selectedTraceId &&
      visibleTraces.some((trace) => trace.traceId === selectedTraceId)
    ) return
    setSelectedTraceId(visibleTraces[0]?.traceId ?? null)
  }, [selectedTraceId, visibleTraces])

  useEffect(() => {
    if (!open || !selectedTraceId) {
      setSpans([])
      setSelectedSpanId(null)
      return
    }
    const requestId = ++detailRequestRef.current
    setDetailLoading(true)
    setDetailError(null)
    setSpans([])
    setSelectedSpanId(null)
    void runtime.getTrace(selectedTraceId, { limit: 500 })
      .then((result) => {
        if (requestId !== detailRequestRef.current) return
        setSpans(result.spans)
      })
      .catch((error: unknown) => {
        if (requestId !== detailRequestRef.current) return
        setDetailError(errorMessage(error, 'Trace 详情读取失败'))
      })
      .finally(() => {
        if (requestId === detailRequestRef.current) {
          setDetailLoading(false)
        }
      })
  }, [detailRevision, open, runtime, selectedTraceId])

  if (!open) return null

  return (
    <div
      className="workflow-runtime__trace-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        ref={drawerRef}
        className="workflow-runtime__trace-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="workflow-runtime__trace-header">
          <div>
            <span className="workflow-runtime__trace-symbol" aria-hidden="true">
              <TraceGlyph />
            </span>
            <div>
              <h2 id={titleId}>工作流 Trace</h2>
              <p>
                {currentRunId
                  ? <>当前运行 <code>{shortId(currentRunId)}</code></>
                  : 'Electron 与 Uni-Lab-OS 上报的运行 Trace'}
              </p>
            </div>
          </div>
          <div className="workflow-runtime__trace-header-actions">
            <WorkflowButton
              type="button"
              className="workflow-runtime__trace-refresh"
              disabled={listLoading}
              disabledReason="正在读取 Trace 列表，请稍候"
              onClick={() => void loadTraces()}
            >
              <RefreshGlyph />
              {listLoading ? '刷新中' : '刷新'}
            </WorkflowButton>
            <button
              ref={closeButtonRef}
              type="button"
              className="workflow-runtime__trace-close"
              aria-label="关闭 Trace 查看器"
              title="关闭"
              onClick={onClose}
            >
              <CloseGlyph />
            </button>
          </div>
        </header>

        <div
          className="workflow-runtime__trace-scope"
          role="group"
          aria-label="Trace 查看范围"
        >
          <WorkflowButton
            type="button"
            aria-pressed={scope === 'current'}
            disabled={!currentRunId}
            disabledReason="当前还没有工作流运行记录"
            className={scope === 'current' ? 'is-active' : undefined}
            onClick={() => setScope('current')}
          >
            当前运行
            {currentRunId && <span>{currentTraceCount}</span>}
          </WorkflowButton>
          <button
            type="button"
            aria-pressed={scope === 'recent'}
            className={scope === 'recent' ? 'is-active' : undefined}
            onClick={() => setScope('recent')}
          >
            最近记录
            <span>{traceSummaries.length}</span>
          </button>
          <small>数据来自 Uni-Lab-OS 本地 Phoenix</small>
        </div>

        <div className="workflow-runtime__trace-content">
          <aside className="workflow-runtime__trace-list" aria-label="Trace 列表">
            {listLoading && traces.length === 0 ? (
              <TraceState title="正在读取 Trace" detail="正在连接本地日志服务……" />
            ) : listError ? (
              <TraceState
                tone="error"
                title="无法读取 Trace"
                detail={listError}
                actionLabel="重试"
                onAction={() => void loadTraces()}
              />
            ) : visibleTraces.length === 0 ? (
              <TraceState
                title={scope === 'current' ? '当前运行暂无 Trace' : '暂无 Trace 记录'}
                detail={scope === 'current'
                  ? '运行链路可能仍在上报。请刷新，或切换到“最近记录”查看全部 Trace。'
                  : '启动并运行工作流后，Trace 会在这里显示。'}
                actionLabel={scope === 'current' ? '查看最近记录' : undefined}
                onAction={scope === 'current' ? () => setScope('recent') : undefined}
              />
            ) : (
              visibleTraces.map((trace) => (
                <button
                  key={trace.traceId}
                  type="button"
                  className={[
                    'workflow-runtime__trace-item',
                    selectedTraceId === trace.traceId ? 'is-selected' : ''
                  ].filter(Boolean).join(' ')}
                  aria-pressed={selectedTraceId === trace.traceId}
                  onClick={() => setSelectedTraceId(trace.traceId)}
                >
                  <span className="workflow-runtime__trace-item-heading">
                    <strong>{trace.name}</strong>
                    <i data-status={statusTone(trace.status)}>
                      {statusLabel(trace.status)}
                    </i>
                  </span>
                  <span className="workflow-runtime__trace-item-meta">
                    <time>{formatTimestamp(trace.startedAt)}</time>
                    <em>{formatDuration(trace.latencyMs)}</em>
                    {trace.spanCount !== null && (
                      <small>{trace.spanCount} spans</small>
                    )}
                  </span>
                  <code title={trace.traceId}>{shortId(trace.traceId)}</code>
                  {trace.matchesCurrentRun && (
                    <span className="workflow-runtime__trace-current">
                      当前运行
                    </span>
                  )}
                </button>
              ))
            )}
          </aside>

          <main className="workflow-runtime__trace-detail">
            {!selectedTraceId ? (
              <TraceState
                title="选择一条 Trace"
                detail="选择左侧记录后查看完整 Span 链路。"
              />
            ) : detailLoading ? (
              <TraceState
                title="正在读取 Span"
                detail={`Trace ${shortId(selectedTraceId)}`}
              />
            ) : detailError ? (
              <TraceState
                tone="error"
                title="无法读取 Span"
                detail={detailError}
                actionLabel="重试"
                onAction={() => setDetailRevision((current) => current + 1)}
              />
            ) : spanSummaries.length === 0 ? (
              <TraceState
                title="该 Trace 暂无 Span"
                detail="上报可能尚未完成，请稍后刷新 Trace 列表。"
                actionLabel="刷新 Trace"
                onAction={() => void loadTraces()}
              />
            ) : (
              <>
                <section className="workflow-runtime__span-chain">
                  <header>
                    <div>
                      <strong>Span 链路</strong>
                      <span>{spanSummaries.length} 个步骤</span>
                    </div>
                    <code title={selectedTraceId}>{selectedTraceId}</code>
                  </header>
                  <div aria-label="Trace Span 链路">
                    {spanSummaries.map((span) => (
                      <button
                        key={span.spanId}
                        type="button"
                        aria-pressed={selectedSpan?.spanId === span.spanId}
                        className={[
                          'workflow-runtime__span-item',
                          selectedSpan?.spanId === span.spanId
                            ? 'is-selected'
                            : ''
                        ].filter(Boolean).join(' ')}
                        style={{
                          '--workflow-span-depth': span.depth
                        } as React.CSSProperties}
                        onClick={() => setSelectedSpanId(span.spanId)}
                      >
                        <span className="workflow-runtime__span-rail" aria-hidden="true" />
                        <span>
                          <strong>{span.name}</strong>
                          <small>{formatTimestamp(span.startedAt)}</small>
                        </span>
                        <em>{formatDuration(span.latencyMs)}</em>
                        <i data-status={statusTone(span.status)}>
                          {statusLabel(span.status)}
                        </i>
                      </button>
                    ))}
                  </div>
                </section>

                {selectedSpan && (
                  <section className="workflow-runtime__span-inspector">
                    <header>
                      <div>
                        <strong>{selectedSpan.name}</strong>
                        <span>{statusLabel(selectedSpan.status)}</span>
                      </div>
                      <code title={selectedSpan.spanId}>
                        {selectedSpan.spanId}
                      </code>
                    </header>
                    <dl>
                      <div>
                        <dt>开始时间</dt>
                        <dd>{formatTimestamp(selectedSpan.startedAt, true)}</dd>
                      </div>
                      <div>
                        <dt>耗时</dt>
                        <dd>{formatDuration(selectedSpan.latencyMs)}</dd>
                      </div>
                      <div>
                        <dt>父 Span</dt>
                        <dd>{selectedSpan.parentId || '根 Span'}</dd>
                      </div>
                      {selectedSpan.attributes.map(([key, value]) => (
                        <div key={key}>
                          <dt>{key}</dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                )}
              </>
            )}
          </main>
        </div>
      </section>
    </div>
  )
}
