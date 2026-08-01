import type {
  WorkflowRuntimePort,
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
    runMode: Exclude<WorkflowTaskRunMode, 'single_node'>
  ) => Promise<void>
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
    create: (runMode) => controller.create(runMode),
    command: (type) => controller.command(type),
    refresh: () => controller.refresh(),
    clearError: () => controller.clearError()
  }
}
