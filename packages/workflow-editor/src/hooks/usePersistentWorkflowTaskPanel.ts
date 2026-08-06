import type {
  WorkflowAuthoringAggregate,
  WorkflowRuntimePort,
  WorkflowTaskRunMode
} from '@unilab/services'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { createWorkflowExecutionScope } from '../utils/canonicalWorkflow'
import type { WorkflowStructure } from '../utils/parseWorkflow'
import {
  errorMessage,
  workflowSourceMap
} from '../utils/persistentAuthoringProjection'
import {
  AuthoringOperationQueue,
  hasRunnableAppliedWorkflow
} from '../utils/persistentAuthoringSession'
import { projectWorkflowCodeMarkers } from '../utils/workflowCodeMarkers'
import {
  createWorkflowTaskInputForm,
  containsResourceSlotInput,
  setWorkflowTaskInputField,
  submitWorkflowTaskInput,
  type WorkflowTaskInputFieldState,
  type WorkflowTaskInputFormState
} from '../utils/workflowTaskInputForm'
import { workflowTaskInputProblem } from '../utils/workflowTaskInputProblem'
import {
  projectWorkflowTaskEvents,
  projectWorkflowTaskJob
} from '../utils/workflowTaskOutputProjection'
import {
  loadWorkflowResourceSlotOptions,
  type WorkflowResourceSlotOptionsPort,
  type WorkflowResourceSlotOptionsState
} from '../utils/workflowResourceSlotOptions'
import {
  TERMINAL_JOB_STATUSES,
  workflowTaskDagState
} from '../utils/workflowTaskPanelProjection'
import { workflowTaskControls } from '../utils/workflowTaskPresentation'
import type { WorkflowOutputTab } from '../components/WorkflowOutput'
import { useWorkflowSessionStore } from '../components/WorkflowSessionProvider'
import { useWorkflowTaskRuntime } from './useWorkflowTaskRuntime'

interface PersistentWorkflowDebugSession {
  startNodeId: string | null
  breakpoints: string[]
}

interface PersistentWorkflowTaskPanelOptions {
  runtime: WorkflowRuntimePort
  workflowUuid: string
  aggregate: WorkflowAuthoringAggregate | null
  structure: WorkflowStructure
  editorValue: string
  setCodeMarkers: (
    markers: ReturnType<typeof projectWorkflowCodeMarkers>
  ) => void
  queue: AuthoringOperationQueue
  resourceSlotOptionsPort?: WorkflowResourceSlotOptionsPort
  setMessage: (message: string) => void
  setError: (message: string | null) => void
}

/**
 * 集中维护工作流任务（WorkflowTask）的运行、输入、调试投影与输出状态。
 * 编写会话只提供已应用聚合、图结构和窄端口，不接管任务生命周期。
 */
