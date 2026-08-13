import type { WorkflowLink, WorkflowNode } from './parseWorkflow'
import {
  projectMaterialTraces,
  workflowMaterialRoleLabel
} from './workflowMaterialTrace'

export type WorkflowSupportingMaterialPresentation =
  | 'reaction-formula'
  | 'full-branches'

export interface WorkflowReactionMaterialItem {
  lineageKey: string
  sourceNodeUuid: string
  sourceNodeName: string
  materialRole: string
  materialRoleLabel: string
  accent: string
}

export interface WorkflowReactionMaterialAnnotation {
  targetNodeUuid: string
  targetNodeName: string
  items: WorkflowReactionMaterialItem[]
}

/**
 * 把汇入主样品（Primary Sample）骨架的辅助物料（Material）投影为反应物标注。
 *
 * 每条辅助谱系只在实际跨入主样品骨架的节点旁显示一次；完整物料来源、预处理
 * 节点和物料流（MaterialFlow）边仍保留在权威工作流图（Workflow Graph）中。
 *
 * @param nodes 当前可见工作流（Workflow）投影中的节点。
 * @param links 当前可见工作流投影中的边。
 * @param backboneNodeIds 主样品蛇形布局确认的主干节点 UUID。
 * @returns 按主干目标节点分组、可直接用于有机反应式展示的辅助物料标注。
 */
export function projectWorkflowReactionMaterialAnnotations(
  nodes: readonly WorkflowNode[],
  links: readonly WorkflowLink[],
  backboneNodeIds: ReadonlySet<string>
): WorkflowReactionMaterialAnnotation[] {
  const traces = projectMaterialTraces(nodes, links)
  const lineageByKey = new Map(
    traces.lineages.map((lineage) => [lineage.key, lineage])
  )
  const nodeNames = new Map(nodes.map((node) => [node.id, node.name]))
  // `itemsByTarget` 记录每个主干反应步骤实际接收的辅助物料谱系。
  const itemsByTarget = new Map<string, Map<string, WorkflowReactionMaterialItem>>()

  links.forEach((link, index) => {
    if (!backboneNodeIds.has(link.target)) return
    const lineageKey = traces.edgeLineages.get(index)
    const lineage = lineageKey ? lineageByKey.get(lineageKey) : undefined
    if (!lineage || lineage.materialRole === 'primary_sample') return
    if (backboneNodeIds.has(link.source)) return

    const targetItems = itemsByTarget.get(link.target) ?? new Map()
    targetItems.set(lineage.key, {
      lineageKey: lineage.key,
      sourceNodeUuid: lineage.sourceNodeUuid,
      sourceNodeName: lineage.sourceNodeName,
      materialRole: lineage.materialRole,
      materialRoleLabel: workflowMaterialRoleLabel(lineage.materialRole),
      accent: lineage.accent
    })
    itemsByTarget.set(link.target, targetItems)
  })

  return [...itemsByTarget.entries()].map(([targetNodeUuid, items]) => ({
    targetNodeUuid,
    targetNodeName: nodeNames.get(targetNodeUuid) ?? targetNodeUuid,
    items: [...items.values()]
  }))
}
