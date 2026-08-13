import { useEffect, useMemo, useState } from 'react'

import type {
  WorkflowRuntimePort,
  WorkflowRunPreflightReport,
  WorkflowRunPreparation,
  WorkflowTaskCommandType,
  WorkflowTaskRunMode
} from '@unilab/services'

import { useWorkflowTaskRuntime } from '../hooks/useWorkflowTaskRuntime'
import { TERMINAL_JOB_STATUSES, workflowTaskMetadata } from '../utils/workflowTaskPanelProjection'
import {
  workflowTaskControls,
  workflowTaskIsLive,
  workflowTaskStatusLabel,
  workflowTaskToolbarControls,
  workflowTaskVisualStatus
} from '../utils/workflowTaskPresentation'
import {
  projectWorkflowTaskEvents,
  projectWorkflowTaskJob
} from '../utils/workflowTaskOutputProjection'
import {
  existingWorkflowPreflightFailureMessage,
  existingWorkflowRunButtonLabel,
  existingWorkflowRunModeLabel,
  existingWorkflowStartDisabledReason
} from '../utils/existingWorkflowRunProjection'
import { WorkflowButton } from './WorkflowButton'
import { WorkflowDebugger } from './WorkflowDebugger'
import { ExistingWorkflowRunSetup } from './ExistingWorkflowRunSetup'
import { WorkflowOutput, type WorkflowOutputTab } from './WorkflowOutput'
import styles from './workflow.module.scss'

interface ExistingWorkflowRuntimePanelProps {
  runtime: WorkflowRuntimePort
  workflowUuid: string
  onChooseWorkflow?: () => void
}

/**
 * 运行 Backend 中已有的工作流定义，不开放任何工作流创作入口。
 * 任务、节点作业和反馈始终通过 Backend 权威接口创建或补读。
 */
