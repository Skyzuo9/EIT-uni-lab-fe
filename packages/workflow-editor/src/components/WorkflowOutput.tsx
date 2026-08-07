import {
  eventLabel,
  nodeStateLabel,
  nodeTypeLabel,
  workflowEventNodeNames,
  workflowNodeFailureLogs,
  workflowNodeLogText,
  type WorkflowNodeFailureLog,
  type WorkflowOutputEvent,
  type WorkflowOutputNode,
  type WorkflowOutputTab
} from './workflowOutputProjection'

export type {
  WorkflowOutputEvent,
  WorkflowOutputNode,
  WorkflowOutputTab
} from './workflowOutputProjection'

interface WorkflowOutputProps {
  expanded: boolean
  activeTab: WorkflowOutputTab
  completedNodeCount: number
  expectedNodeCount: number
  nodes: readonly WorkflowOutputNode[]
  nodeNames: Readonly<Record<string, string>>
  events: readonly WorkflowOutputEvent[]
  error: string | null
  selectedNode: WorkflowOutputNode | undefined
  selectedNodeId: string | null
  pausedBeforeNodeId: string | null
  onExpandedChange: (expanded: boolean) => void
  onTabChange: (tab: WorkflowOutputTab) => void
  onNodeSelect: (nodeId: string) => void
  onClearError: () => void
  title?: string
  countLabel?: string
  nodesTabLabel?: string
  eventsTabLabel?: string
  eventsEmptyLabel?: string
}

export function WorkflowOutput({
  expanded,
  activeTab,
  completedNodeCount,
  expectedNodeCount,
  nodes,
  nodeNames,
  events,
  error,
  selectedNode,
  selectedNodeId,
  pausedBeforeNodeId,
  onExpandedChange,
  onTabChange,
  onNodeSelect,
  onClearError,
  title = '运行输出',
  countLabel = '个节点已有结果',
  nodesTabLabel = '节点结果',
  eventsTabLabel = '事件流',
  eventsEmptyLabel = '等待 OS 节点反馈……'
}: WorkflowOutputProps): React.JSX.Element {
  const eventNodeNames = workflowEventNodeNames(nodes, nodeNames)
  const nodeFailures = workflowNodeFailureLogs(nodes, nodeNames, events)
  const selectedNodeFailure = selectedNode
    ? nodeFailures.find((failure) => (
        failure.nodeId === selectedNode.nodeId ||
        failure.sourceNodeId === selectedNode.nodeId ||
        failure.nodeId === selectedNode.sourceNodeId ||
        failure.sourceNodeId === selectedNode.sourceNodeId
      ))
    : undefined
  const selectedNodeHasResult = Boolean(
    selectedNode &&
    !selectedNodeFailure &&
    Object.keys(selectedNode.result).length > 0
  )
  const selectedNodeLog = selectedNode && selectedNode.state !== 'failed'
    ? workflowNodeLogText(selectedNode, events)
    : ''
  const errorCount = nodeFailures.length + (error ? 1 : 0)

  return (
    <div
      className={`workflow-runtime__results${
        expanded ? ' is-expanded' : ' is-collapsed'
      }`}
    >
      <header className="workflow-runtime__output-header">
        <div className="workflow-runtime__output-title">
          <strong>{title}</strong>
          <span>
            {completedNodeCount}/{expectedNodeCount}
            {' '}{countLabel}
          </span>
        </div>
        {expanded && (
          <div
            className="workflow-runtime__output-tabs"
            role="tablist"
            aria-label="运行输出类型"
          >
            <OutputTabButton
              id="nodes"
              activeTab={activeTab}
              label={nodesTabLabel}
              count={nodes.length}
              onSelect={onTabChange}
            />
            <OutputTabButton
              id="events"
              activeTab={activeTab}
              label={eventsTabLabel}
              count={events.length}
              onSelect={onTabChange}
            />
            <OutputTabButton
              id="errors"
              activeTab={activeTab}
              label="运行异常"
              errorCount={errorCount}
              onSelect={onTabChange}
            />
          </div>
        )}
        <button
          type="button"
          className="workflow-runtime__output-toggle"
          aria-expanded={expanded}
          aria-label={expanded ? '收起运行输出' : '展开运行输出'}
          onClick={() => onExpandedChange(!expanded)}
        >
          {expanded ? '收起' : '展开'}
        </button>
      </header>

      {expanded && (
        <WorkflowOutputBody
          activeTab={activeTab}
          nodes={nodes}
          nodeNames={nodeNames}
          events={events}
          eventNodeNames={eventNodeNames}
          eventsEmptyLabel={eventsEmptyLabel}
          error={error}
          errorCount={errorCount}
          nodeFailures={nodeFailures}
          selectedNode={selectedNode}
          selectedNodeFailure={selectedNodeFailure}
          selectedNodeHasResult={selectedNodeHasResult}
          selectedNodeLog={selectedNodeLog}
          selectedNodeId={selectedNodeId}
          pausedBeforeNodeId={pausedBeforeNodeId}
          onNodeSelect={onNodeSelect}
          onClearError={onClearError}
        />
      )}
    </div>
  )
}

