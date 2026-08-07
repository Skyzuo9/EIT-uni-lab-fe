export type WorkflowOutputTab = 'nodes' | 'events' | 'errors'

export interface WorkflowOutputNode {
  nodeId: string
  sourceNodeId: string
  nodeType: string
  state: string
  attempt: number
  result: Record<string, unknown>
}

export interface WorkflowOutputEvent {
  key?: string
  seq: number
  type: string
  nodeId: string | null
  detail?: Record<string, unknown>
}
export interface WorkflowNodeFailureLog {
  nodeId: string
  sourceNodeId: string
  nodeName: string
  attempt: number
  log: string
}

const FAILURE_LOG_FIELDS = [
  ['error_info', ''],
  ['error', ''],
  ['traceback', ''],
  ['message', ''],
  ['detail', ''],
  ['stderr', 'stderr'],
  ['logs', 'logs'],
  ['log', 'log'],
  ['info', 'info']
] as const

const NODE_LOG_FIELDS = [
  ['param', '动作下发参数'],
  ['return_info', '执行结果'],
  ['feedback', '动作反馈'],
  ['feedback_data', '最新反馈'],
  ['command_result', '控制命令结果'],
  ['error_info', '错误信息'],
  ['stdout', 'stdout'],
  ['stderr', 'stderr'],
  ['logs', 'logs'],
  ['log', 'log'],
  ['info', 'info'],
  ['message', '']
] as const

export function workflowNodeLogText(
  node: WorkflowOutputNode,
  events: readonly WorkflowOutputEvent[]
): string {
  const matchingEvents = events
    .filter((event) => (
      event.type !== 'node.exception' &&
      (event.nodeId === node.nodeId || event.nodeId === node.sourceNodeId)
    ))
  const logs: string[] = []
  const seen = new Set<string>()

  const append = (value: unknown, label: string): void => {
    const text = formatLogValue(value)
    if (!text || seen.has(text)) return
    seen.add(text)
    logs.push(label ? `${label}:\n${text}` : text)
  }
  const visit = (value: Record<string, unknown>): void => {
    for (const [field, label] of NODE_LOG_FIELDS) {
      append(value[field], label)
    }
    for (const field of ['result', 'output']) {
      const nested = value[field]
      if (isRecord(nested)) visit(nested)
    }
  }

  visit(node.result)
  matchingEvents.forEach((event) => {
    if (event.detail) visit(event.detail)
  })
  if (logs.length > 0) return logs.join('\n\n')

  return matchingEvents.map((event) => {
    const heading = `#${event.seq} ${eventLabel(event.type)} (${event.type})`
    const detail = formatLogValue(event.detail)
    return detail ? `${heading}\n${detail}` : heading
  }).join('\n\n')
}

export function workflowNodeFailureLogs(
  nodes: readonly WorkflowOutputNode[],
  nodeNames: Readonly<Record<string, string>>,
  events: readonly WorkflowOutputEvent[]
): WorkflowNodeFailureLog[] {
  const exceptionEvents = events.filter(
    (event) => event.type === 'node.exception'
  )
  const consumedEventSequences = new Set<number>()
  const failures = nodes
    .filter((node) => node.state === 'failed')
    .map((node) => {
      const sourceNodeId = node.sourceNodeId || node.nodeId
      const matchingEvents = exceptionEvents.filter((event) => {
        const matches =
          event.nodeId === node.nodeId ||
          event.nodeId === sourceNodeId
        if (matches) consumedEventSequences.add(event.seq)
        return matches
      })
      return {
        nodeId: node.nodeId,
        sourceNodeId,
        nodeName:
          nodeNames[sourceNodeId] ||
          nodeNames[node.nodeId] ||
          sourceNodeId,
        attempt: node.attempt,
        log: failureLogText(
          node.result,
          ...matchingEvents.flatMap((event) =>
            event.detail ? [event.detail] : []
          )
        )
      }
    })

  const eventNodeNames = workflowEventNodeNames(nodes, nodeNames)
  for (const event of exceptionEvents) {
    if (consumedEventSequences.has(event.seq)) continue
    const sourceNodeId = event.nodeId || '未知节点'
    failures.push({
      nodeId: `${sourceNodeId}:event:${event.seq}`,
      sourceNodeId,
      nodeName: eventNodeNames.get(sourceNodeId) || sourceNodeId,
      attempt: 0,
      log: failureLogText(event.detail ?? {})
    })
  }
  return failures
}

