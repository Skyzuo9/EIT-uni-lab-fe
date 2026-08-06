import { expect, type Locator, type Page } from '@playwright/test'

import type { PersistentAuthoringOs } from './persistent-authoring-os'

export interface AuthoringAggregate {
  workflow_uuid: string
  workflow_revision: number
  state: string
  draft: {
    python_source: string
    draft_hash: string
    source_uri: string
  } | null
  candidate: {
    candidate_hash: string
    normalized_python_source: string
    graph: AuthoringGraph
  } | null
  applied_graph: AuthoringGraph
}

export interface AuthoringGraph {
  workflow: Record<string, unknown>
  nodes: Array<Record<string, unknown>>
  edges: Array<Record<string, unknown>>
  node_templates: Array<Record<string, unknown>>
  handle_templates: Array<Record<string, unknown>>
}

export interface AuthoringTransform {
  diagnostics: unknown[]
  graph: AuthoringGraph | null
  normalized_python_source: string
}

export interface SseEvent {
  id: string
  event: string
  data: Record<string, unknown>
}

/**
 * 读取操作系统（OS）统一响应封装，并在失败时附加日志尾部。
 *
 * @param os 当前真实操作系统（OS）测试运行时。
 * @param url 要读取的 HTTP 资源。
 * @param init 可选请求参数。
 * @returns 响应封装中的权威 data。
 */
export async function readWorkflowEnvelope<Value>(
  os: PersistentAuthoringOs,
  url: string,
  init?: RequestInit
): Promise<Value> {
  const response = await fetch(url, init)
  const responseText = await response.text()
  const osLogTail = os.logs().slice(-8_000)
  expect(
    response.status,
    `${responseText}\n\nOS log tail:\n${osLogTail}`
  ).toBe(200)
  const envelope = JSON.parse(responseText) as {
    code: number
    data: Value
  }
  expect(envelope.code).toBe(0)
  return envelope.data
}

/**
 * 统计指定工作流（Workflow）的已持久化工作流任务（WorkflowTask）。
 *
 * @param os 当前真实操作系统（OS）测试运行时。
 * @param workflowUuid 工作流稳定 UUID。
 * @returns 工作流任务总数。
 */
export async function workflowTaskCount(
  os: PersistentAuthoringOs,
  workflowUuid: string
): Promise<number> {
  const page = await readWorkflowEnvelope<{
    items: unknown[]
    total: number
  }>(
    os,
    `${os.url}/api/v1/workflow-tasks?` +
      `workflow_uuid=${encodeURIComponent(workflowUuid)}&page_size=100`
  )
  expect(page.items).toHaveLength(page.total)
  return page.total
}

/**
 * 把已有可编译候选推进为已应用工作流图（Applied Workflow Graph）。
 *
 * @param os 当前真实操作系统（OS）测试运行时。
 * @param workflowUuid 工作流稳定 UUID。
 * @returns 已应用后的创作权威聚合。
 */
