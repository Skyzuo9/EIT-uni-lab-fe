import type { WorkflowLink, WorkflowNode } from './parseWorkflow'

export interface WorkflowMaterialChip {
  handleUuid: string
  label: string
  sourceNodeUuid: string
  accent: string
  shortIdentity: string
}

export interface WorkflowMaterialTraceProjection {
  edgeAccents: Map<number, string>
  chipsByNode: Map<string, WorkflowMaterialChip[]>
}

const MATERIAL_TRACE_ACCENTS = [
  '#6657c7',
  '#8056a8',
  '#4f69b8',
  '#785aa6',
  '#5364a3',
  '#6d5a9d',
  '#465fa8',
  '#7451a1'
] as const

export function materialTraceAccent(nodeUuid: string): string {
  let hash = 2166136261
  for (let index = 0; index < nodeUuid.length; index += 1) {
    hash ^= nodeUuid.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return MATERIAL_TRACE_ACCENTS[(hash >>> 0) % MATERIAL_TRACE_ACCENTS.length]
}

export function projectMaterialTraces(
  nodes: readonly WorkflowNode[],
  links: readonly WorkflowLink[]
): WorkflowMaterialTraceProjection {
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const edgeAccents = new Map<number, string>()
  const chipsByNode = new Map<string, WorkflowMaterialChip[]>()
  links.forEach((link, index) => {
    const source = nodeById.get(link.source)
    if (
      source?.type !== 'material_source' ||
      !link.sourceHandleUuid ||
      !link.targetHandleUuid
    ) return
    const accent = materialTraceAccent(source.id)
    edgeAccents.set(index, accent)
    const chips = chipsByNode.get(link.target) ?? []
    chips.push({
      handleUuid: link.targetHandleUuid,
      label: source.name,
      sourceNodeUuid: source.id,
      accent,
      shortIdentity: source.id.replace(/-/g, '').slice(-4)
    })
    chipsByNode.set(link.target, chips)
  })
  return { edgeAccents, chipsByNode }
}
