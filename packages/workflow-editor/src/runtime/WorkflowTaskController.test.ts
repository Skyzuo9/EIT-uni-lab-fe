import type {
  WorkflowNodeJob,
  WorkflowRuntimeChangedEvent,
  WorkflowRuntimePort,
  WorkflowTask,
  WorkflowTaskCommand
} from '@unilab/services'
import { describe, expect, it, vi } from 'vitest'

import { WorkflowTaskController } from './WorkflowTaskController'

describe('WorkflowTaskController', () => {
  it('subscribes before discovering and installing a coherent Task/Jobs snapshot', async () => {
    const order: string[] = []
    const task = workflowTask()
    const jobs = [workflowJob()]
    const runtime = runtimePort({
      subscribeWorkflowRuntime: vi.fn(() => {
        order.push('subscribe')
        return { dispose: vi.fn() }
      }),
      listWorkflowTasks: vi.fn(async () => {
        order.push('list')
        return { items: [task], total: 1, page: 1, page_size: 1 }
      }),
      getWorkflowTask: vi.fn(async () => task),
      listWorkflowTaskJobs: vi.fn(async () => jobs)
    })
    const controller = new WorkflowTaskController(runtime, task.workflow_uuid)

    await controller.start()

    expect(order).toEqual(['subscribe', 'list'])
    expect(controller.getSnapshot()).toMatchObject({
      loading: false,
      task,
      jobs,
      error: null,
      generation: 1
    })
  })

  it('retains the previous coherent bundle when either REST projection fails', async () => {
    const firstTask = workflowTask()
    const firstJobs = [workflowJob()]
    let failJobs = false
    const runtime = runtimePort({
      subscribeWorkflowRuntime: vi.fn(() => ({ dispose: vi.fn() })),
      listWorkflowTasks: vi.fn(async () => ({
        items: [firstTask], total: 1, page: 1, page_size: 1
      })),
      getWorkflowTask: vi.fn(async (): Promise<WorkflowTask> => ({
        ...firstTask,
        control_status: failJobs ? 'paused' : 'active'
      })),
      listWorkflowTaskJobs: vi.fn(async () => {
        if (failJobs) throw new Error('jobs unavailable')
        return firstJobs
      })
    })
    const controller = new WorkflowTaskController(
      runtime,
      firstTask.workflow_uuid
    )
    await controller.start()
    failJobs = true

    await controller.refresh()

    expect(controller.getSnapshot()).toMatchObject({
      task: firstTask,
      jobs: firstJobs,
      error: 'jobs unavailable',
      generation: 1
    })
  })

  it('keeps command acceptance separate from SSE-confirmed Task authority', async () => {
    const initial = workflowTask()
    let authoritative = initial
    let onInvalidate: ((event: WorkflowRuntimeChangedEvent) => void) | null = null
    const accepted = workflowCommand(initial.uuid)
    const runtime = runtimePort({
      subscribeWorkflowRuntime: vi.fn((listener) => {
        onInvalidate = listener
        return { dispose: vi.fn() }
      }),
      listWorkflowTasks: vi.fn(async () => ({
        items: [initial], total: 1, page: 1, page_size: 1
      })),
      getWorkflowTask: vi.fn(async () => authoritative),
      listWorkflowTaskJobs: vi.fn(async () => [workflowJob()]),
      commandWorkflowTask: vi.fn(async () => accepted)
    })
    const controller = new WorkflowTaskController(
      runtime,
      initial.workflow_uuid
    )
    await controller.start()

    await controller.command('pause')

    expect(controller.getSnapshot()).toMatchObject({
      lastCommand: accepted,
      task: { control_status: 'active' }
    })

    authoritative = { ...initial, control_status: 'paused' }
    expect(onInvalidate).not.toBeNull()
    ;(onInvalidate as unknown as (
      event: WorkflowRuntimeChangedEvent
    ) => void)({
      id: 'runtime-2',
      event: 'workflow.runtime.changed',
      data: { workflow_task_uuid: initial.uuid }
    })

    await vi.waitFor(() => {
      expect(controller.getSnapshot().task?.control_status).toBe('paused')
    })
  })

  it('creates the selected Task mode and rehydrates the returned identity', async () => {
    const task = { ...workflowTask(), run_mode: 'step' as const }
    const runtime = runtimePort({
      subscribeWorkflowRuntime: vi.fn(() => ({ dispose: vi.fn() })),
      listWorkflowTasks: vi.fn(async () => ({
        items: [], total: 0, page: 1, page_size: 1
      })),
      createWorkflowTask: vi.fn(async () => task),
      getWorkflowTask: vi.fn(async () => task),
      listWorkflowTaskJobs: vi.fn(async () => [workflowJob()])
    })
    const controller = new WorkflowTaskController(runtime, task.workflow_uuid)
    await controller.start()

    await controller.create('step')

    expect(runtime.createWorkflowTask).toHaveBeenCalledWith({
      workflow_uuid: task.workflow_uuid,
      run_mode: 'step'
    })
    expect(runtime.getWorkflowTask).toHaveBeenCalledWith(task.uuid)
    expect(controller.getSnapshot().task?.run_mode).toBe('step')
  })

  it('disposes the global subscription and ignores late REST completion', async () => {
    const task = workflowTask()
    const dispose = vi.fn()
    let resolveTask: ((value: WorkflowTask) => void) | null = null
    const taskRead = new Promise<WorkflowTask>((resolve) => {
      resolveTask = resolve
    })
    const listener = vi.fn()
    const runtime = runtimePort({
      subscribeWorkflowRuntime: vi.fn(() => ({ dispose })),
      listWorkflowTasks: vi.fn(async () => ({
        items: [task], total: 1, page: 1, page_size: 1
      })),
      getWorkflowTask: vi.fn(() => taskRead),
      listWorkflowTaskJobs: vi.fn(async () => [workflowJob()])
    })
    const controller = new WorkflowTaskController(runtime, task.workflow_uuid)
    controller.subscribe(listener)
    const start = controller.start()
    await vi.waitFor(() => expect(runtime.getWorkflowTask).toHaveBeenCalled())

    controller.dispose()
    expect(resolveTask).not.toBeNull()
    ;(resolveTask as unknown as (value: WorkflowTask) => void)(task)
    await start

    expect(dispose).toHaveBeenCalledOnce()
    expect(listener).not.toHaveBeenCalled()
    expect(controller.getSnapshot()).toMatchObject({
      loading: true,
      task: null,
      jobs: [],
      generation: 0
    })
  })
})

