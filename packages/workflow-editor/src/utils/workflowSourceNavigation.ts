import type { WorkflowAuthoringAggregate } from '@unilab/services'
import type {
  WorkflowSourceMapEntry,
  WorkflowSourceProjection
} from '@unilab/workflow-ide-bridge'

export {
  workflowNodeAtSourcePosition,
  workflowSourceLocationForNode,
  type WorkflowIdeBridge,
  type WorkflowSourceLocation,
  type WorkflowSourcePosition,
  type WorkflowSourceProjection
} from '@unilab/workflow-ide-bridge'

/** 只发布与同一候选/已应用源码身份共同签发的 source map。 */
export function projectWorkflowSourceNavigation(
  aggregate: WorkflowAuthoringAggregate | null,
  workflowUuid: string,
  sourceMap: readonly WorkflowSourceMapEntry[]
): WorkflowSourceProjection | null {
  const sourceUri = aggregate?.draft?.source_uri
  if (!sourceUri) return null
  const candidateSourceVersion =
    aggregate.candidate?.source_map === sourceMap
      ? aggregate.candidate.candidate_hash
      : null
  const appliedSourceVersion =
    aggregate.applied_source?.source_map === sourceMap
      ? aggregate.applied_source.source_hash
      : null
  const sourceVersion = candidateSourceVersion ?? appliedSourceVersion
  return sourceVersion
    ? { workflowUuid, sourceUri, sourceVersion, sourceMap }
    : null
}
