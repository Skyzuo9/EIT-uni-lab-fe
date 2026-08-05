export type WorkflowNodeVisualKind = 'robot-transfer'

export interface PublishedWorkflowSourceIdentity {
  symbol?: string | null
  definitionFqid?: string | null
}

/**
 * 根据已发布工作流的来源身份选择画布视觉，不从可编辑节点名称推断语义。
 *
 * @param source OS 模板中 `meta_data.unilab.workflow_source` 的稳定来源字段。
 * @returns 当前支持的专用节点视觉；无匹配时返回空。
 */
export function workflowNodeVisualKind(
  source: PublishedWorkflowSourceIdentity
): WorkflowNodeVisualKind | undefined {
  const identities = [source.symbol, source.definitionFqid]
    .filter((value): value is string => Boolean(value?.trim()))
    .map(normalizeWorkflowIdentity)
  return identities.some(isStandardMaterialTransferIdentity)
    ? 'robot-transfer'
    : undefined
}

function normalizeWorkflowIdentity(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase().replace(/[\s-]+/g, '_')
}

function isStandardMaterialTransferIdentity(value: string): boolean {
  return value === 's_z_lab_标准物料转运' ||
    value.endsWith('.s_z_lab_标准物料转运') ||
    value === 'material_transfer' ||
    value.endsWith('.material_transfer') ||
    value.includes('.material_transfer.')
}