function runtimePort(
  value: Partial<WorkflowRuntimePort>
): WorkflowRuntimePort {
  return value as WorkflowRuntimePort
}

function workflowTask(): WorkflowTask {
  return {
    uuid: '30000000-0000-4000-8000-000000000001',
    create_time: '2026-08-01T00:00:00Z',
    update_time: '2026-08-01T00:00:00Z',
    meta_data: {},
    workflow_uuid: '10000000-0000-4000-8000-000000000001',
    status: 'pending',
    workflow_snapshot: {},
    execution_plan: {},
    run_mode: 'normal',
    control_status: 'active',
    cleanup_status: 'none',
    trace_context: {},
    input: {},
    output: {},
    error_info: []
  }
}

function workflowJob(): WorkflowNodeJob {
  return {
    uuid: '40000000-0000-4000-8000-000000000001',
    create_time: '2026-08-01T00:00:00Z',
    update_time: '2026-08-01T00:00:00Z',
    meta_data: {},
    workflow_task_uuid: workflowTask().uuid,
    workflow_node_uuid: '20000000-0000-4000-8000-000000000011',
    feedback_sequence: 0,
    topological_index: 0,
    executor_kind: 'action',
    execution_policy: {},
    execution_timeout_seconds: 60,
    status: 'pending',
    attempt: 0,
    param: {},
    feedback_data: {},
    return_info: {},
    control_data: {},
    error_info: []
  }
}

function workflowCommand(taskUuid: string): WorkflowTaskCommand {
  return {
    uuid: '50000000-0000-4000-8000-000000000001',
    create_time: '2026-08-01T00:00:00Z',
    update_time: '2026-08-01T00:00:00Z',
    meta_data: {},
    workflow_task_uuid: taskUuid,
    type: 'pause',
    idempotency_key: 'ui1b-pause-1',
    status: 'pending',
    result: {},
    trace_context: {}
  }
}