export function ExistingWorkflowRuntimePanel({
  runtime,
  workflowUuid,
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
  const [preflight, setPreflight] = useState<WorkflowRunPreflightReport | null>(null)
  const [preflightError, setPreflightError] = useState<string | null>(null)
  const [preflightLoading, setPreflightLoading] = useState(true)
  const [preflightGeneration, setPreflightGeneration] = useState(0)
  const [outputExpanded, setOutputExpanded] = useState(true)
  const [outputTab, setOutputTab] = useState<WorkflowOutputTab>('nodes')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const task = snapshot.task
  const liveTask = workflowTaskIsLive(task)
  const outputNodes = useMemo(
    () => snapshot.jobs.map(projectWorkflowTaskJob),
    [snapshot.jobs]
  )
  const outputEvents = useMemo(
    () => projectWorkflowTaskEvents(snapshot.events, snapshot.feedback, snapshot.jobs),
    [snapshot.events, snapshot.feedback, snapshot.jobs]
  )
  const nodeNames = useMemo(() => snapshotNodeNames(task?.workflow_snapshot), [task])
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
    snapshot.feedbackError
  const enabledNodes = useMemo(
    () => preparation?.nodes.filter((node) => !node.disabled) ?? [],
    [preparation]
  )
  const selectedTarget = enabledNodes.find(
    (node) => node.workflow_node_uuid === targetNodeUuid
  )
  const preflightReady = preflight?.status === 'ready' && preflight.can_run
  const targetRequired = runMode === 'single_node' && !selectedTarget
  const startDisabled = busy || snapshot.loading || liveTask ||
    preflightLoading || !preflightReady || targetRequired
  const taskMetadata = useMemo(
    () => workflowTaskMetadata(task, snapshot.lastCommand, snapshot).map((item) => ({
      ...item,
      value: item.label === '状态同步'
        ? '手动刷新'
        : backendRuntimeCopy(String(item.value))
    })),
    [snapshot, task]
  )

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

  /** 在最新 Backend 预检通过后创建正式工作流任务。 */
  const createSelectedRun = async (): Promise<void> => {
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
    <div className={`${styles.workflow} workflow-runtime workflow-runtime__existing-run`}>
      <header className="workflow-runtime__existing-run-header">
        <div className="workflow-runtime__existing-run-navigation">
          {onChooseWorkflow ? (
            <WorkflowButton
              type="button"
              disabledReason="正在切换工作流"
              onClick={onChooseWorkflow}
            >
              ← 工作流目录
            </WorkflowButton>
          ) : null}
          <div>
            <span>已有工作流运行</span>
            <code title={workflowUuid}>{workflowUuid}</code>
          </div>
        </div>
        <div className="workflow-runtime__existing-run-actions">
          <WorkflowButton
            type="button"
            disabled={startDisabled}
            disabledReason={existingWorkflowStartDisabledReason({
              busy,
              loadingTask: snapshot.loading,
              liveTask,
              preflightLoading,
              preflight,
              preflightError,
              targetRequired
            })}
            onClick={() => void runAction(
              createSelectedRun,
              `Backend 已创建${existingWorkflowRunModeLabel(runMode)}任务；请刷新查看 Scheduler 执行结果`
            )}
          >
            <span aria-hidden="true">▶</span>
            {existingWorkflowRunButtonLabel(runMode)}
          </WorkflowButton>
          <WorkflowButton
            type="button"
            disabled={busy || snapshot.loading}
            disabledReason="正在读取 Backend 运行状态"
            onClick={() => void runAction(
              taskRuntime.refresh,
              '已请求 Backend 补读；以任务状态卡显示为准'
            )}
          >
            <span aria-hidden="true">↻</span>
            刷新状态
          </WorkflowButton>
        </div>
      </header>

      <ExistingWorkflowRunSetup
        runMode={runMode}
        targetNodeUuid={targetNodeUuid}
        enabledNodes={enabledNodes}
        disabled={busy || liveTask}
        preparationLoading={preparationLoading}
        preparationError={preparationError}
        preflightLoading={preflightLoading}
        preflight={preflight}
        preflightError={preflightError}
        preflightReady={preflightReady}
        targetRequired={targetRequired}
        onRunModeChange={chooseRunMode}
        onTargetNodeChange={setTargetNodeUuid}
        onPreparationRetry={() => setPreparationGeneration(
          (generation) => generation + 1
        )}
        onPreflightRetry={() => setPreflightGeneration(
          (generation) => generation + 1
        )}
      />

      <div className="workflow-runtime__existing-run-notice" role="status" aria-live="polite">
        <strong>{snapshot.loading ? '正在读取 Backend…' : message}</strong>
        <span>
          工作流创作未启用。Backend 当前未提供完整工作流运行事件流，页面不会猜测终态；
          请使用“刷新状态”读取权威结果。
        </span>
        {snapshot.realtimeError ? <small>{snapshot.realtimeError}</small> : null}
      </div>

      <main className="workflow-runtime__existing-run-body">
        <WorkflowDebugger
          debugStatus={workflowTaskVisualStatus(task)}
          runStatus={task?.status ?? 'draft'}
          heading="工作流任务"
          subtitle="Backend HTTP + Scheduler 权威状态"
          statusText={task ? workflowTaskStatusLabel(task.status) : '尚未创建任务'}
          runStatusText={task ? workflowTaskStatusLabel(task.status) : '未开始'}
          runStatusPrefix="任务"
          metadata={taskMetadata}
          actionGroupLabel="工作流任务运行控制"
          dangerGroupLabel="工作流任务停止控制"
          commandDataAttribute="runtime"
          controls={toolbarControls}
          onCommand={(type, acceptedMessage) => command(type, acceptedMessage)}
        />

        <section className="workflow-runtime__existing-run-summary" aria-label="任务状态摘要">
          <div><span>任务状态</span><strong>{workflowTaskStatusLabel(task?.status)}</strong></div>
          <div><span>节点作业</span><strong>{completedJobCount}/{snapshot.jobs.length}</strong></div>
          <div><span>清理状态</span><strong>{cleanupStatusLabel(task?.cleanup_status)}</strong></div>
          <div><span>最近更新</span><strong>{formatTime(task?.update_time)}</strong></div>
        </section>

        <WorkflowOutput
          expanded={outputExpanded}
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
          title="Backend 运行输出"
          countLabel="个节点任务已结束"
          nodesTabLabel="节点任务状态"
          eventsTabLabel="节点反馈"
          eventsEmptyLabel="刷新后显示 Backend 已持久化的节点反馈"
          onExpandedChange={setOutputExpanded}
          onTabChange={setOutputTab}
          onNodeSelect={setSelectedNodeId}
          onClearError={taskRuntime.clearError}
        />
      </main>
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

function cleanupStatusLabel(status: string | undefined): string {
  return {
    none: '无需清理',
    pending: '等待清理',
    canceling: '正在清理',
    settled: '清理完成',
    requires_attention: '需要人工处理'
  }[status ?? ''] ?? '尚未创建'
}

function formatTime(value: string | undefined): string {
  if (!value) return '—'
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp)
    ? new Intl.DateTimeFormat('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }).format(timestamp)
    : value
}

/** 把共享运行控件中的 OS 泛称收敛为当前面板实际连接的 Backend。 */
function backendRuntimeCopy(value: string): string {
  return value.replaceAll('OS', 'Backend')
}

/** 把未知异常转换为面向操作者的稳定错误文本。 */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
