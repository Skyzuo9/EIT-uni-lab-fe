import type { WorkflowAuthoringAggregate } from '@unilab/services'
import type {
  WorkflowIdeBridge,
  WorkflowSourceMapEntry,
  WorkflowSourceProjection
} from '@unilab/workflow-ide-bridge'
import { useEffect, useMemo } from 'react'

import { projectWorkflowSourceNavigation } from '../utils/workflowSourceNavigation'

interface WorkflowIdeSourceProjectionOptions {
  aggregate: WorkflowAuthoringAggregate | null
  workflowUuid: string
  sourceMap: readonly WorkflowSourceMapEntry[]
  ideBridge?: WorkflowIdeBridge
}

/** 向 IDE 宿主发布同一 OS 源码身份签发的导航投影。 */
export function useWorkflowIdeSourceProjection({
  aggregate,
  workflowUuid,
  sourceMap,
  ideBridge
}: WorkflowIdeSourceProjectionOptions): WorkflowSourceProjection | null {
  const projection = useMemo(
    () => projectWorkflowSourceNavigation(aggregate, workflowUuid, sourceMap),
    [aggregate, sourceMap, workflowUuid]
  )
  const onProjectionChange = ideBridge?.onSourceProjectionChange
  useEffect(() => {
    onProjectionChange?.(projection)
  }, [onProjectionChange, projection])
  return projection
}