export async function ensureAppliedWorkflow(
  os: PersistentAuthoringOs,
  workflowUuid: string
): Promise<AuthoringAggregate> {
  const authoringUrl = `${os.url}/api/v1/workflows/${workflowUuid}/authoring`
  let aggregate = await readWorkflowEnvelope<AuthoringAggregate>(
    os,
    authoringUrl
  )
  if (aggregate.state === 'applied') return aggregate
  if (!aggregate.draft || !aggregate.candidate) {
    throw new Error(`Workflow ${workflowUuid} has no compilable Candidate`)
  }
  aggregate = await readWorkflowEnvelope<AuthoringAggregate>(
    os,
    `${authoringUrl}/draft`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        python_source: aggregate.candidate.normalized_python_source,
        expected_draft_hash: aggregate.draft.draft_hash,
        expected_workflow_revision: aggregate.workflow_revision
      })
    }
  )
  if (!aggregate.candidate) {
    throw new Error(`Workflow ${workflowUuid} lost its Candidate before Apply`)
  }
  const applied = await readWorkflowEnvelope<{
    authoring: AuthoringAggregate
  }>(os, `${authoringUrl}/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ candidate_hash: aggregate.candidate.candidate_hash })
  })
  expect(applied.authoring.state).toBe('applied')
  return applied.authoring
}

/**
 * 把工作流任务（WorkflowTask）输入字段切换为显式值状态。
 *
 * @param form 任务输入表单定位器。
 * @param name 输入字段名称。
 * @returns 选择完成后的 Promise。
 */
export async function chooseExplicitValue(
  form: Locator,
  name: string
): Promise<void> {
  await form.getByRole('combobox', { name: `${name} 输入状态` })
    .selectOption('value')
}

/**
 * 从 SSE 响应读取匹配工作流创作失效事件。
 *
 * @param response SSE HTTP 响应。
 * @param workflowUuid 工作流稳定 UUID。
 * @param cause 期望事件原因。
 * @param matches 额外事件断言。
 * @returns 首个匹配的 SSE 事件。
 */
export async function readAuthoringEvent(
  response: Response,
  workflowUuid: string,
  cause: string,
  matches: (event: SseEvent) => boolean = () => true
): Promise<SseEvent> {
  if (!response.body) throw new Error('SSE response body is missing')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const deadline = Date.now() + 10_000
  try {
    while (Date.now() < deadline) {
      const chunk = await Promise.race([
        reader.read(),
        new Promise<never>((_resolve, reject) => {
          setTimeout(() => reject(new Error('SSE read timed out')), 10_000)
        })
      ])
      if (chunk.done) break
      buffer += decoder.decode(chunk.value, { stream: true })
      const frames = buffer.split(/\r?\n\r?\n/)
      buffer = frames.pop() || ''
      for (const frame of frames) {
        const event = parseSseFrame(frame)
        if (
          event.event === 'workflow.authoring.changed' &&
          event.data.workflow_uuid === workflowUuid &&
          event.data.cause === cause &&
          matches(event)
        ) return event
      }
    }
    throw new Error(`missing ${cause} Authoring SSE event`)
  } finally {
    await reader.cancel()
  }
}

/**
 * 解析单个 SSE 文本帧。
 *
 * @param frame 原始 SSE 帧。
 * @returns 结构化事件身份、类型与载荷。
 */
export function parseSseFrame(frame: string): SseEvent {
  const fields = new Map<string, string>()
  for (const line of frame.split(/\r?\n/)) {
    const separator = line.indexOf(':')
    if (separator < 0) continue
    fields.set(
      line.slice(0, separator),
      line.slice(separator + 1).trimStart()
    )
  }
  return {
    id: fields.get('id') || '',
    event: fields.get('event') || 'message',
    data: JSON.parse(fields.get('data') || '{}') as Record<string, unknown>
  }
}

/**
 * 统计指定方法和路径后缀的浏览器请求。
 *
 * @param requests 已捕获请求集合。
 * @param method HTTP 方法。
 * @param pathSuffix 路径后缀。
 * @returns 匹配请求数量。
 */
export function countRequests(
  requests: Array<{ method: string; url: string }>,
  method: string,
  pathSuffix: string
): number {
  return requests.filter((request) =>
    request.method === method &&
    new URL(request.url).pathname.endsWith(pathSuffix)
  ).length
}

/**
 * 返回指定方法和路径后缀的最后一个浏览器请求。
 *
 * @param requests 已捕获请求集合。
 * @param method HTTP 方法。
 * @param pathSuffix 路径后缀。
 * @returns 最后一个匹配请求；不存在时抛出错误。
 */
export function lastRequest(
  requests: Array<{ method: string; url: string; body: unknown }>,
  method: string,
  pathSuffix: string
): { method: string; url: string; body: unknown } {
  const found = [...requests].reverse().find((request) =>
    request.method === method &&
    new URL(request.url).pathname.endsWith(pathSuffix)
  )
  if (!found) throw new Error(`missing ${method} ${pathSuffix}`)
  return found
}

/**
 * 读取工作流图中持久化的工作流输入输出合同（WorkflowInputContract）。
 *
 * @param graph 已应用或候选工作流图。
 * @returns `workflow.meta_data.unilab` 投影。
 */
export function workflowIo(graph: AuthoringGraph): Record<string, unknown> {
  const metaData = graph.workflow.meta_data as Record<string, unknown>
  return (metaData.unilab ?? {}) as Record<string, unknown>
}

/**
 * 读取指定工作流节点（WorkflowNode）的输入绑定。
 *
 * @param graph 工作流图。
 * @param nodeUuid 工作流节点稳定 UUID。
 * @returns 节点输入绑定对象。
 */
export function nodeInputBindings(
  graph: AuthoringGraph,
  nodeUuid: string
): Record<string, unknown> {
  const node = graph.nodes.find(({ uuid }) => uuid === nodeUuid)
  if (!node) throw new Error(`Workflow Node ${nodeUuid} is missing`)
  const metaData = node.meta_data as Record<string, unknown>
  const unilab = metaData.unilab as Record<string, unknown>
  return unilab.input_bindings as Record<string, unknown>
}

/**
 * 规范化全部工作流节点（WorkflowNode）的输入绑定以便比较。
 *
 * @param graph 工作流图。
 * @returns 按节点 UUID 排序的输入绑定对象。
 */
export function allNodeInputBindings(
  graph: AuthoringGraph
): Record<string, unknown> {
  return Object.fromEntries(
    graph.nodes
      .map((node) => {
        const metaData = node.meta_data as Record<string, unknown> | undefined
        const unilab = metaData?.unilab as Record<string, unknown> | undefined
        return [String(node.uuid), unilab?.input_bindings ?? {}]
      })
      .sort(([left], [right]) => String(left).localeCompare(String(right)))
  )
}

const WORKFLOW_NODE_AUTHORING_FIELDS = [
  'uuid', 'workflow_node_template_uuid', 'parent_uuid', 'material_uuid',
  'name', 'status', 'type', 'icon', 'pose', 'param', 'footer', 'action_name',
  'action_type', 'execution_policy', 'disabled', 'minimized', 'script',
  'description', 'meta_data'
] as const

const WORKFLOW_EDGE_AUTHORING_FIELDS = [
  'uuid', 'source_node_uuid', 'target_node_uuid', 'source_handle_uuid',
  'target_handle_uuid', 'description', 'meta_data'
] as const

/**
 * 提取工作流图中影响创作语义的稳定字段。
 *
 * @param graph 工作流图。
 * @returns 按 UUID 排序的节点与边语义。
 */
export function graphAuthoringSemantics(
  graph: AuthoringGraph
): Record<string, unknown> {
  return {
    nodes: graph.nodes
      .map((node) => pickFields(node, WORKFLOW_NODE_AUTHORING_FIELDS))
      .sort(compareUuid),
    edges: graph.edges
      .map((edge) => pickFields(edge, WORKFLOW_EDGE_AUTHORING_FIELDS))
      .sort(compareUuid)
  }
}

/**
 * 从记录中选取给定字段集合。
 *
 * @param value 原始记录。
 * @param fields 需要保留的字段。
 * @returns 只包含指定字段的新记录。
 */
export function pickFields(
  value: Record<string, unknown>,
  fields: readonly string[]
): Record<string, unknown> {
  return Object.fromEntries(fields.map((field) => [field, value[field]]))
}

/**
 * 按 UUID 对工作流创作记录排序。
 *
 * @param left 左侧记录。
 * @param right 右侧记录。
 * @returns 字符串 UUID 比较结果。
 */
export function compareUuid(
  left: Record<string, unknown>,
  right: Record<string, unknown>
): number {
  return String(left.uuid).localeCompare(String(right.uuid))
}

/**
 * 查找工作流节点（WorkflowNode）唯一句柄 UUID。
 *
 * @param graph 工作流图。
 * @param nodeUuid 工作流节点 UUID。
 * @param handleKey 句柄键。
 * @param ioType 句柄输入输出方向。
 * @returns 唯一句柄 UUID；匹配数量异常时抛出错误。
 */
export function requireHandleUuid(
  graph: AuthoringGraph,
  nodeUuid: string,
  handleKey: string,
  ioType: 'source' | 'target'
): string {
  const node = graph.nodes.find(({ uuid }) => uuid === nodeUuid)
  if (!node) throw new Error(`Workflow Node ${nodeUuid} is missing`)
  const templateUuid = String(node.workflow_node_template_uuid || '')
  const matches = graph.handle_templates.filter((handle) =>
    handle.workflow_node_template_uuid === templateUuid &&
    handle.handle_key === handleKey &&
    handle.io_type === ioType
  )
  if (matches.length !== 1 || typeof matches[0]?.uuid !== 'string') {
    throw new Error(
      `Expected one ${ioType} Handle ${handleKey} owned by ${nodeUuid}`
    )
  }
  return matches[0].uuid
}

/**
 * 通过真实鼠标事件拖动工作流节点（WorkflowNode）。
 *
 * @param page Playwright 浏览器页面。
 * @param node 工作流节点定位器。
 * @param deltaX 水平位移。
 * @param deltaY 垂直位移。
 * @returns 拖动结束后的 Promise。
 */
export async function dragNode(
  page: Page,
  node: Locator,
  deltaX: number,
  deltaY: number
): Promise<void> {
  const box = await node.boundingBox()
  if (!box) throw new Error('workflow node has no bounding box')
  const startX = box.x + box.width / 2
  const startY = box.y + box.height / 2
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX + deltaX, startY + deltaY, { steps: 5 })
  await page.mouse.up()
}

/**
 * 在 React Flow 小地图之外点击工作流节点（WorkflowNode）。
 *
 * @param page Playwright 浏览器页面。
 * @param node 工作流节点定位器。
 * @returns 可交互点点击完成后的 Promise。
 */
export async function clickNodeOutsideMiniMap(
  page: Page,
  node: Locator
): Promise<void> {
  const nodeBox = await node.boundingBox()
  if (!nodeBox) throw new Error('workflow node has no bounding box')
  const visibleMiniMaps = page.locator('.react-flow__minimap:visible')
  const miniMapBox = await visibleMiniMaps.count() > 0
    ? await visibleMiniMaps.first().boundingBox()
    : null
  const inset = Math.min(12, nodeBox.width / 4, nodeBox.height / 4)
  const candidates = [
    { x: nodeBox.width / 2, y: nodeBox.height / 2 },
    { x: nodeBox.width / 4, y: nodeBox.height / 2 },
    { x: (nodeBox.width * 3) / 4, y: nodeBox.height / 2 },
    { x: nodeBox.width / 2, y: nodeBox.height / 4 },
    { x: nodeBox.width / 2, y: (nodeBox.height * 3) / 4 },
    { x: inset, y: inset },
    { x: nodeBox.width - inset, y: inset },
    { x: inset, y: nodeBox.height - inset },
    { x: nodeBox.width - inset, y: nodeBox.height - inset }
  ]
  const clickPoint = candidates.find(({ x, y }) => {
    if (!miniMapBox) return true
    const pageX = nodeBox.x + x
    const pageY = nodeBox.y + y
    return !(
      pageX >= miniMapBox.x &&
      pageX <= miniMapBox.x + miniMapBox.width &&
      pageY >= miniMapBox.y &&
      pageY <= miniMapBox.y + miniMapBox.height
    )
  })

  expect(
    clickPoint,
    'Workflow node must expose a pointer target outside the ReactFlow MiniMap'
  ).toBeDefined()
  if (!clickPoint) throw new Error('workflow node is fully covered by the MiniMap')
  await node.click({ position: clickPoint })
}
