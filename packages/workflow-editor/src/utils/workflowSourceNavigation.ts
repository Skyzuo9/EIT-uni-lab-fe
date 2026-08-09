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

/** 发布源码文件绑定；只有同代候选/已应用结果才携带可用 source map。 */
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
  if (sourceVersion) {
    return {
      workflowUuid,
      sourceUri,
      sourceVersion,
      mappingAvailable: true,
      sourceMap
    }
  }
  const draftVersion = aggregate?.draft?.draft_hash
  return draftVersion
    ? {
        workflowUuid,
        sourceUri,
        sourceVersion: draftVersion,
        mappingAvailable: false,
        sourceMap: []
      }
    : null
}