export function usePersistentWorkflowTaskPanel({
  runtime,
  workflowUuid,
  aggregate,
  structure,
  editorValue,
  setCodeMarkers,
  queue,
  resourceSlotOptionsPort,
  setMessage,
  setError
}: PersistentWorkflowTaskPanelOptions) {
  const sessionStore = useWorkflowSessionStore()
  const debugSessionKey = `unilab.workflow.debug.${workflowUuid}.v1`
  const [initialDebugSession] = useState<PersistentWorkflowDebugSession | null>(
    () => sessionStore?.read<PersistentWorkflowDebugSession>(
      debugSessionKey
    ) ?? null
  )
  const [taskRunMode, setTaskRunMode] =
    useState<Exclude<WorkflowTaskRunMode, 'single_node'>>('normal')
  const [runtimeBusy, setRuntimeBusy] = useState(false)
  const [taskInputAuthority, setTaskInputAuthority] =
    useState<WorkflowAuthoringAggregate | null>(null)
  const [taskInputForm, setTaskInputForm] =
    useState<WorkflowTaskInputFormState | null>(null)
  const [taskInputProblem, setTaskInputProblem] = useState<string | null>(null)
  const [resourceSlotOptions, setResourceSlotOptions] =
    useState<WorkflowResourceSlotOptionsState | undefined>(undefined)
  const [traceViewerOpen, setTraceViewerOpen] = useState(false)
  const [outputExpanded, setOutputExpanded] = useState(true)
  const [outputTab, setOutputTab] = useState<WorkflowOutputTab>('nodes')
  const [selectedJobNodeUuid, setSelectedJobNodeUuid] =
    useState<string | null>(null)
  const [debugStartNodeId, setDebugStartNodeId] = useState<string | null>(
    initialDebugSession?.startNodeId ?? null
  )
  const [debugBreakpoints, setDebugBreakpoints] = useState<Set<string>>(
    () => new Set(initialDebugSession?.breakpoints ?? [])
  )
  const taskRuntime = useWorkflowTaskRuntime(runtime, workflowUuid)
  const debugExecutionScope = useMemo(
    () => createWorkflowExecutionScope(
      structure.nodes,
      structure.links,
      debugStartNodeId
    ),
    [debugStartNodeId, structure.links, structure.nodes]
  )
  const appliedWorkflowRunnable = useMemo(
    () => hasRunnableAppliedWorkflow(aggregate),
    [aggregate]
  )
  const task = taskRuntime.snapshot.task
  const taskJobs = taskRuntime.snapshot.jobs
  const taskOutputNodes = useMemo(
    () => taskJobs.map(projectWorkflowTaskJob),
    [taskJobs]
  )
  const failedTaskJobCount = useMemo(
    () => taskOutputNodes.filter((node) => node.state === 'failed').length,
    [taskOutputNodes]
  )
  const selectedTaskNode = taskOutputNodes.find(
    (node) => node.sourceNodeId === selectedJobNodeUuid
  )
  const completedTaskJobCount = taskJobs.filter(
    (job) => TERMINAL_JOB_STATUSES.has(job.status)
  ).length
  const taskControls = useMemo(
    () => workflowTaskControls(task, runtimeBusy),
    [runtimeBusy, task]
  )
  const taskNodeNames = useMemo(
    () => Object.fromEntries(structure.nodes.map((node) => [
      node.id,
      node.name || node.id
    ])),
    [structure.nodes]
  )
  const taskRuntimeEvents = useMemo(
    () => projectWorkflowTaskEvents(
      taskRuntime.snapshot.events,
      taskRuntime.snapshot.feedback,
      taskJobs
    ),
    [
      taskJobs,
      taskRuntime.snapshot.events,
      taskRuntime.snapshot.feedback
    ]
  )
  const taskNodeStates = useMemo(
    () => Object.fromEntries(taskJobs.map((job) => [
      job.workflow_node_uuid,
      workflowTaskDagState(
        job.status,
        structure.nodes.find((node) => node.id === job.workflow_node_uuid)
          ?.type === 'material_source',
        task?.status
      )
    ])),
    [structure.nodes, task?.status, taskJobs]
  )
  const codeSourceMap = useMemo(
    () => workflowSourceMap(aggregate, editorValue),
    [aggregate, editorValue]
  )
  const codeMarkers = useMemo(
    () => projectWorkflowCodeMarkers({
      nodeIds: structure.nodes.map((node) => node.id),
      resolveLine: (nodeId) => codeSourceMap.find(
        (entry) => entry.workflow_node_uuid === nodeId
      )?.start_line ?? null,
      startNodeId: debugExecutionScope.startNodeId,
      beforeStartNodeIds: debugExecutionScope.beforeStartNodeIds,
      breakpoints: debugBreakpoints,
      pausedBeforeNodeId: null,
      nodeStates: taskNodeStates
    }),
    [
      codeSourceMap,
      debugBreakpoints,
      debugExecutionScope.beforeStartNodeIds,
      debugExecutionScope.startNodeId,
      structure.nodes,
      taskNodeStates
    ]
  )

  useEffect(() => {
    if (structure.nodes.length === 0) return
    const validNodeIds = new Set(structure.nodes.map((node) => node.id))
    setDebugStartNodeId((current) =>
      current && !validNodeIds.has(current) ? null : current
    )
    setDebugBreakpoints((current) => {
      const next = new Set(
        [...current].filter((nodeId) => validNodeIds.has(nodeId))
      )
      return next.size === current.size ? current : next
    })
  }, [structure.nodes])

  useEffect(() => {
    sessionStore?.write<PersistentWorkflowDebugSession>(debugSessionKey, {
      startNodeId: debugExecutionScope.startNodeId,
      breakpoints: [...debugBreakpoints]
    })
  }, [
    debugBreakpoints,
    debugExecutionScope.startNodeId,
    debugSessionKey,
    sessionStore
  ])

  useEffect(() => {
    setCodeMarkers(codeMarkers)
  }, [codeMarkers, setCodeMarkers])

  useEffect(() => {
    if (
      selectedJobNodeUuid &&
      taskOutputNodes.some(
        (node) => node.sourceNodeId === selectedJobNodeUuid
      )
    ) return
    setSelectedJobNodeUuid(taskOutputNodes[0]?.sourceNodeId ?? null)
  }, [selectedJobNodeUuid, taskOutputNodes])

  useEffect(() => {
    if (failedTaskJobCount === 0) return
    setOutputExpanded(true)
    setOutputTab('errors')
  }, [failedTaskJobCount])

  const runRuntime = useCallback((
    operation: () => Promise<void>
  ): void => {
    setRuntimeBusy(true)
    void operation()
      .catch(() => undefined)
      .finally(() => setRuntimeBusy(false))
  }, [])

  const toggleDebugStartNode = (nodeUuid: string): void => {
    const removing = debugExecutionScope.startNodeId === nodeUuid
    setDebugStartNodeId(removing ? null : nodeUuid)
    setMessage(
      removing
        ? '已取消调试器起始点'
        : '已设置调试器起始点；普通任务不携带此配置'
    )
  }

  const toggleDebugBreakpoint = (nodeUuid: string): void => {
    const removing = debugBreakpoints.has(nodeUuid)
    setDebugBreakpoints((current) => {
      const next = new Set(current)
      if (next.has(nodeUuid)) next.delete(nodeUuid)
      else next.add(nodeUuid)
      return next
    })
    setMessage(
      removing
        ? '已取消调试器断点'
        : '已设置调试器断点；普通任务不携带此配置'
    )
  }

  const openTaskInputForm = (): void => {
    setTaskInputProblem(null)
    if (!hasRunnableAppliedWorkflow(aggregate)) {
      setError('当前工作流候选尚未应用；请先应用包含可执行节点的工作流')
      return
    }
    runRuntime(async () => {
      try {
        const latest = await queue.run(
          () => runtime.getWorkflowAuthoring(workflowUuid)
        )
        if (!hasRunnableAppliedWorkflow(latest)) {
          throw new Error(
            '当前工作流候选尚未应用；已应用版本不包含可执行节点'
          )
        }
        const nextForm = createWorkflowTaskInputForm(latest)
        setTaskInputAuthority(latest)
        setTaskInputForm(nextForm)
        setResourceSlotOptions(undefined)
        if (nextForm.fields.some(({ descriptor }) =>
          containsResourceSlotInput(descriptor.schema)
        )) {
          setResourceSlotOptions(
            await loadWorkflowResourceSlotOptions(resourceSlotOptionsPort)
          )
        }
        setMessage(
          `本次运行使用已应用版本 ${latest.workflow_revision}；` +
          '未填写且没有默认值的字段将保持省略'
        )
      } catch (openError) {
        setError(errorMessage(openError))
        throw openError
      }
    })
  }

  const updateTaskInput = (
    name: string,
    state: WorkflowTaskInputFieldState
  ): void => {
    if (!taskInputForm) return
    const next = setWorkflowTaskInputField(taskInputForm, name, state)
    setTaskInputForm(next)
    setTaskInputProblem(null)
  }

  const submitTaskInput = (): void => {
    if (!taskInputAuthority || !taskInputForm) return
    const submittedForm = taskInputForm
    runRuntime(async () => {
      try {
        const result = await submitWorkflowTaskInput({
          form: submittedForm,
          readApplied: () => queue.run(
            () => runtime.getWorkflowAuthoring(workflowUuid)
          ),
          createTask: (input) => taskRuntime.create(taskRunMode, input)
        })
        if (result.kind === 'reproject_before_create') {
          setTaskInputAuthority(result.authority)
          setTaskInputForm(result.form)
          setTaskInputProblem(result.message)
          return
        }
        if (result.kind === 'reproject_after_create') {
          setTaskInputAuthority(result.authority)
          setTaskInputForm(result.form)
          setTaskInputProblem(result.message)
          setMessage(result.message)
          return
        }
        setTaskInputAuthority(null)
        setTaskInputForm(null)
        setTaskInputProblem(null)
        setMessage(result.message)
      } catch (submitError) {
        setTaskInputProblem(
          workflowTaskInputProblem(submitError, submittedForm)
        )
        throw submitError
      }
    })
  }

  return {
    appliedWorkflowRunnable,
    codeSourceMap,
    completedTaskJobCount,
    debugBreakpoints,
    debugExecutionScope,
    openTaskInputForm,
    outputExpanded,
    outputTab,
    resourceSlotOptions,
    runRuntime,
    runtimeBusy,
    selectedJobNodeUuid,
    selectedTaskNode,
    setOutputExpanded,
    setOutputTab,
    setResourceSlotOptions,
    setSelectedJobNodeUuid,
    setTaskInputAuthority,
    setTaskInputForm,
    setTaskInputProblem,
    setTaskRunMode,
    setTraceViewerOpen,
    submitTaskInput,
    task,
    taskControls,
    taskInputAuthority,
    taskInputForm,
    taskInputProblem,
    taskJobs,
    taskNodeNames,
    taskNodeStates,
    taskOutputNodes,
    taskRunMode,
    taskRuntime,
    taskRuntimeEvents,
    toggleDebugBreakpoint,
    toggleDebugStartNode,
    traceViewerOpen,
    updateTaskInput
  }
}
