import { useEffect, useMemo, useRef, useState } from 'react'

import type {
  BackendWorkflowGraph,
  CapabilityStatus,
  WorkflowRuntimePort,
  WorkflowRunPreflightReport,
  WorkflowRunPreparation,
  WorkflowTaskCommandType,
  WorkflowTaskRunMode
} from '@unilab/services'

import { useWorkflowTaskRuntime } from '../hooks/useWorkflowTaskRuntime'
import type { WorkflowTracePort } from '../traceRuntime'
import {
  projectEditableBackendWorkflowCanvas,
  projectExistingWorkflowCanvas
} from '../utils/existingWorkflowCanvasProjection'
import {
  TERMINAL_JOB_STATUSES,
  workflowTaskDagState
} from '../utils/workflowTaskPanelProjection'
import {
  workflowTaskControls,
  workflowTaskIsLive,
  workflowTaskToolbarControls
} from '../utils/workflowTaskPresentation'
import {
  projectWorkflowTaskEvents,
  projectWorkflowTaskJob
} from '../utils/workflowTaskOutputProjection'
import {
  existingWorkflowPreflightFailureMessage,
  existingWorkflowRunModeLabel,
  existingWorkflowStartDisabledReason
} from '../utils/existingWorkflowRunProjection'
import { ExistingWorkflowCanvas } from './ExistingWorkflowCanvas'
import { ExistingWorkflowRuntimeActions } from './ExistingWorkflowRuntimeActions'
import { WorkflowOutput, type WorkflowOutputTab } from './WorkflowOutput'
import { WorkflowTraceViewer } from './WorkflowTraceViewer'
import { WorkflowWorkspaceToolbar } from './WorkflowWorkspaceToolbar'
import styles from './workflow.module.scss'

interface ExistingWorkflowRuntimePanelProps {
  runtime: WorkflowRuntimePort
  workflowUuid: string
  workflowName?: string
  traceRuntime?: WorkflowTracePort
  editingStatus?: CapabilityStatus
  executionStatus?: CapabilityStatus
  onUnsavedChangesChange?: (hasUnsavedChanges: boolean) => void
  onChooseWorkflow?: () => void
}

/**
 * 在 Backend 权威中编辑画布并运行已有工作流定义。
 * 工作区源码保持隔离；任务、节点作业和反馈始终通过 Backend 接口创建或补读。
 */
