import type {
  WorkflowEventSubscription,
  WorkflowNodeJob,
  WorkflowRuntimePort,
  WorkflowTask,
  WorkflowTaskCommand,
  WorkflowTaskCommandType,
  WorkflowTaskRunMode
} from '@unilab/services'

export interface WorkflowTaskRuntimeSnapshot {
  loading: boolean
  task: WorkflowTask | null
  jobs: readonly WorkflowNodeJob[]
  lastCommand: WorkflowTaskCommand | null
  error: string | null
  generation: number
}

type WorkflowTaskRuntimeListener = () => void

export class WorkflowTaskController {
  private readonly listeners = new Set<WorkflowTaskRuntimeListener>()
  private snapshot: WorkflowTaskRuntimeSnapshot = {
    loading: true,
    task: null,
    jobs: [],
    lastCommand: null,
    error: null,
    generation: 0
  }
  private subscription: WorkflowEventSubscription | null = null
  private started = false
  private active = true
  private commandSequence = 0
  private queuedTaskUuid: string | null | undefined
  private refreshInFlight: Promise<void> | null = null

  constructor(
    private readonly runtime: WorkflowRuntimePort,
    private readonly workflowUuid: string
  ) {}

  getSnapshot = (): WorkflowTaskRuntimeSnapshot => this.snapshot

  subscribe = (listener: WorkflowTaskRuntimeListener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async start(): Promise<void> {
    if (this.started || !this.active) return
    this.started = true
    this.subscription = this.runtime.subscribeWorkflowRuntime(
      (event) => {
        void this.requestRefresh(event.data.workflow_task_uuid)
      },
      {
        onError: (error) => {
          this.install({ error: `Runtime 实时同步中断：${error.message}` })
        }
      }
    )
    await this.requestRefresh(null)
  }

  async refresh(): Promise<void> {
    await this.requestRefresh(this.snapshot.task?.uuid ?? null)
  }

  async create(runMode: Exclude<WorkflowTaskRunMode, 'single_node'>): Promise<void> {
    this.install({ error: null })
    try {
      const created = await this.runtime.createWorkflowTask({
        workflow_uuid: this.workflowUuid,
        run_mode: runMode
      })
      if (!this.active) return
      this.install({ lastCommand: null })
      await this.requestRefresh(created.uuid)
    } catch (error) {
      this.install({ error: errorMessage(error), loading: false })
      throw error
    }
  }

  async command(type: WorkflowTaskCommandType): Promise<void> {
    const task = this.snapshot.task
    if (!task) throw new Error('当前没有可控制的 Workflow Task')
    this.install({ error: null })
    try {
      const command = await this.runtime.commandWorkflowTask(task.uuid, {
        type,
        idempotency_key: this.nextIdempotencyKey(task.uuid, type)
      })
      if (!this.active) return
      this.install({ lastCommand: command })
    } catch (error) {
      this.install({ error: errorMessage(error) })
      throw error
    }
  }

  clearError(): void {
    this.install({ error: null })
  }

  dispose(): void {
    if (!this.active) return
    this.active = false
    this.subscription?.dispose()
    this.subscription = null
    this.listeners.clear()
  }

  private requestRefresh(taskUuid: string | null): Promise<void> {
    if (!this.active) return Promise.resolve()
    this.queuedTaskUuid = taskUuid
    if (this.refreshInFlight) return this.refreshInFlight
    this.refreshInFlight = this.drainRefreshQueue().finally(() => {
      this.refreshInFlight = null
    })
    return this.refreshInFlight
  }

  private async drainRefreshQueue(): Promise<void> {
    while (this.active && this.queuedTaskUuid !== undefined) {
      const taskUuid = this.queuedTaskUuid
      this.queuedTaskUuid = undefined
      await this.hydrate(taskUuid)
    }
  }

  private async hydrate(requestedTaskUuid: string | null): Promise<void> {
    try {
      let taskUuid = requestedTaskUuid
      if (taskUuid === null) {
        const page = await this.runtime.listWorkflowTasks({
          workflow_uuid: this.workflowUuid,
          page: 1,
          page_size: 1
        })
        if (!this.active) return
        taskUuid = page.items[0]?.uuid ?? null
        if (taskUuid === null) {
          this.install({
            loading: false,
            task: null,
            jobs: [],
            error: null,
            generation: this.snapshot.generation + 1
          })
          return
        }
      }
      const [task, jobs] = await Promise.all([
        this.runtime.getWorkflowTask(taskUuid),
        this.runtime.listWorkflowTaskJobs(taskUuid)
      ])
      if (!this.active || task.workflow_uuid !== this.workflowUuid) return
      this.install({
        loading: false,
        task,
        jobs: [...jobs].sort(
          (left, right) => left.topological_index - right.topological_index
        ),
        error: null,
        generation: this.snapshot.generation + 1
      })
    } catch (error) {
      this.install({ loading: false, error: errorMessage(error) })
    }
  }

  private nextIdempotencyKey(
    taskUuid: string,
    type: WorkflowTaskCommandType
  ): string {
    this.commandSequence += 1
    return [
      'workflow-ui1b',
      taskUuid,
      type,
      Date.now(),
      this.commandSequence
    ].join(':')
  }

  private install(
    patch: Partial<WorkflowTaskRuntimeSnapshot>
  ): void {
    if (!this.active) return
    this.snapshot = { ...this.snapshot, ...patch }
    for (const listener of this.listeners) listener()
  }
}

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value)
}
