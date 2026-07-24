/**
 * ============================================================
 * AI-GENERATED CODE METADATA
 * ============================================================
 * Model: Claude Opus 4.8
 * Generation Date: 2026-07-23
 * Prompt Summary: 解析大 web 导出的 JSON 工作流(target_lab_uuid/data{nodes,edges})
 * Context: 节点自带 pose.position 坐标与 param;无 JSON Schema,按 param 值推断 schema 供 RJSF 编参
 * Human Review Status: [ ] Pending  [ ] Reviewed  [ ] Approved
 * ============================================================
 */
import type {
  WorkflowLink,
  WorkflowNode,
  WorkflowStep,
  WorkflowStructure
} from './parseWorkflow'

// 解析 JSON 工作流文本为结构;失败返回 error
export function parseWorkflowJson(text: string): WorkflowStructure {
  const empty: WorkflowStructure = { nodes: [], links: [], steps: [], error: null }
  const trimmed = text.trim()
  if (!trimmed) return empty

  let doc: unknown
  try {
    doc = JSON.parse(trimmed)
  } catch (error) {
    return { ...empty, error: error instanceof Error ? error.message : 'JSON 解析失败' }
  }

  const root = asRecord(doc)
  // 兼容两种层级:{ data: {...} } 或直接就是 data
  const data = asRecord(root.data)
  const rawNodes = asArray(data.nodes ?? root.nodes)
  const rawEdges = asArray(data.edges ?? root.edges)
  if (rawNodes.length === 0) {
    return { ...empty, error: '未找到 data.nodes,不是有效的工作流 JSON' }
  }

  const nodes = rawNodes.map(mapJsonNode)
  const links = mapJsonEdges(rawEdges)
  const steps = rawNodes.map(mapJsonStep)
  return { nodes, links, steps, error: null }
}

// JSON 节点 -> 结构节点(uuid 作 id);不沿用导出坐标,统一交由 layoutDag 做上下分层
function mapJsonNode(raw: unknown): WorkflowNode {
  const r = asRecord(raw)
  return {
    id: str(r.uuid),
    name: str(r.name) || str(r.template_name) || str(r.uuid),
    type: str(r.type) || 'unknown',
    className: str(r.template_name) || str(r.device_name),
    labNodeType: str(r.lab_node_type)
  }
}

// JSON 边 -> 结构连接;同源同目标的多条(不同 handle)去重为一条物理连接
function mapJsonEdges(rawEdges: unknown[]): WorkflowLink[] {
  const seen = new Set<string>()
  const links: WorkflowLink[] = []
  for (const raw of rawEdges) {
    const r = asRecord(raw)
    const source = str(r.source_node_uuid)
    const target = str(r.target_node_uuid)
    if (!source || !target) continue
    const key = `${source}->${target}`
    if (seen.has(key)) continue
    seen.add(key)
    links.push({ source, target, type: 'physical' })
  }
  return links
}

// JSON 节点 -> 执行步骤;action 取 template_name,args 取 param,schema 由 param 推断
function mapJsonStep(raw: unknown): WorkflowStep {
  const r = asRecord(raw)
  const args = asRecord(r.param)
  const action = str(r.template_name) || str(r.footer) || str(r.name)
  return { action, args, schema: inferGoalSchema(args) }
}

// 由 param 键值推断 JSON Schema(包装为 { properties: { goal } } 以对齐 RJSF 约定)
function inferGoalSchema(args: Record<string, unknown>): Record<string, unknown> {
  const properties: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(args)) {
    properties[key] = inferProperty(key, value)
  }
  return {
    type: 'object',
    properties: {
      goal: { type: 'object', title: '参数', properties }
    }
  }
}

// 单个字段的 schema 推断
function inferProperty(key: string, value: unknown): Record<string, unknown> {
  if (typeof value === 'number') return { type: 'number', title: key }
  if (typeof value === 'boolean') return { type: 'boolean', title: key }
  if (typeof value === 'string') return { type: 'string', title: key }
  if (Array.isArray(value)) {
    return { type: 'array', title: key, items: inferArrayItems(value) }
  }
  if (value && typeof value === 'object') {
    // 复杂对象(resource/mount_resource 等)以只读 JSON 文本呈现,避免误改嵌套结构
    return { type: 'string', title: key, description: '复杂对象(只读展示,不建议直接编辑)' }
  }
  return { type: 'string', title: key }
}

// 数组元素类型推断(按首个元素;空数组默认字符串)
function inferArrayItems(value: unknown[]): Record<string, unknown> {
  const first = value[0]
  if (typeof first === 'number') return { type: 'number' }
  if (typeof first === 'boolean') return { type: 'boolean' }
  return { type: 'string' }
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function str(value: unknown): string {
  return value == null ? '' : String(value)
}
