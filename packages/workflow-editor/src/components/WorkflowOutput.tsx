import type {
  WorkflowRunEvent,
  WorkflowRunNode
} from '@unilab/services'

type WorkflowOutputTab = 'nodes' | 'events' | 'errors'

interface WorkflowOutputProps {
  expanded: boolean
  activeTab: WorkflowOutputTab
  completedNodeCount: number
  expectedNodeCount: number
  nodes: readonly WorkflowRunNode[]
  events: readonly WorkflowRunEvent[]
  error: string | null
  selectedNode: WorkflowRunNode | undefined
  selectedNodeId: string | null
  pausedBeforeNodeId: string | null
  onExpandedChange: (expanded: boolean) => void
  onTabChange: (tab: WorkflowOutputTab) => void
  onNodeSelect: (nodeId: string) => void
  onClearError: () => void
}

export function WorkflowOutput({
  expanded,
  activeTab,
  completedNodeCount,
  expectedNodeCount,
  nodes,
  events,
  error,
  selectedNode,
  selectedNodeId,
  pausedBeforeNodeId,
  onExpandedChange,
  onTabChange,
  onNodeSelect,
  onClearError
}: WorkflowOutputProps): React.JSX.Element {
  return (
    <div
      className={`workflow-runtime__results${
        expanded ? ' is-expanded' : ' is-collapsed'
      }`}
    >
      <header className="workflow-runtime__output-header">
        <div className="workflow-runtime__output-title">
          <strong>运行输出</strong>
          <span>
            {completedNodeCount}/{expectedNodeCount}
            {' '}个节点已有结果
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
              label="节点结果"
              count={nodes.length}
              onSelect={onTabChange}
            />
            <OutputTabButton
              id="events"
              activeTab={activeTab}
              label="事件流"
              count={events.length}
              onSelect={onTabChange}
            />
            <OutputTabButton
              id="errors"
              activeTab={activeTab}
              label="运行异常"
              error={Boolean(error)}
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
        <div className="workflow-runtime__output-body">
          <section
            id="workflow-output-panel-nodes"
            className="workflow-runtime__output-panel"
            role="tabpanel"
            aria-labelledby="workflow-output-tab-nodes"
            tabIndex={0}
            hidden={activeTab !== 'nodes'}
          >
            <div className="workflow-runtime__node-list">
              {nodes.map((node) => {
                const pausedBefore =
                  pausedBeforeNodeId === node.sourceNodeId
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
                    onClick={() => onNodeSelect(node.sourceNodeId)}
                  >
                    <i
                      className={
                        pausedBefore
                          ? 'is-paused-before'
                          : `is-${node.state}`
                      }
                    />
                    <span className="is-node-id">
                      {node.sourceNodeId}
                    </span>
                    <span className="is-node-type">
                      {nodeTypeLabel(node.nodeType)}
                    </span>
                    <em>
                      {pausedBefore
                        ? '暂停位置'
                        : nodeStateLabel(node.state)}
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
            hidden={activeTab !== 'events'}
          >
            <div className="workflow-runtime__events">
              {[...events].reverse().slice(0, 50).map((event) => (
                <div key={event.seq}>
                  <code>#{event.seq}</code>
                  <span>
                    <strong>{eventLabel(event.type)}</strong>
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
            hidden={activeTab !== 'errors'}
          >
            {error ? (
              <div className="workflow-runtime__error-detail">
                <strong>运行或编写过程中发生异常</strong>
                <p>{error}</p>
                <button type="button" onClick={onClearError}>
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
  )
}

function OutputTabButton({
  id,
  activeTab,
  label,
  count,
  error = false,
  onSelect
}: {
  id: WorkflowOutputTab
  activeTab: WorkflowOutputTab
  label: string
  count?: number
  error?: boolean
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
      {count !== undefined && <span>{count}</span>}
      {error && <span className="is-error">1</span>}
    </button>
  )
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

function nodeStateLabel(status: string): string {
  return NODE_STATE_LABELS[status] || status
}

function nodeTypeLabel(type: string): string {
  return NODE_TYPE_LABELS[type] || type || '操作节点'
}

function eventLabel(type: string): string {
  return EVENT_TYPE_LABELS[type] || '运行事件'
}
