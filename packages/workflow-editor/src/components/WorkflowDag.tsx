/**
 * ============================================================
 * AI-GENERATED CODE METADATA
 * ============================================================
 * Model: Claude Opus 4.8
 * Generation Date: 2026-07-22
 * Prompt Summary: ReactFlow DAG 拓扑视图(节点分色 + 有向边 + 控件)
 * Context: 工作流方向拓扑连接图展示
 * Human Review Status: [ ] Pending  [ ] Reviewed  [ ] Approved
 * ============================================================
 */
import ReactFlow, { Background, Controls, MiniMap } from 'reactflow'
import type { Node } from 'reactflow'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useWorkflowDag } from '../hooks/useWorkflowDag'
import WorkflowNodeCard from './WorkflowNodeCard'
import type { WorkflowNodeData } from './WorkflowNodeCard'
import type { WorkflowLink, WorkflowNode } from '../utils/parseWorkflow'
import { projectNestedWorkflow } from '../utils/canonicalWorkflow'
import 'reactflow/dist/style.css'
import styles from './vendor.module.scss'

interface WorkflowDagProps {
  nodes: WorkflowNode[]
  links: WorkflowLink[]
  onNodeSelect: (nodeId: string) => void
  onSetStart?: (nodeId: string) => void
  onToggleBreakpoint?: (nodeId: string) => void
  nodeStates?: Readonly<Record<string, string>>
  breakpoints?: ReadonlySet<string>
  startNodeId?: string | null
  beforeStartNodeIds?: ReadonlySet<string>
  pausedBeforeNodeId?: string | null
}

// 注册自定义节点类型(在组件外定义,避免每次渲染重建)
const nodeTypes = { wfNode: WorkflowNodeCard }

// 拓扑 DAG:只读展示,支持缩放/平移/minimap,节点为大 web 风格卡片
export default function WorkflowDag({
  nodes,
  links,
  onNodeSelect,
  onSetStart,
  onToggleBreakpoint,
  nodeStates = {},
  breakpoints = new Set(),
  startNodeId = null,
  beforeStartNodeIds = new Set(),
  pausedBeforeNodeId = null
}: WorkflowDagProps): React.JSX.Element {
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(
    () => new Set()
  )
  const groupSignature = useMemo(
    () => nodes
      .filter((node) => node.groupKind === 'subworkflow')
      .map((node) => `${node.id}:${node.descendantNodeIds?.length || 0}`)
      .join('|'),
    [nodes]
  )
  useEffect(() => {
    setExpandedGroupIds(new Set())
  }, [groupSignature])
  const nestedProjection = useMemo(
    () => projectNestedWorkflow(nodes, links, expandedGroupIds),
    [expandedGroupIds, links, nodes]
  )
  const toggleGroup = useCallback((nodeId: string) => {
    setExpandedGroupIds((current) => {
      const next = new Set(current)
      if (next.has(nodeId)) next.delete(nodeId)
      else next.add(nodeId)
      return next
    })
  }, [])
  const { nodes: flowNodes, edges: flowEdges, onNodesChange, onEdgesChange } = useWorkflowDag(
    nestedProjection.nodes,
    nestedProjection.links
  )
  const nodeById = useMemo(
    () => new Map(nodes.map((node) => [node.id, node])),
    [nodes]
  )
  const runtimeNodes = useMemo(
    () => flowNodes.map((node) => {
      const sourceNode = nodeById.get(node.id)
      const status = sourceNode?.groupKind === 'subworkflow'
        ? nestedGroupStatus(sourceNode, nodeStates)
        : nodeStates[node.id] || 'pending'
      const beforeStart = beforeStartNodeIds.has(node.id)
      const pausedBefore = pausedBeforeNodeId === node.id
      const startNode = startNodeId === node.id
      return {
        ...node,
        className: [
          node.className,
          `wf-flow-node--${status}`,
          beforeStart ? 'wf-flow-node--before-start' : '',
          startNode ? 'wf-flow-node--start' : '',
          pausedBefore ? 'wf-flow-node--paused-before' : '',
          breakpoints.has(node.id) ? 'wf-flow-node--breakpoint' : '',
          sourceNode?.groupKind === 'subworkflow'
            ? 'wf-flow-node--subworkflow'
            : ''
        ].filter(Boolean).join(' '),
        data: {
          ...node.data,
          color: beforeStart
            ? '#cbd5e1'
            : status === 'success'
              ? '#20c997'
              : status === 'running'
                ? '#f59f00'
                : pausedBefore
                  ? '#3b82f6'
                  : '#94a3b8',
          status,
          breakpoint: breakpoints.has(node.id),
          startNode,
          beforeStart,
          pausedBefore,
          groupExpanded: expandedGroupIds.has(node.id),
          onToggleGroup: toggleGroup,
          onSetStart,
          onToggleBreakpoint
        }
      }
    }),
    [
      beforeStartNodeIds,
      breakpoints,
      flowNodes,
      expandedGroupIds,
      nodeById,
      nodeStates,
      onSetStart,
      onToggleBreakpoint,
      pausedBeforeNodeId,
      startNodeId,
      toggleGroup
    ]
  )
  const runtimeEdges = useMemo(
    () => flowEdges.map((edge) => ({
      ...edge,
      className: [
        edge.className,
        beforeStartNodeIds.has(edge.source) ||
        beforeStartNodeIds.has(edge.target)
          ? 'wf-flow-edge--before-start'
          : ''
      ].filter(Boolean).join(' ')
    })),
    [beforeStartNodeIds, flowEdges]
  )

  if (flowNodes.length === 0) {
    return <p className="px-3.5 py-3 text-xs text-[#9ca3af]">当前 JSON 未定义 nodes,无法生成拓扑图</p>
  }

  return (
    <div className={styles.dag}>
      <ReactFlow
        nodes={runtimeNodes}
        edges={runtimeEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_event, node: Node<WorkflowNodeData>) => onNodeSelect(node.id)}
        onNodeContextMenu={(event, node: Node<WorkflowNodeData>) => {
          event.preventDefault()
          onSetStart?.(node.id)
        }}
        onNodeDoubleClick={(_event, node: Node<WorkflowNodeData>) =>
          onToggleBreakpoint?.(node.id)
        }
      >
        <Background gap={16} color="#eef0f2" />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable nodeColor={(node) => node.data?.color ?? '#94A3B8'} />
      </ReactFlow>
    </div>
  )
}

function nestedGroupStatus(
  node: WorkflowNode,
  nodeStates: Readonly<Record<string, string>>
): string {
  const statuses = [node.id, ...(node.descendantNodeIds || [])]
    .map((nodeId) => nodeStates[nodeId])
    .filter((status): status is string => Boolean(status))
  if (statuses.includes('failed')) return 'failed'
  if (statuses.includes('reconciling')) return 'reconciling'
  if (statuses.includes('running')) return 'running'
  if (statuses.includes('cancelled')) return 'cancelled'
  if (
    statuses.length > 0 &&
    statuses.every((status) => ['success', 'skipped'].includes(status))
  ) {
    return 'success'
  }
  return nodeStates[node.id] || 'pending'
}
