import type {
  WorkflowAuthoringGraph,
  WorkflowMaterialSourceCatalogSnapshot,
  WorkflowRuntimePort
} from '@unilab/services'

import { projectMaterialSourceEditor } from './workflowMaterialSource'

export interface WorkflowMaterialSourceAuthorityResult {
  catalog: WorkflowMaterialSourceCatalogSnapshot
  blockedReason: string | null
}

/**
 * 使用同一份目录快照校验候选图中的全部物料来源（MaterialSource）引用。
 *
 * @param catalog 操作系统（OS）最新发布的物料、库位（Site）和模板目录。
 * @param graph 即将应用或运行的候选/已应用工作流图（Workflow Graph）。
 * @returns 允许继续时为 null；否则返回包含节点与具体失效引用的中文原因。
 */
export function workflowMaterialSourceAuthorityBlockedReason(
  catalog: WorkflowMaterialSourceCatalogSnapshot,
  graph: WorkflowAuthoringGraph
): string | null {
  const problems: string[] = []
  for (const node of graph.nodes) {
    if (node.type !== 'material_source') continue
    const nodeUuid = typeof node.uuid === 'string' ? node.uuid : ''
    const nodeName = typeof node.name === 'string' && node.name
      ? node.name
      : nodeUuid || '未命名物料来源'
    if (!nodeUuid) {
      problems.push(`${nodeName}：节点 UUID 无效`)
      continue
    }
    try {
      const projection = projectMaterialSourceEditor(catalog, graph, nodeUuid)
      if (projection.staleReferences.length > 0) {
        problems.push(
          `${nodeName}：${projection.staleReferences.join('、')}`
        )
      }
    } catch (error) {
      problems.push(
        `${nodeName}：${error instanceof Error ? error.message : '选择器无效'}`
      )
    }
  }
  if (problems.length === 0) return null
  return `物料来源目录已刷新，但候选仍引用失效项：${problems.join('；')}`
}

/**
 * 在应用候选或打开任务输入前重读物料来源（MaterialSource）权威并立即校验。
 *
 * @param runtime 只需提供物料来源目录读取能力的工作流运行端口。
 * @param graph 即将应用或运行的工作流图（Workflow Graph）。
 * @returns 同一代最新目录及其精确关闭失败原因。
 */
export async function rehydrateWorkflowMaterialSourceAuthority(
  runtime: Pick<WorkflowRuntimePort, 'getWorkflowMaterialSourceCatalog'>,
  graph: WorkflowAuthoringGraph
): Promise<WorkflowMaterialSourceAuthorityResult> {
  const catalog = await runtime.getWorkflowMaterialSourceCatalog()
  return {
    catalog,
    blockedReason: workflowMaterialSourceAuthorityBlockedReason(catalog, graph)
  }
}
