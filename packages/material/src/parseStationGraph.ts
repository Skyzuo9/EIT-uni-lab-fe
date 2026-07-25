/** [AI] Model: Claude Opus 4.8 | 2026-07-25 | 解析工作站 node-link JSON 文本为 StationGraph */
import type { StationGraph, StationLink, StationNode } from './stationGraph'

interface ParseResult {
  graph: StationGraph | null
  error: string | null
}

// 将 station JSON 文本解析为 StationGraph;失败时返回错误信息
export function parseStationGraphJson(text: string): ParseResult {
  try {
    const doc: unknown = JSON.parse(text)
    if (!doc || typeof doc !== 'object') {
      return { graph: null, error: 'JSON 内容为空或格式不正确' }
    }
    const record = doc as Record<string, unknown>
    if (!Array.isArray(record.nodes)) {
      return { graph: null, error: '缺少 nodes 数组' }
    }
    const nodes = record.nodes.map(mapNode)
    const links = Array.isArray(record.links) ? record.links.map(mapLink) : []
    return { graph: { nodes, links }, error: null }
  } catch (error) {
    return { graph: null, error: error instanceof Error ? error.message : 'JSON 解析失败' }
  }
}

// 解析单个节点
function mapNode(raw: unknown): StationNode {
  const record = asRecord(raw)
  const parent = record.parent
  return {
    id: asString(record.id),
    name: asString(record.name) || asString(record.id),
    children: asArray(record.children).map(asString),
    parent: parent == null ? null : asString(parent),
    type: asString(record.type),
    class: asString(record.class),
    position: mapPosition(record.position),
    config: isRecord(record.config) ? record.config : undefined,
    data: isRecord(record.data) ? record.data : undefined
  }
}

// 解析单条连接
function mapLink(raw: unknown): StationLink {
  const record = asRecord(raw)
  const port = record.port
  return {
    id: asString(record.id),
    source: asString(record.source),
    target: asString(record.target),
    type: asString(record.type),
    port: isRecord(port) ? mapPort(port) : undefined
  }
}

// 端口映射统一转为字符串值
function mapPort(record: Record<string, unknown>): Record<string, string> {
  return Object.entries(record).reduce<Record<string, string>>((acc, [key, value]) => {
    acc[key] = asString(value)
    return acc
  }, {})
}

function mapPosition(value: unknown): StationNode['position'] {
  if (!isRecord(value)) return undefined
  return { x: asNumber(value.x), y: asNumber(value.y), z: asNumber(value.z) }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function asString(value: unknown): string {
  return value == null ? '' : String(value)
}

function asNumber(value: unknown): number {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}
