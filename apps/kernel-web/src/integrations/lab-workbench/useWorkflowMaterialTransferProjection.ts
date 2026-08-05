import type {
  WorkflowAuthoringGraph,
  WorkflowEventSubscription,
  WorkflowNodeJob,
  WorkflowRuntimePort
} from '@unilab/services'
import {
  projectWorkflowMaterialTransferRoutes,
  type WorkflowMaterialTransferRoute
} from '@unilab/workflow-editor'
import { useEffect, useState } from 'react'

export interface WorkflowMaterialTransferProjectionState {
  routes: readonly WorkflowMaterialTransferRoute[]
  taskUuid: string | null
  loading: boolean
  stale: boolean
  error: string | null
}

const EMPTY_PROJECTION: WorkflowMaterialTransferProjectionState = {
  routes: [],
  taskUuid: null,
  loading: false,
  stale: false,
  error: null
}

/**
 * 读取当前工作流（Workflow）的编写图和运行态，为 3D 生成只读物料（Material）
 * 转运路线。该 Hook 不拥有工作流文档，也不提交任何运行命令。
 */
export function useWorkflowMaterialTransferProjection(
  runtime: WorkflowRuntimePort,
  workflowUuid: string | null
): WorkflowMaterialTransferProjectionState {
  const [state, setState] = useState(EMPTY_PROJECTION)

  useEffect(() => {
    if (!workflowUuid) {
      setState(EMPTY_PROJECTION)
      return
    }

    let active = true
    let graph: WorkflowAuthoringGraph | null = null
    let jobs: readonly WorkflowNodeJob[] = []
    let taskUuid: string | null = null
    let authoringSubscription: WorkflowEventSubscription | null = null
    let runtimeSubscription: WorkflowEventSubscription | null = null

    const publish = (patch: Partial<WorkflowMaterialTransferProjectionState> = {}): void => {
      if (!active) return
      setState((current) => ({
        ...current,
        routes: graph
          ? projectWorkflowMaterialTransferRoutes(graph, jobs)
          : current.routes,
        taskUuid,
        ...patch
      }))
    }

    const loadAuthoring = async (): Promise<void> => {
      try {
        const aggregate = await runtime.getWorkflowAuthoring(workflowUuid)
        if (!active) return
        graph = aggregate.applied_graph
        publish({ error: null, stale: false })
      } catch (error) {
        publish({
          error: errorMessage(error),
          stale: graph !== null
        })
      }
    }

    const loadTask = async (requestedTaskUuid?: string): Promise<void> => {
      try {
        let nextTaskUuid = requestedTaskUuid
        if (!nextTaskUuid) {
          const page = await runtime.listWorkflowTasks({
            workflow_uuid: workflowUuid,
            page: 1,
            page_size: 1
          })
          nextTaskUuid = page.items[0]?.uuid
        }
        if (!nextTaskUuid) {
          jobs = []
          taskUuid = null
          publish({ error: null, stale: false })
          return
        }
        const [task, nextJobs] = await Promise.all([
          runtime.getWorkflowTask(nextTaskUuid),
          runtime.listWorkflowTaskJobs(nextTaskUuid)
        ])
        if (!active || task.workflow_uuid !== workflowUuid) return
        jobs = nextJobs
        taskUuid = task.uuid
        publish({ error: null, stale: false })
      } catch (error) {
        publish({
          error: errorMessage(error),
          stale: graph !== null || jobs.length > 0
        })
      }
    }

    setState({ ...EMPTY_PROJECTION, loading: true })
    void Promise.all([loadAuthoring(), loadTask()]).finally(() => {
      publish({ loading: false })
    })

    authoringSubscription = runtime.subscribeWorkflowAuthoring(
      workflowUuid,
      () => void loadAuthoring()
    )
    runtimeSubscription = runtime.subscribeWorkflowRuntime((event) => {
      if (event.event !== 'workflow.runtime.changed') return
      void loadTask(event.data.workflow_task_uuid)
    })

    return () => {
      active = false
      authoringSubscription?.dispose()
      runtimeSubscription?.dispose()
    }
  }, [runtime, workflowUuid])

  return state
}

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value)
}