export function failureLogText(
  ...results: readonly Record<string, unknown>[]
): string {
  const logs: string[] = []
  const seen = new Set<string>()

  const append = (value: unknown, label = ''): void => {
    const text = formatLogValue(value)
    if (!text || seen.has(text)) return
    seen.add(text)
    logs.push(label ? `${label}:\n${text}` : text)
  }

  const visit = (result: Record<string, unknown>): void => {
    const previousCount = logs.length
    let hasFailureField = false
    for (const [field, label] of FAILURE_LOG_FIELDS) {
      if (field in result) hasFailureField = true
      append(result[field], label)
    }
    for (const field of ['result', 'failure', 'exception']) {
      const nested = result[field]
      if (isRecord(nested)) visit(nested)
    }
    if (
      logs.length === previousCount &&
      !hasFailureField &&
      Object.keys(result).length > 0
    ) {
      append(result)
    }
  }

  results.forEach(visit)
  return logs.join('\n\n')
}

export function formatLogValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return ''
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value.map(formatLogValue).filter(Boolean).join('\n')
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

const NODE_STATE_LABELS: Readonly<Record<string, string>> = {
  pending: '等待执行',
  dispatched: '已下发',
  ready: '已就绪',
  running: '正在运行',
  success: '执行成功',
  succeeded: '执行成功',
  intervention_required: '需要干预',
  cancel_requested: '等待取消',
  execution_unknown: '执行状态未知',
  skipped: '已跳过',
  excluded: '不执行',
  failed: '执行失败',
  cancelled: '已取消',
  canceled: '已取消',
  timeout: '执行超时',
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
  'run.command': '控制命令已处理',
  'run.recovered': '运行状态已恢复',
  'node.ready': '节点已就绪',
  'node.dispatched': '动作已下发',
  'node.started': '节点开始执行',
  'node.result': '节点执行成功',
  'node.completed': '节点执行成功',
  'node.skipped': '节点已跳过',
  'node.exception': '节点执行异常',
  'node.feedback': '动作反馈',
  'node.status': '节点状态已更新',
  'node.uncertainty_opened': '节点进入不确定状态',
  'node.uncertainty_resolved': '节点不确定状态已解除',
  'debug.paused': '调试已暂停',
  'debug.pause_pending': '正在等待安全暂停',
  'debug.stepping': '正在单步执行',
  'debug.continued': '调试已继续',
  'debug.terminate_requested': '已请求终止运行',
  'debug.emergency_stop_requested': '已请求当前运行急停',
  'debug.cancelled': '调试运行已取消'
}

export function nodeStateLabel(status: string): string {
  return NODE_STATE_LABELS[status] || status
}

export function nodeTypeLabel(type: string): string {
  return NODE_TYPE_LABELS[type] || type || '操作节点'
}

export function eventLabel(type: string): string {
  return EVENT_TYPE_LABELS[type] || '运行事件'
}

export function workflowEventNodeNames(
  runNodes: readonly WorkflowOutputNode[],
  nodeNames: Readonly<Record<string, string>>
): ReadonlyMap<string, string> {
  const result = new Map(Object.entries(nodeNames))
  for (const node of runNodes) {
    const sourceNodeId = node.sourceNodeId || node.nodeId
    const displayName =
      nodeNames[sourceNodeId] ||
      nodeNames[node.nodeId] ||
      sourceNodeId
    result.set(sourceNodeId, displayName)
    result.set(node.nodeId, displayName)
  }
  return result
}