export function ExistingWorkflowRuntimePanel({
  runtime,
  workflowUuid,
  workflowName,
  traceRuntime,
  editingStatus,
  executionStatus,
  onUnsavedChangesChange,
  onChooseWorkflow
}: ExistingWorkflowRuntimePanelProps): React.JSX.Element {
  const taskRuntime = useWorkflowTaskRuntime(runtime, workflowUuid)
  const { snapshot } = taskRuntime
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('选择“运行已有工作流”创建一次工作流任务')
  const [runMode, setRunMode] = useState<WorkflowTaskRunMode>('normal')
  const [targetNodeUuid, setTargetNodeUuid] = useState('')
  const [preparation, setPreparation] = useState<WorkflowRunPreparation | null>(null)
  const [preparationError, setPreparationError] = useState<string | null>(null)
  const [preparationLoading, setPreparationLoading] = useState(true)
  const [preparationGeneration, setPreparationGeneration] = useState(0)
  const [editableGraph, setEditableGraph] = useState<BackendWorkflowGraph | null>(null)
  const [definitionDirty, setDefinitionDirty] = useState(false)
  const [definitionLoading, setDefinitionLoading] = useState(false)
  const [definitionError, setDefinitionError] = useState<string | null>(null)
  const [definitionGeneration, setDefinitionGeneration] = useState(0)
  const definitionDirtyRef = useRef(false)
  const [preflight, setPreflight] = useState<WorkflowRunPreflightReport | null>(null)
  const [preflightError, setPreflightError] = useState<string | null>(null)
  const [preflightLoading, setPreflightLoading] = useState(true)
  const [preflightGeneration, setPreflightGeneration] = useState(0)
  const [outputExpanded, setOutputExpanded] = useState(true)
  const [outputTab, setOutputTab] = useState<WorkflowOutputTab>('nodes')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [traceViewerOpen, setTraceViewerOpen] = useState(false)
  const task = snapshot.task
  const liveTask = workflowTaskIsLive(task)
  const editingEnabled = editingStatus?.available === true
  const structure = useMemo(
    () => editingEnabled
      ? projectEditableBackendWorkflowCanvas(editableGraph)
      : projectExistingWorkflowCanvas(preparation),
    [editableGraph, editingEnabled, preparation]
  )
  const outputNodes = useMemo(
    () => snapshot.jobs.map(projectWorkflowTaskJob),
    [snapshot.jobs]
  )
  const outputEvents = useMemo(
    () => projectWorkflowTaskEvents(snapshot.events, snapshot.feedback, snapshot.jobs),
    [snapshot.events, snapshot.feedback, snapshot.jobs]
  )
  const nodeNames = useMemo(() => ({
    ...Object.fromEntries(structure.nodes.map((node) => [node.id, node.name])),
    ...snapshotNodeNames(task?.workflow_snapshot)
  }), [structure.nodes, task])
  const selectedNode = outputNodes.find((node) => (
    node.sourceNodeId === selectedNodeId || node.nodeId === selectedNodeId
  ))
  const completedJobCount = snapshot.jobs.filter(
    (job) => TERMINAL_JOB_STATUSES.has(job.status)
  ).length
  const controls = useMemo(
    () => workflowTaskControls(task, busy).map((control) => ({
      ...control,
      title: backendRuntimeCopy(control.title),
      message: backendRuntimeCopy(control.message),
      disabledReason: backendRuntimeCopy(control.disabledReason)
    })),
    [busy, task]
  )
  const toolbarControls = useMemo(
    () => workflowTaskToolbarControls(task, controls),
    [controls, task]
  )
  const runtimeError = snapshot.actionError ?? snapshot.projectionError ??
    snapshot.feedbackError ?? snapshot.realtimeError
  const enabledNodes = useMemo(
    () => preparation?.nodes.filter((node) => !node.disabled) ?? [],
    [preparation]
  )
  const selectedTarget = enabledNodes.find(
    (node) => node.workflow_node_uuid === targetNodeUuid
  )
  const preflightReady = preflight?.status === 'ready' && preflight.can_run
  const canvasNodeStates = useMemo(() => ({
    ...Object.fromEntries(structure.nodes
      .filter((node) => node.disabled)
      .map((node) => [node.id, 'disabled'])),
    ...Object.fromEntries(snapshot.jobs.map((job) => [
      job.workflow_node_uuid,
      workflowTaskDagState(
        job.status,
        structure.nodes.find((node) => node.id === job.workflow_node_uuid)
          ?.type === 'material_source',
        task?.status
      )
    ]))
  }), [snapshot.jobs, structure.nodes, task?.status])
  const targetRequired = runMode === 'single_node' && !selectedTarget
  const executionBlockedReason = executionStatus?.available === false
    ? executionStatus.reason || 'OS 未就绪；请先在环境管理中启动 OS'
    : null
  const startDisabled = busy || snapshot.loading || liveTask ||
    Boolean(executionBlockedReason) || preflightLoading ||
    !preflightReady || targetRequired

  useEffect(() => {
    let current = true
    setPreparation(null)
    setPreparationError(null)
    setPreparationLoading(true)
    setTargetNodeUuid('')
    void runtime.getWorkflowRunPreparation(workflowUuid).then(
      /** 安装当前工作流的只读节点选择快照。 */
      (nextPreparation) => {
        if (!current) return
        setPreparation(nextPreparation)
        setPreparationLoading(false)
      },
      /** 保留工作流图读取错误；完整运行和单步运行仍可独立预检。 */
      (error: unknown) => {
        if (!current) return
        setPreparationError(errorMessage(error))
        setPreparationLoading(false)
      }
    )
    return () => {
      current = false
    }
  }, [preparationGeneration, runtime, workflowUuid])

  useEffect(() => {
    onUnsavedChangesChange?.(definitionDirty)
    return () => onUnsavedChangesChange?.(false)
  }, [definitionDirty, onUnsavedChangesChange])

  useEffect(() => {
    if (!editingEnabled) {
      setEditableGraph(null)
      setDefinitionDirty(false)
      definitionDirtyRef.current = false
      setDefinitionError(null)
      return
    }
    let current = true
    setDefinitionLoading(true)
    setDefinitionError(null)
    void runtime.getBackendWorkflowGraph(workflowUuid).then(
      graph => {
        if (!current) return
        setEditableGraph(graph)
        setDefinitionDirty(false)
        definitionDirtyRef.current = false
        setDefinitionLoading(false)
        setMessage(`已读取 Backend 工作流修订 ${graph.workflow.revision}`)
      },
      error => {
        if (!current) return
        setDefinitionError(errorMessage(error))
        setDefinitionLoading(false)
      }
    )
    return () => {
      current = false
    }
  }, [definitionGeneration, editingEnabled, runtime, workflowUuid])

  useEffect(() => {
    if (!editingEnabled) return
    return runtime.subscribeWorkflowRuntime((event) => {
      if (
        event.event !== 'workflow.definition.changed' ||
        event.data.workflow_uuid !== workflowUuid
      ) return
      if (definitionDirtyRef.current) {
        setDefinitionError(
          `Backend 已更新到修订 ${event.data.workflow_revision}；当前画布草稿仍保留，请保存以执行 CAS 校验或重新加载`
        )
        return
      }
      setDefinitionGeneration(generation => generation + 1)
    }).dispose
  }, [editingEnabled, runtime, workflowUuid])

  useEffect(() => {
    let current = true
    setPreflight(null)
    setPreflightError(null)
    if (runMode === 'single_node' && !targetNodeUuid) {
      setPreflightLoading(false)
      return () => {
        current = false
      }
    }
    setPreflightLoading(true)
    void runtime.getWorkflowRunPreflight(
      workflowUuid,
      runMode,
      runMode === 'single_node' ? targetNodeUuid : undefined
    ).then(
      /** 安装与当前模式和目标严格对应的 Backend 运行预检。 */
      (nextPreflight) => {
        if (!current) return
        setPreflight(nextPreflight)
        setPreflightLoading(false)
      },
      /** 保留预检错误并阻止创建未经检查的工作流任务。 */
      (error: unknown) => {
        if (!current) return
        setPreflightError(errorMessage(error))
        setPreflightLoading(false)
      }
    )
    return () => {
      current = false
    }
  }, [preflightGeneration, runMode, runtime, targetNodeUuid, workflowUuid])

  /** 执行一次互斥运行操作，并只展示 Backend 已确认的结果。 */
  const runAction = async (
    action: () => Promise<unknown>,
    acceptedMessage: string
  ): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      await action()
      setMessage(acceptedMessage)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const command = (type: WorkflowTaskCommandType, acceptedMessage: string): void => {
    void runAction(() => taskRuntime.command(type), acceptedMessage)
  }

  /** 切换正式运行模式，并清空只对单节点模式有意义的目标。 */
  const chooseRunMode = (nextRunMode: WorkflowTaskRunMode): void => {
    setRunMode(nextRunMode)
    if (nextRunMode !== 'single_node') setTargetNodeUuid('')
  }

  /**
   * 在只读画布中选择节点；单节点调试模式下同步选择正式运行目标。
   *
   * @param nodeUuid 用户在工作流画布上选择的计划节点身份。
   * @returns 无；仅更新前端选择，不修改 Backend 工作流定义。
   */
  const chooseCanvasNode = (nodeUuid: string): void => {
    setSelectedNodeId(nodeUuid)
    if (
      runMode === 'single_node' &&
      !busy &&
      !liveTask &&
      enabledNodes.some((node) => node.workflow_node_uuid === nodeUuid)
    ) setTargetNodeUuid(nodeUuid)
  }

  /**
   * 从目标节点选择框更新单节点运行目标，并在画布中定位同一节点。
   *
   * @param nodeUuid Backend 运行准备快照中的节点身份；空值表示清除目标。
   * @returns 无；任务创建前仍会执行最新 Backend 预检。
   */
  const chooseTargetNode = (nodeUuid: string): void => {
    setTargetNodeUuid(nodeUuid)
    setSelectedNodeId(nodeUuid || null)
  }

  /** 在本地画布缓冲中应用一项 Backend 图变更，不触碰工作区源码。 */
  const mutateDefinition = (
    mutation: (graph: BackendWorkflowGraph) => BackendWorkflowGraph
  ): void => {
    if (!editingEnabled || busy || liveTask || !editableGraph) return
    const nextGraph = mutation(editableGraph)
    if (nextGraph === editableGraph) return
    setEditableGraph(nextGraph)
    setDefinitionDirty(true)
    definitionDirtyRef.current = true
    setMessage('Backend 画布已修改；保存后将创建新的工作流修订')
  }

  const moveDefinitionNode = (
    nodeUuid: string,
    position: { x: number; y: number }
  ): void => mutateDefinition(graph => {
    const node = graph.nodes.find(candidate => candidate.uuid === nodeUuid)
    const pose = asRecord(node?.pose)
    if (
      !node ||
      (pose.x === position.x && pose.y === position.y)
    ) return graph
    return {
      ...graph,
      nodes: graph.nodes.map(candidate => candidate.uuid === nodeUuid
        ? { ...candidate, pose: { ...pose, ...position } }
        : candidate)
    }
  })

  const toggleDefinitionNode = (nodeUuid: string): void =>
    mutateDefinition(graph => ({
      ...graph,
      nodes: graph.nodes.map(node => node.uuid === nodeUuid
        ? { ...node, disabled: !node.disabled }
        : node)
    }))

  const connectDefinitionHandles = (connection: {
    sourceNodeUuid: string
    sourceHandleUuid: string
    targetNodeUuid: string
    targetHandleUuid: string
  }): void => mutateDefinition(graph => {
    const duplicate = graph.edges.some(edge =>
      edge.source_node_uuid === connection.sourceNodeUuid &&
      edge.source_handle_uuid === connection.sourceHandleUuid &&
      edge.target_node_uuid === connection.targetNodeUuid &&
      edge.target_handle_uuid === connection.targetHandleUuid
    )
    if (duplicate) return graph
    return {
      ...graph,
      edges: [...graph.edges, {
        uuid: globalThis.crypto.randomUUID(),
        source_node_uuid: connection.sourceNodeUuid,
        source_handle_uuid: connection.sourceHandleUuid,
        target_node_uuid: connection.targetNodeUuid,
        target_handle_uuid: connection.targetHandleUuid,
        description: null,
        meta_data: {}
      }]
    }
  })

  const deleteDefinitionSelection = (selection: {
    nodeUuids: string[]
    edgeUuids: string[]
  }): void => mutateDefinition(graph => {
    const nodeUuids = new Set(selection.nodeUuids)
    const edgeUuids = new Set(selection.edgeUuids)
    return {
      ...graph,
      nodes: graph.nodes.filter(node => !nodeUuids.has(node.uuid)),
      edges: graph.edges.filter(edge =>
        !edgeUuids.has(edge.uuid) &&
        !nodeUuids.has(edge.source_node_uuid) &&
        !nodeUuids.has(edge.target_node_uuid)
      ),
      inventory_requirements: graph.inventory_requirements.filter(requirement => {
        const consumeNodeUuid = requirement.consume_node_uuid
        return typeof consumeNodeUuid !== 'string' || !nodeUuids.has(consumeNodeUuid)
      })
    }
  })

  /** 以当前 graph revision 为 CAS 基线保存 Backend 画布。 */
  const saveDefinition = async (): Promise<void> => {
    if (!editableGraph || !definitionDirty || liveTask) return
    await runAction(async () => {
      const saved = await runtime.saveBackendWorkflowGraph(
        workflowUuid,
        editableGraph
      )
      setEditableGraph(saved)
      setDefinitionDirty(false)
      definitionDirtyRef.current = false
      setDefinitionError(null)
      setPreparationGeneration(generation => generation + 1)
      setPreflightGeneration(generation => generation + 1)
    }, `Backend 工作流图已保存`)
  }

  /** 在最新 Backend 预检通过后创建正式工作流任务。 */
  const createSelectedRun = async (): Promise<void> => {
    if (executionBlockedReason) throw new Error(executionBlockedReason)
    const selectedNodeUuid = runMode === 'single_node'
      ? selectedTarget?.workflow_node_uuid
      : undefined
    if (runMode === 'single_node' && !selectedNodeUuid) {
      throw new Error('请选择要运行的工作流节点')
    }
    const latestPreflight = await runtime.getWorkflowRunPreflight(
      workflowUuid,
      runMode,
      selectedNodeUuid
    )
    setPreflight(latestPreflight)
    if (latestPreflight.status !== 'ready' || !latestPreflight.can_run) {
      throw new Error(existingWorkflowPreflightFailureMessage(latestPreflight))
    }
    if (
      selectedNodeUuid &&
      preparation &&
      latestPreflight.workflow_revision !== preparation.workflow_revision
    ) {
      setPreparationGeneration((generation) => generation + 1)
      throw new Error('工作流定义已更新，请重新选择单节点目标后再运行')
    }
    await taskRuntime.create(runMode, undefined, selectedNodeUuid)
  }

  return (
    <div className={[
      styles.workflow,
      'workflow-runtime persistent-authoring persistent-authoring--canvas',
      'relative flex h-full w-full flex-col',
      'bg-[var(--unilab-color-canvas)] text-[var(--unilab-color-text)]'
    ].join(' ')}>
      <WorkflowWorkspaceToolbar
        task={task}
        message={snapshot.loading ? '正在读取 Backend 任务状态' : message}
        onChooseWorkflow={onChooseWorkflow}
        navigationDisabled={busy}
        navigationDisabledReason="正在处理工作流任务，请稍后返回列表"
        codeMode={{
          active: false,
          disabled: true,
          disabledReason: 'Backend 模式只编辑远端画布；工作区代码不会作用于本图'
        }}
        canvasMode={{
          active: true,
          disabled: false,
          disabledReason: editingEnabled
            ? '当前直接编辑 Backend 工作流定义'
            : '当前显示 Backend 工作流定义的只读画布'
        }}
        save={{
          dirty: definitionDirty,
          disabled: !editingEnabled || !definitionDirty || busy || liveTask,
          disabledReason: !editingEnabled
            ? editingStatus?.reason || 'Backend 未提供工作流图写接口'
            : liveTask
              ? '活动任务期间不能修改其工作流定义'
              : !definitionDirty
                ? 'Backend 画布没有待保存修改'
                : '正在处理工作流，请稍后保存',
          title: '保存 Backend 工作流图',
          onSave: () => void saveDefinition()
        }}
      >
        <ExistingWorkflowRuntimeActions
          runMode={runMode}
          targetNodeUuid={targetNodeUuid}
          enabledNodes={enabledNodes}
          busy={busy || snapshot.loading}
          liveTask={liveTask}
          preparationLoading={preparationLoading}
          preparationError={preparationError}
          preflightLoading={preflightLoading}
          preflight={preflight}
          preflightError={preflightError}
          preflightReady={preflightReady}
          targetRequired={targetRequired}
          startDisabled={startDisabled}
          startDisabledReason={existingWorkflowStartDisabledReason({
            busy,
            loadingTask: snapshot.loading,
            liveTask,
            executionBlockedReason,
            preflightLoading,
            preflight,
            preflightError,
            targetRequired
          })}
          controls={toolbarControls}
          onRunModeChange={chooseRunMode}
          onTargetNodeChange={chooseTargetNode}
          onPreparationRetry={() => setPreparationGeneration(
            (generation) => generation + 1
          )}
          onPreflightRetry={() => setPreflightGeneration(
            (generation) => generation + 1
          )}
          onStart={() => void runAction(
            createSelectedRun,
            `Backend 已创建${existingWorkflowRunModeLabel(runMode)}任务；请刷新查看 Scheduler 执行结果`
          )}
          onRefresh={() => void runAction(
            taskRuntime.refresh,
            '已从 Backend 补读任务、节点作业和反馈'
          )}
          onCommand={(type, acceptedMessage) => command(type, acceptedMessage)}
        />
      </WorkflowWorkspaceToolbar>

      <section
        className="persistent-authoring__workbench is-canvas-mode has-external-code-editor"
        aria-label="工作流编写区"
      >
        <ExistingWorkflowCanvas
          workflowName={workflowName}
          structure={structure}
          loading={editingEnabled ? definitionLoading : preparationLoading}
          error={editingEnabled ? definitionError : preparationError}
          selectedNodeId={selectedNodeId}
          nodeStates={canvasNodeStates}
          onNodeSelect={chooseCanvasNode}
          onRetry={() => editingEnabled
            ? setDefinitionGeneration(generation => generation + 1)
            : setPreparationGeneration(generation => generation + 1)}
          editable={editingEnabled && !liveTask}
          dirty={definitionDirty}
          onNodePositionChange={moveDefinitionNode}
          onConnectHandles={connectDefinitionHandles}
          onDeleteRequest={deleteDefinitionSelection}
          onToggleDisabled={toggleDefinitionNode}
        />
      </section>

      <section
        className="persistent-authoring__runtime"
        aria-label="工作流任务运行控制"
      >
        <WorkflowOutput
          expanded={outputExpanded}
          resizable
          activeTab={outputTab}
          completedNodeCount={completedJobCount}
          expectedNodeCount={snapshot.jobs.length}
          nodes={outputNodes}
          nodeNames={nodeNames}
          events={outputEvents}
          error={runtimeError}
          selectedNode={selectedNode}
          selectedNodeId={selectedNodeId}
          pausedBeforeNodeId={null}
          title="运行输出"
          countLabel="个节点任务已结束"
          nodesTabLabel="节点任务状态"
          eventsTabLabel="节点反馈"
          eventsEmptyLabel="刷新后显示 Backend 已持久化的节点反馈"
          onExpandedChange={setOutputExpanded}
          onTabChange={setOutputTab}
          onNodeSelect={setSelectedNodeId}
          onClearError={taskRuntime.clearError}
          onTraceOpen={traceRuntime
            ? () => setTraceViewerOpen(true)
            : undefined}
        />
      </section>
      {traceRuntime && (
        <WorkflowTraceViewer
          open={traceViewerOpen}
          currentRunId={task?.uuid ?? null}
          runtime={traceRuntime}
          onClose={() => setTraceViewerOpen(false)}
        />
      )}
    </div>
  )
}

/** 从 Backend 冻结的工作流快照读取节点名称，不把快照提升为前端权威。 */
function snapshotNodeNames(snapshot: unknown): Record<string, string> {
  const record = asRecord(snapshot)
  const nodes = Array.isArray(record.nodes) ? record.nodes : []
  return Object.fromEntries(nodes.flatMap((value) => {
    const node = asRecord(value)
    return typeof node.uuid === 'string'
      ? [[node.uuid, typeof node.name === 'string' ? node.name : node.uuid]]
      : []
  }))
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

/** 把共享运行控件中的 OS 泛称收敛为当前面板实际连接的 Backend。 */
function backendRuntimeCopy(value: string): string {
  return value.replaceAll('OS', 'Backend')
}

/** 把未知异常转换为面向操作者的稳定错误文本。 */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
