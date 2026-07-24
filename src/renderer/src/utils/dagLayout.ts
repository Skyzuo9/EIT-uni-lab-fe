/**
 * ============================================================
 * AI-GENERATED CODE METADATA
 * ============================================================
 * Model: Claude Opus 4.8
 * Generation Date: 2026-07-22
 * Prompt Summary: DAG 分层布局(longest-path layering + 层内排序),输出 ReactFlow 坐标
 * Context: 工作流拓扑图 nodes/links -> 有向图布局,从上到下分层
 * Human Review Status: [ ] Pending  [ ] Reviewed  [ ] Approved
 * ============================================================
 */
import type { WorkflowLink, WorkflowNode } from './parseWorkflow'

// 布局后的节点(带坐标)
export interface LayoutNode extends WorkflowNode {
  x: number
  y: number
}

export interface LayoutResult {
  nodes: LayoutNode[]
  links: WorkflowLink[]
}

// 层间垂直间距、层内水平间距(与 ReactFlow 节点尺寸匹配)
const LAYER_GAP_Y = 140
const NODE_GAP_X = 240
const ORIGIN_X = 40
const ORIGIN_Y = 40

// 对 nodes/links 做从上到下的分层布局
export function layoutDag(nodes: WorkflowNode[], links: WorkflowLink[]): LayoutResult {
  if (nodes.length === 0) return { nodes: [], links }

  const validIds = new Set(nodes.map((node) => node.id))
  const edges = links.filter((link) => validIds.has(link.source) && validIds.has(link.target))

  // 若所有节点已携带显式坐标(如 JSON 导出格式),直接沿用,不再自动分层
  if (nodes.every((node) => typeof node.x === 'number' && typeof node.y === 'number')) {
    const laidOut = nodes.map((node) => ({ ...node, x: node.x as number, y: node.y as number }))
    return { nodes: laidOut, links: edges }
  }
  const layerOf = assignLayers(nodes, edges)

  // 按层分组,层内保持节点原始顺序
  const byLayer = new Map<number, WorkflowNode[]>()
  nodes.forEach((node) => {
    const layer = layerOf.get(node.id) ?? 0
    const bucket = byLayer.get(layer) ?? []
    bucket.push(node)
    byLayer.set(layer, bucket)
  })

  const layoutNodes: LayoutNode[] = []
  byLayer.forEach((bucket, layer) => {
    bucket.forEach((node, indexInLayer) => {
      layoutNodes.push({
        ...node,
        x: ORIGIN_X + indexInLayer * NODE_GAP_X,
        y: ORIGIN_Y + layer * LAYER_GAP_Y
      })
    })
  })

  return { nodes: layoutNodes, links: edges }
}

// 用最长路径法为每个节点分层:layer(n) = max(layer(前驱)) + 1
function assignLayers(nodes: WorkflowNode[], edges: WorkflowLink[]): Map<string, number> {
  const incoming = new Map<string, string[]>()
  const outgoing = new Map<string, string[]>()
  nodes.forEach((node) => {
    incoming.set(node.id, [])
    outgoing.set(node.id, [])
  })
  edges.forEach((edge) => {
    outgoing.get(edge.source)?.push(edge.target)
    incoming.get(edge.target)?.push(edge.source)
  })

  const layer = new Map<string, number>()
  const visiting = new Set<string>()

  // 递归求某节点所在层;visiting 集合防止环导致的无限递归
  const resolve = (id: string): number => {
    const cached = layer.get(id)
    if (cached != null) return cached
    if (visiting.has(id)) return 0
    visiting.add(id)
    const preds = incoming.get(id) ?? []
    const value = preds.length === 0 ? 0 : Math.max(...preds.map(resolve)) + 1
    visiting.delete(id)
    layer.set(id, value)
    return value
  }

  nodes.forEach((node) => resolve(node.id))
  return layer
}
