/**
 * ============================================================
 * AI-GENERATED CODE METADATA
 * ============================================================
 * Model: GPT-5
 * Generation Date: 2026-07-30
 * Prompt Summary: Temporarily make the workflow ReactFlow canvas read-only.
 * Context: Preserve selection and measurement changes without mutating workflow topology.
 * Human Review Status: [ ] Pending  [ ] Reviewed  [ ] Approved
 * ============================================================
 */
import type { EdgeChange, NodeChange } from 'reactflow'

export const READ_ONLY_WORKFLOW_CANVAS = {
  nodesDraggable: false,
  nodesConnectable: false,
  edgesUpdatable: false,
  deleteKeyCode: null,
  connectOnClick: false
} as const

const ALLOWED_NODE_CHANGE_TYPES = new Set<NodeChange['type']>([
  'dimensions',
  'select'
])

/**
 * ReactFlow still needs measurement and selection updates in read-only mode.
 * Position, add, remove and reset changes are deliberately ignored.
 */
export function visibleReadOnlyNodeChanges(
  changes: readonly NodeChange[]
): NodeChange[] {
  return changes.filter((change) => ALLOWED_NODE_CHANGE_TYPES.has(change.type))
}

export function visibleReadOnlyEdgeChanges(
  changes: readonly EdgeChange[]
): EdgeChange[] {
  return changes.filter((change) => change.type === 'select')
}