/** 承载展开态的三个输出面板，使外层模块只管理折叠与标签页接口。 */
function WorkflowOutputBody({
  activeTab,
  nodes,
  nodeNames,
  events,
  eventNodeNames,
  eventsEmptyLabel,
  error,
  errorCount,
  nodeFailures,
  selectedNode,
  selectedNodeFailure,
  selectedNodeHasResult,
  selectedNodeLog,
  selectedNodeId,
  pausedBeforeNodeId,
  onNodeSelect,
  onClearError
}: {
  activeTab: WorkflowOutputTab
  nodes: readonly WorkflowOutputNode[]
  nodeNames: Readonly<Record<string, string>>
  events: readonly WorkflowOutputEvent[]
  eventNodeNames: ReadonlyMap<string, string>
  eventsEmptyLabel: string
  error: string | null
  errorCount: number
  nodeFailures: readonly WorkflowNodeFailureLog[]
  selectedNode: WorkflowOutputNode | undefined
  selectedNodeFailure: WorkflowNodeFailureLog | undefined
  selectedNodeHasResult: boolean
  selectedNodeLog: string
  selectedNodeId: string | null
  pausedBeforeNodeId: string | null
  onNodeSelect: (nodeId: string) => void
  onClearError: () => void
}): React.JSX.Element {
  return (
    <div className="workflow-runtime__output-body">
      <section
        id="workflow-output-panel-nodes"
        className="workflow-runtime__output-panel"
        role="tabpanel"
        aria-labelledby="workflow-output-tab-nodes"
        tabIndex={0}
        hidden={activeTab !== 'nodes'}
      >
        <WorkflowOutputNodeList
          nodes={nodes}
          selectedNodeId={selectedNodeId}
          pausedBeforeNodeId={pausedBeforeNodeId}
          onNodeSelect={onNodeSelect}
        />
        {selectedNode && (
          selectedNodeFailure || selectedNodeLog || selectedNodeHasResult
        ) && (
          <div className="workflow-runtime__node-details">
            {selectedNodeFailure && (
              <article
                className="workflow-runtime__error-detail workflow-runtime__node-error"
              >
                <header>
                  <strong>{selectedNodeFailure.nodeName} 执行失败</strong>
                  <small title={`节点 ID：${selectedNodeFailure.sourceNodeId}`}>
                    {selectedNodeFailure.sourceNodeId}
                    {selectedNodeFailure.attempt > 0
                      ? ` · 第 ${selectedNodeFailure.attempt} 次尝试`
                      : ''}
                  </small>
                </header>
                {selectedNodeFailure.log ? (
                  <pre aria-label={`${selectedNodeFailure.nodeName} 错误日志`}>
                    {selectedNodeFailure.log}
                  </pre>
                ) : (
                  <p>节点已失败，但 OS 未返回详细错误日志。</p>
                )}
              </article>
            )}
            {selectedNodeLog && (
              <article className="workflow-runtime__node-log">
                <header>
                  <strong>
                    {nodeNames[selectedNode.sourceNodeId] ||
                      selectedNode.sourceNodeId} 运行日志
                  </strong>
                  {selectedNode.attempt > 0 && (
                    <small>第 {selectedNode.attempt} 次尝试</small>
                  )}
                </header>
                <pre
                  aria-label={`${nodeNames[selectedNode.sourceNodeId] || selectedNode.sourceNodeId} 运行日志`}
                >
                  {selectedNodeLog}
                </pre>
              </article>
            )}
            {selectedNodeHasResult && (
              <pre
                className="workflow-runtime__node-result"
                aria-label={`${nodeNames[selectedNode.sourceNodeId] || selectedNode.sourceNodeId} 节点结果`}
              >
                {JSON.stringify(selectedNode.result, null, 2)}
              </pre>
            )}
          </div>
        )}
      </section>

      <section
        id="workflow-output-panel-events"
        className="workflow-runtime__output-panel"
        role="tabpanel"
        aria-labelledby="workflow-output-tab-events"
        tabIndex={0}
        hidden={activeTab !== 'events'}
      >
        <div className="workflow-runtime__events">
          {events.length > 0 && (
            <p className="workflow-runtime__events-order">最新事件在前</p>
          )}
          {[...events].reverse().slice(0, 50).map((event) => {
            const nodeName = event.nodeId
              ? eventNodeNames.get(event.nodeId) || event.nodeId
              : '整体运行'
            return (
              <div
                key={event.key ?? `${event.nodeId}:${event.seq}:${event.type}`}
                data-event-kind={event.type}
                data-event-sequence={event.seq}
              >
                <code>#{event.seq}</code>
                <span>
                  <strong>{eventLabel(event.type)}</strong>
                  <small>{event.type}</small>
                  {event.detail && (
                    <details className="workflow-runtime__event-raw">
                      <summary>查看原始数据</summary>
                      <pre>{JSON.stringify(event.detail, null, 2)}</pre>
                    </details>
                  )}
                </span>
                <em
                  data-node-id={event.nodeId || undefined}
                  title={
                    event.nodeId && nodeName !== event.nodeId
                      ? `节点 ID：${event.nodeId}`
                      : undefined
                  }
                >
                  {nodeName}
                </em>
              </div>
            )
          })}
          {events.length === 0 && <p>{eventsEmptyLabel}</p>}
        </div>
      </section>

      <section
        id="workflow-output-panel-errors"
        className="workflow-runtime__output-panel"
        role="tabpanel"
        aria-labelledby="workflow-output-tab-errors"
        tabIndex={0}
        hidden={activeTab !== 'errors'}
      >
        {errorCount > 0 ? (
          <div className="workflow-runtime__error-list">
            {error && (
              <div className="workflow-runtime__error-detail">
                <strong>运行或编写过程中发生异常</strong>
                <p>{error}</p>
                <button type="button" onClick={onClearError}>
                  清除异常
                </button>
              </div>
            )}
            {nodeFailures.map((failure) => (
              <article
                key={`${failure.nodeId}:${failure.attempt}`}
                className="workflow-runtime__error-detail workflow-runtime__node-error"
              >
                <header>
                  <strong>{failure.nodeName} 执行失败</strong>
                  <small title={`节点 ID：${failure.sourceNodeId}`}>
                    {failure.sourceNodeId}
                    {failure.attempt > 0
                      ? ` · 第 ${failure.attempt} 次尝试`
                      : ''}
                  </small>
                </header>
                {failure.log ? (
                  <pre aria-label={`${failure.nodeName} 错误日志`}>
                    {failure.log}
                  </pre>
                ) : (
                  <p>节点已失败，但 OS 未返回详细错误日志。</p>
                )}
              </article>
            ))}
          </div>
        ) : (
          <div className="workflow-runtime__output-empty">
            当前没有运行异常
          </div>
        )}
      </section>
    </div>
  )
}

