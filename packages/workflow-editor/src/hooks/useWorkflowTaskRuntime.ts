import type {
  WorkflowRuntimePort,
  WorkflowTask,
  WorkflowTaskCommandType,
  WorkflowTaskRunMode
} from '@unilab/services'
import { useEffect, useMemo, useSyncExternalStore } from 'react'

import { WorkflowTaskController } from '../runtime/WorkflowTaskController'

export function useWorkflowTaskRuntime(
  runtime: WorkflowRuntimePort,
  workflowUuid: string
): {
  snapshot: ReturnType<WorkflowTaskController['getSnapshot']>
  create: (
    runMode: Exclude<WorkflowTaskRunMode, 'single_node'>,
    input?: Record<string, unknown>
  ) => Promise<WorkflowTask>
  command: (type: WorkflowTaskCommandType) => Promise<void>
  refresh: () => Promise<void>
  clearError: () => void
} {
  const controller = useMemo(
    () => new WorkflowTaskController(runtime, workflowUuid),
    [runtime, workflowUuid]
  )
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot
  )

  useEffect(() => {
    void controller.start()
    return () => controller.dispose()
  }, [controller])

  return {
    snapshot,
    create: (runMode, input) => controller.create(runMode, input),
    command: (type) => controller.command(type),
    refresh: () => controller.refresh(),
    clearError: () => controller.clearError()
  }
}
