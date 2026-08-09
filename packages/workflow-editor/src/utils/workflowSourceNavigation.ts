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
  const candidate = aggregate.candidate
  const appliedSource = aggregate.applied_source
  const candidateSourceVersion =
    sameWorkflowSourceMap(candidate?.source_map, sourceMap)
      ? candidate?.candidate_hash ?? null
      : null
  const appliedSourceVersion =
    sameWorkflowSourceMap(appliedSource?.source_map, sourceMap)
      ? appliedSource?.source_hash ?? null
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

/** 源码映射跨 RPC/宿主后对象身份会变化，只比较 OS 合同中的稳定标量。 */
function sameWorkflowSourceMap(
  authoritative: readonly WorkflowSourceMapEntry[] | undefined,
  projected: readonly WorkflowSourceMapEntry[]
): boolean {
  if (!authoritative || authoritative.length !== projected.length) return false
  return authoritative.every((entry, index) => {
    const candidate = projected[index]
    return candidate !== undefined &&
      entry.workflow_node_uuid === candidate.workflow_node_uuid &&
      entry.start_line === candidate.start_line &&
      entry.start_column === candidate.start_column &&
      entry.end_line === candidate.end_line &&
      entry.end_column === candidate.end_column
  })
}
