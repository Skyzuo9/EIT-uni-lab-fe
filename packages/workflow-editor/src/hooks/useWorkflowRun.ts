import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction
} from 'react'
import type {
  WorkflowDebugCommand,
  WorkflowRevision,
  WorkflowRun,
  WorkflowRunEvent,
  WorkflowRunNode,
  WorkflowRuntimePort
} from '@unilab/services'

import {
  createWorkflowExecutionScope,
  remapWorkflowBreakpoints,
  remapWorkflowNodeId
} from '../utils/canonicalWorkflow'
import {
  visibleWorkflowDebugControls,
  workflowDebugControls
} from '../utils/debugControls'
import type {
  WorkflowLink,
  WorkflowNode
} from '../utils/parseWorkflow'

const TERMINAL_RUN_STATES = new Set(['completed', 'failed', 'cancelled'])

export interface WorkflowRunSnapshot {
  run: WorkflowRun | null
  runNodes: WorkflowRunNode[]
  events: WorkflowRunEvent[]
  breakpoints: string[]
  startNodeId: string | null
  selectedNodeId: string | null
  latestSequence: number
}

interface UseWorkflowRunParams {
  runtime: WorkflowRuntimePort
  initial: WorkflowRunSnapshot | null
  nodes: WorkflowNode[]
  links: WorkflowLink[]
  busy: boolean
  validateRevision: () => Promise<WorkflowRevision | null>
  setMessage: Dispatch<SetStateAction<string>>
  setError: Dispatch<SetStateAction<string | null>>
  withBusy: (operation: () => Promise<void>) => Promise<void>
}

export function useWorkflowRun({
  runtime,
  initial,
  nodes,
  links,
  busy,
  validateRevision,
  setMessage,
  setError,
  withBusy
}: UseWorkflowRunParams) {
  const [run, setRun] = useState<WorkflowRun | null>(initial?.run ?? null)
  const [runNodes, setRunNodes] = useState<WorkflowRunNode[]>(
    initial?.runNodes ?? []
  )
  const [events, setEvents] = useState<WorkflowRunEvent[]>(
    initial?.events ?? []
  )
  const [breakpoints, setBreakpoints] = useState<Set<string>>(
    () => new Set(initial?.breakpoints ?? ['branch'])
  )
  const [startNodeId, setStartNodeId] = useState<string | null>(
    initial?.startNodeId ?? 'measure'
  )
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    initial?.selectedNodeId ?? null
  )
  const latestSequence = useRef(initial?.latestSequence ?? 0)

  const executionScope = useMemo(
    () => createWorkflowExecutionScope(nodes, links, startNodeId),
    [links, nodes, startNodeId]
  )
  const nodeStates = useMemo(
    () => Object.fromEntries(
      runNodes.map((node) => [
        node.sourceNodeId || node.nodeId,
        node.state
      ])
    ),
    [runNodes]
  )
  const selectedNode = runNodes.find(
    (node) =>
      node.nodeId === selectedNodeId ||
      node.sourceNodeId === selectedNodeId
  )

  const refreshRun = useCallback(async (runId: string) => {
    const [nextRun, nextNodes] = await Promise.all([
      runtime.getRun(runId),
      runtime.listRunNodes(runId)
    ])
    setRun(nextRun)
    setRunNodes(nextNodes)
  }, [runtime])

  useEffect(() => {
    if (!run?.id) return
    const runId = run.id
    const subscription = runtime.subscribeRunEvents(
      runId,
      (event) => {
        latestSequence.current = Math.max(
          latestSequence.current,
          event.seq
        )
        if (event.type === 'node.exception') {
          const detail = String(
            event.payload.message ||
            event.payload.detail ||
            event.payload.code ||
            'OS 返回节点执行失败'
          )
          setError(
            `节点 ${event.nodeId || '未知节点'} 执行异常：${detail}`
          )
        }
        setEvents((current) => (
          current.some((item) => item.seq === event.seq)
            ? current
            : [...current, event].sort(
                (left, right) => left.seq - right.seq
              )
        ))
        void refreshRun(runId)
      },
      {
        afterSeq: latestSequence.current,
        onError: (subscriptionError) =>
          setError(subscriptionError.message)
      }
    )
    void refreshRun(runId)
    return () => subscription.dispose()
  }, [refreshRun, run?.id, runtime, setError])

  const resetRun = useCallback((): void => {
    latestSequence.current = 0
    setRun(null)
    setRunNodes([])
    setEvents([])
    setBreakpoints(new Set())
    setStartNodeId(null)
    setSelectedNodeId(null)
  }, [])

  const remapExecutionScope = useCallback((
    previous: WorkflowRevision,
    next: WorkflowRevision
  ): void => {
    setBreakpoints((current) =>
      remapWorkflowBreakpoints(previous, next, current)
    )
    setStartNodeId((current) =>
      remapWorkflowNodeId(previous, next, current)
    )
  }, [])

  const startRun = (debug: boolean): void => {
    void withBusy(async () => {
      const revision = await validateRevision()
      if (!revision) return
      latestSequence.current = 0
      setEvents([])
      setRunNodes([])
      const created = await runtime.createRun({
        client_request_id:
          globalThis.crypto?.randomUUID?.() || String(Date.now()),
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
      setError(
        '起始点在本次运行创建后不可修改；请先终止运行再重新设置'
      )
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

  const debugStatus = run?.debug?.status || 'disabled'
  const runStatus = run?.status || 'draft'
  const runActive = Boolean(
    run && !TERMINAL_RUN_STATES.has(run.status)
  )
  const terminationPending = runStatus === 'cancel_requested'
  const outputNodes: WorkflowRunNode[] = runNodes.length
    ? runNodes
    : nodes.map((node) => ({
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
      }))

  const terminateRun = (): void => {
    if (!run || !runActive || terminationPending) return
    if (run.debug?.enabled) {
      command(
        'terminate',
        {},
        '终止请求已由 OS 接受；等待当前运行收敛'
      )
      return
    }
    void withBusy(async () => {
      const next = await runtime.cancelRun(run.id)
      setRun(next)
      await refreshRun(run.id)
      setMessage('终止请求已由 OS 接受；等待当前运行收敛')
    })
  }

  return {
    run,
    runNodes,
    events,
    breakpoints,
    startNodeId,
    selectedNodeId,
    selectedNode,
    executionScope,
    nodeStates,
    debugStatus,
    runStatus,
    debugControls: visibleWorkflowDebugControls(
      workflowDebugControls({
        debugEnabled: Boolean(run?.debug?.enabled),
        debugStatus,
        runStatus,
        busy
      })
    ),
    completedNodeCount: runNodes.filter(
      (node) => ['success', 'skipped'].includes(node.state)
    ).length,
    outputNodes,
    startRun,
    terminateRun,
    command,
    toggleBreakpoint,
    setExecutionStart,
    setSelectedNodeId,
    resetRun,
    remapExecutionScope,
    snapshot: {
      run,
      runNodes,
      events,
      breakpoints: [...breakpoints],
      startNodeId,
      selectedNodeId,
      latestSequence: latestSequence.current
    } satisfies WorkflowRunSnapshot
  }
}
