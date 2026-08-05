import { useEffect, useMemo } from 'react'
import type { Edge, Node, OnNodesChange, OnEdgesChange } from 'reactflow'
import { MarkerType, Position, useNodesState, useEdgesState } from 'reactflow'

import type { WorkflowNodeData } from '../components/WorkflowNodeCard'
import { isReadyHandle } from '../components/WorkflowNodeCard'
import type { WorkflowRoundedStepEdgeData } from '../components/WorkflowRoundedStepEdge'
import { layoutDag, type LayoutResult } from '../utils/dagLayout'
import { getNodeColor } from '../utils/nodeColors'
import type { WorkflowLink, WorkflowNode } from '../utils/parseWorkflow'
import { layoutVisibleWorkflowDag } from '../utils/workflowDagLayout'
import {
  materialTraceAccent,
  projectMaterialTraces
} from '../utils/workflowMaterialTrace'

interface UseWorkflowDagResult {
  nodes: Node<WorkflowNodeData>[]
  edges: Edge<WorkflowRoundedStepEdgeData>[]
  onNodesChange: OnNodesChange
  onEdgesChange: OnEdgesChange
}

interface WorkflowFlowElements {
  flowNodes: Node<WorkflowNodeData>[]
  flowEdges: Edge<WorkflowRoundedStepEdgeData>[]
}

const COMM_EDGE_TYPE = 'communication'
const STRUCTURAL_EDGE_COLOR = 'var(--unilab-color-text-subtle)'

/**
 * 将当前可见工作流（Workflow）投影为可交互的 ReactFlow 节点和正交边。
 *
 * @param nodes 已折叠组合工作流后的全部可见节点。
 * @param links 已重接端点的控制边与物料流（MaterialFlow）边。
 * @returns ReactFlow 状态以及节点、边变更入口。
 */
export function useWorkflowDag(
  nodes: WorkflowNode[],
  links: WorkflowLink[]
): UseWorkflowDagResult {
  const fallback = useMemo(
    () => buildFlowElements(
      layoutDag(nodes, links, { preserveExistingPositions: false }),
      nodes,
      links
    ),
    [nodes, links]
  )
  const [flowNodes, setNodes, onNodesChange] = useNodesState(
    fallback.flowNodes
  )
  const [flowEdges, setEdges, onEdgesChange] = useEdgesState(
    fallback.flowEdges
  )

  useEffect(() => {
    setNodes(fallback.flowNodes)
    setEdges(fallback.flowEdges)
  }, [fallback, setEdges, setNodes])

  useEffect(() => {
    let cancelled = false
    void layoutVisibleWorkflowDag(nodes, links).then((layout) => {
      if (cancelled) return
      const elements = buildFlowElements(layout, nodes, links)
      setNodes(elements.flowNodes)
      setEdges(elements.flowEdges)
    }).catch(() => {
      // ELK 不可用时保留已通过碰撞检测的同步分层布局。
    })
    return () => {
      cancelled = true
    }
  }, [links, nodes, setEdges, setNodes])

  return {
    nodes: flowNodes,
    edges: flowEdges,
    onNodesChange,
    onEdgesChange
  }
}

/**
 * 将布局结果补充为带物料颜色、ready 语义和圆角正交路由的画布元素。
 *
 * @param layout 当前可见图的节点坐标与有效边。
 * @param sourceNodes 用于查询句柄、物料颜色和节点展示信息的源节点。
 * @param sourceLinks 用于计算物料流（MaterialFlow）追踪颜色的源边。
 * @returns 可直接交给 ReactFlow 的节点与边。
 */
function buildFlowElements(
  layout: LayoutResult,
  sourceNodes: readonly WorkflowNode[],
  sourceLinks: readonly WorkflowLink[]
): WorkflowFlowElements {
  const materialTraces = projectMaterialTraces(sourceNodes, sourceLinks)
  const nodeNames = new Map(sourceNodes.map((node) => [node.id, node.name]))
  const handleByUuid = new Map(
    sourceNodes.flatMap((node) =>
      (node.handles ?? []).map((handle) => [handle.uuid, handle] as const)
    )
  )
  const flowNodes: Node<WorkflowNodeData>[] = layout.nodes.map((node) => ({
    id: node.id,
    type: 'wfNode',
    focusable: node.groupKind !== 'subworkflow',
    position: { x: node.x, y: node.y },
    targetPosition: Position.Top,
    sourcePosition: Position.Bottom,
    data: {
      id: node.id,
      name: node.name,
      color: getNodeColor(node.labNodeType, node.type),
      kind: node.type,
      groupKind: node.groupKind,
      descendantCount: node.descendantNodeIds?.length,
      handles: node.handles,
      materialSource: node.materialSource,
      traceAccent: node.type === 'material_source'
        ? materialTraces.materialSourceAccents.get(node.id) ??
          materialTraceAccent(node.id)
        : undefined,
      materialHandleAccents: Object.fromEntries(
        materialTraces.handleAccentsByNode.get(node.id) ?? []
      ),
      materialChips: materialTraces.chipsByNode.get(node.id) ?? []
    }
  }))

  const flowEdges: Edge<WorkflowRoundedStepEdgeData>[] = layout.links.map(
    (link, index) => {
      const communication = link.type === COMM_EDGE_TYPE
      const materialAccent = materialTraces.edgeAccents.get(index)
      const ready = !materialAccent && [
        link.sourceHandleUuid,
        link.targetHandleUuid
      ].some((uuid) => {
        const handle = uuid ? handleByUuid.get(uuid) : undefined
        return handle ? isReadyHandle(handle) : false
      })
      const sourceName = nodeNames.get(link.source) ?? link.source
      const targetName = nodeNames.get(link.target) ?? link.target
      return {
        id: `e-${link.source}-${link.target}-${index}`,
        source: link.source,
        target: link.target,
        sourceHandle: link.sourceHandleUuid || undefined,
        targetHandle: link.targetHandleUuid || undefined,
        label: link.branch
          ? (link.branch === 'true' ? 'TRUE' : 'FALSE')
          : undefined,
        labelStyle: {
          fill: link.branch === 'true'
            ? 'var(--unilab-color-success)'
            : 'var(--unilab-color-danger)',
          fontSize: 10,
          fontWeight: 700
        },
        type: 'workflowRoundedStep',
        data: { direction: 'TB', borderRadius: 8 },
        animated: communication || Boolean(materialAccent),
        markerEnd: materialAccent
          ? {
              type: MarkerType.ArrowClosed,
              color: materialAccent,
              width: 14,
              height: 14
            }
          : undefined,
        ariaLabel: materialAccent
          ? `物料流：${sourceName} 到 ${targetName}`
          : ready
            ? `执行顺序：${sourceName} 到 ${targetName}`
            : undefined,
        style: {
          stroke: materialAccent ?? STRUCTURAL_EDGE_COLOR,
          strokeWidth: materialAccent ? 2.4 : 1.5,
          strokeDasharray: communication && !materialAccent ? '4 4' : undefined
        },
        className: materialAccent
          ? 'wf-flow-edge--material-trace'
          : ready
            ? 'wf-flow-edge--ready'
            : undefined
      }
    }
  )

  return { flowNodes, flowEdges }
}
