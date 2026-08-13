/**
 * ============================================================
 * AI-GENERATED CODE METADATA
 * ============================================================
 * Model: Claude Opus 4.8
 * Generation Date: 2026-07-22
 * Prompt Summary: 工作流节点类型语义色(对齐大 web NODE_TYPE_COLORS)
 * Context: DAG 节点分色,按 lab_node_type / type 归一到语义色
 * Human Review Status: [ ] Pending  [ ] Reviewed  [ ] Approved
 * ============================================================
 */

// 语义类型 -> 主题色(与大 web NODE_TYPE_COLORS 完全一致)
const NODE_TYPE_COLORS: Record<string, string> = {
  Sample: '#3B82F6', // 蓝
  Labware: '#10B981', // 绿
  Reagent: '#6B7280', // 灰
  Transport: '#F59E0B', // 黄
  Device: '#8B5CF6' // 紫
}

// 无语义类型时的兜底色(对齐大 web slate-400)
const DEFAULT_NODE_COLOR = '#94A3B8'

// 结构解析的 type -> 语义类型的兜底映射(未显式声明 lab_node_type 时)
const TYPE_FALLBACK: Record<string, string> = {
  device: 'Device',
  plate: 'Labware',
  tip_rack: 'Labware',
  reservoir: 'Reagent',
  tube_rack: 'Sample'
}

// 依据语义类型与结构类型取主题色
export function getNodeColor(labNodeType: string, type: string): string {
  if (labNodeType && NODE_TYPE_COLORS[labNodeType]) return NODE_TYPE_COLORS[labNodeType]
  const fallback = TYPE_FALLBACK[type]
  if (fallback && NODE_TYPE_COLORS[fallback]) return NODE_TYPE_COLORS[fallback]
  return DEFAULT_NODE_COLOR
}
