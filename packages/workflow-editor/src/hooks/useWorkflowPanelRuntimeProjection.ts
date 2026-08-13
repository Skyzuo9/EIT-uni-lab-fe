import type { WorkflowAuthoringAggregate } from '@unilab/services'
import { useEffect, useMemo } from 'react'

import type {
  WorkflowTaskRuntimeSnapshot
} from '../runtime/WorkflowTaskController'
import {
  projectWorkflowMaterialTransferProjection
} from '../utils/workflowMaterialTransferScene'
import type { WorkflowPanelRuntimeProjection } from '../workflowPanelProjection'

/**
 * 从已应用工作流（Workflow）与任务冻结快照发布有界只读运行投影。
 *
 * @param options 已应用编写聚合、操作系统（OS）运行快照及宿主回调。
 * @returns 无返回值；卸载时向宿主撤销当前面板发布的投影。
 */
export function useWorkflowPanelRuntimeProjection(options: {
  aggregate: WorkflowAuthoringAggregate | null
  runtimeSnapshot: WorkflowTaskRuntimeSnapshot
  onProjectionChange?: (
    projection: WorkflowPanelRuntimeProjection | null
  ) => void
}): void {
  const {
    aggregate,
    runtimeSnapshot,
    onProjectionChange
  } = options
  const materialTransferRoutes = useMemo(
    () => aggregate
      ? projectWorkflowMaterialTransferProjection(
          aggregate.applied_graph,
          runtimeSnapshot.task,
          runtimeSnapshot.jobs
        )
      : [],
    [aggregate, runtimeSnapshot.jobs, runtimeSnapshot.task]
  )

  useEffect(() => {
    if (!aggregate) {
      onProjectionChange?.(null)
      return
    }
    onProjectionChange?.({
      workflowUuid: aggregate.workflow_uuid,
      taskUuid: runtimeSnapshot.task?.uuid ?? null,
      generation: runtimeSnapshot.generation,
      materialTransferRoutes
    })
    return () => onProjectionChange?.(null)
  }, [
    materialTransferRoutes,
    aggregate,
    onProjectionChange,
    runtimeSnapshot.generation,
    runtimeSnapshot.task?.uuid
  ])
}