/** 把运行节点状态投影为可选择列表，隔离暂停和选中态的展示分支。 */
function WorkflowOutputNodeList({
  nodes,
  selectedNodeId,
  pausedBeforeNodeId,
  onNodeSelect
}: {
  nodes: readonly WorkflowOutputNode[]
  selectedNodeId: string | null
  pausedBeforeNodeId: string | null
  onNodeSelect: (nodeId: string) => void
}): React.JSX.Element {
  return (
    <div className="workflow-runtime__node-list">
      {nodes.map((node) => {
        const pausedBefore = pausedBeforeNodeId === node.sourceNodeId
        return (
          <button
            key={node.nodeId}
            type="button"
            data-node-state={pausedBefore ? 'paused-before' : node.state}
            className={[
              selectedNodeId === node.sourceNodeId ? 'is-selected' : '',
              pausedBefore ? 'is-paused-before' : ''
            ].filter(Boolean).join(' ')}
            onClick={() => onNodeSelect(node.sourceNodeId)}
          >
            <i
              className={
                pausedBefore ? 'is-paused-before' : `is-${node.state}`
              }
            />
            <span className="is-node-id">{node.sourceNodeId}</span>
            <span className="is-node-type">
              {nodeTypeLabel(node.nodeType)}
            </span>
            <em>
              {pausedBefore ? '暂停位置' : nodeStateLabel(node.state)}
            </em>
          </button>
        )
      })}
    </div>
  )
}

function OutputTabButton({
  id,
  activeTab,
  label,
  count,
  errorCount = 0,
  onSelect
}: {
  id: WorkflowOutputTab
  activeTab: WorkflowOutputTab
  label: string
  count?: number
  errorCount?: number
  onSelect: (tab: WorkflowOutputTab) => void
}): React.JSX.Element {
  return (
    <button
      id={`workflow-output-tab-${id}`}
      type="button"
      role="tab"
      aria-controls={`workflow-output-panel-${id}`}
      aria-selected={activeTab === id}
      className={activeTab === id ? 'is-active' : ''}
      onClick={() => onSelect(id)}
    >
      {label}
      {errorCount > 0
        ? <span className="is-error">{errorCount}</span>
        : count !== undefined && <span>{count}</span>}
    </button>
  )
}
