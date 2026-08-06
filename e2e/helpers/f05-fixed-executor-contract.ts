import { readPublicEnvelope } from './f05-material-source-real-os'

export const F05_FIXED_WORKFLOW_UUID =
  '65000000-0000-4000-8000-0000000002c0'
export const F05_ACTION_NODE_UUID =
  '66000000-0000-4000-8000-0000000002c0'

interface FixedExecutorNode {
  uuid: string
  workflow_node_template_uuid: string
  material_uuid?: string | null
  meta_data?: {
    unilab?: {
      executor_binding?: { mode?: string; device_id?: string }
    }
  }
}

interface FixedExecutorAuthoring {
  candidate?: { graph: { nodes: FixedExecutorNode[] } } | null
  applied_graph: { nodes: FixedExecutorNode[] }
}

interface MaterialGraph {
  nodes: Array<{
    material: { uuid: string; resource_template_uuid: string }
  }>
}

interface NodeTemplateDetail {
  template: {
    uuid: string
    resource_template_uuid: string
    schema?: string | null
  }
}

export interface FixedExecutorEvidence {
  workflowUuid: string
  actionNodeUuid: string
  nodeTemplateUuid: string
  resourceTemplateUuid: string
  schemaText: string
}

/**
 * 从真实 OS 公共接口核验固定执行器（Fixed Executor）双投影及模板 Schema 文本。
 *
 * 参数：`url` 是 OS HTTP 根，`deviceMaterialUuid` 是公共物料图中的实际设备物料。
 * 返回：可写入验收制品的固定身份、资源模板（ResourceTemplate）身份与 Schema 文本。
 * 异常：任一身份缺失、分叉，或 Schema 不是合法 JSON 文本时失败关闭。
 */
export async function readFixedExecutorEvidence(
  url: string,
  deviceMaterialUuid: string
): Promise<FixedExecutorEvidence> {
  const authoring = await readPublicEnvelope<FixedExecutorAuthoring>(
    `${url}/api/v1/workflows/${F05_FIXED_WORKFLOW_UUID}/authoring`
  )
  const nodes = authoring.candidate?.graph.nodes ?? authoring.applied_graph.nodes
  const node = nodes.find(isF05ActionNode)
  if (!node || node.material_uuid !== deviceMaterialUuid ||
    node.meta_data?.unilab?.executor_binding?.mode !== 'fixed' ||
    node.meta_data.unilab.executor_binding.device_id !== deviceMaterialUuid) {
    throw new Error('固定执行器双投影缺失或实际设备物料身份分叉')
  }
  const graph = await readPublicEnvelope<MaterialGraph>(
    `${url}/api/v1/materials/graph`
  )
  /**
   * 判断物料聚合是否属于目标固定执行器。
   *
   * @param aggregate 公共物料图（MaterialGraph）聚合。
   * @returns 聚合物料 UUID 与目标设备一致时返回 `true`。
   * @throws 无。
   */
  function isFixedExecutorMaterial(aggregate: MaterialGraph['nodes'][number]): boolean {
    return aggregate.material.uuid === deviceMaterialUuid
  }
  const device = graph.nodes.find(isFixedExecutorMaterial)
  const detail = await readPublicEnvelope<NodeTemplateDetail>(
    `${url}/api/v1/workflow-node-templates/${node.workflow_node_template_uuid}`
  )
  if (!device || detail.template.resource_template_uuid !==
    device.material.resource_template_uuid || typeof detail.template.schema !== 'string') {
    throw new Error(
      `固定执行器映射不完整：${JSON.stringify({ graph, device, template: detail.template })}`
    )
  }
  JSON.parse(detail.template.schema)
  return {
    workflowUuid: F05_FIXED_WORKFLOW_UUID,
    actionNodeUuid: F05_ACTION_NODE_UUID,
    nodeTemplateUuid: detail.template.uuid,
    resourceTemplateUuid: detail.template.resource_template_uuid,
    schemaText: detail.template.schema
  }
}

/**
 * 判断创作节点是否为 F05 固定动作节点。
 *
 * @param candidate 候选工作流节点。
 * @returns 节点 UUID 与固定动作身份一致时返回 `true`。
 * @throws 无。
 */
function isF05ActionNode(
  candidate: FixedExecutorAuthoring['applied_graph']['nodes'][number]
): boolean {
  return candidate.uuid === F05_ACTION_NODE_UUID
}
