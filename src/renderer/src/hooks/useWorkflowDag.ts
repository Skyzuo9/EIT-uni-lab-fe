/**
 * ============================================================
 * AI-GENERATED CODE METADATA
 * ============================================================
 * Model: Claude Opus 4.8
 * Generation Date: 2026-07-22
 * Prompt Summary: 将解析出的工作流拓扑转为 ReactFlow 节点/边(自定义节点卡片)
 * Context: 工作流 DAG 视图数据源,分层布局 + 大 web 风格节点类型分色
 * Human Review Status: [ ] Pending  [ ] Reviewed  [ ] Approved
 * ============================================================
 */
import { useMemo } from 'react'
import type { Edge, Node } from 'reactflow'
import { layoutDag } from '../utils/dagLayout'
import { getNodeColor } from '../utils/nodeColors'
import type { WorkflowLink, WorkflowNode } from '../utils/parseWorkflow'
import type { WorkflowNodeData } from '../components/workflow/WorkflowNodeCard'

interface UseWorkflowDagResult {
  nodes: Node<WorkflowNodeData>[]
  edges: Edge[]
}

// 通信连接用虚线,物理连接用实线
const COMM_EDGE_TYPE = 'communication'

// 连接线统一颜色
const EDGE_COLOR = '#BB78A9'

// 将工作流 nodes/links 转为 ReactFlow 可渲染的自定义节点与边
export function useWorkflowDag(nodes: WorkflowNode[], links: WorkflowLink[]): UseWorkflowDagResult {
  return useMemo(() => {
    const { nodes: laidOut, links: edges } = layoutDag(nodes, links)

    const flowNodes: Node<WorkflowNodeData>[] = laidOut.map((node) => ({
      id: node.id,
      type: 'wfNode',
      position: { x: node.x, y: node.y },
      data: {
        id: node.id,
        name: node.name,
        color: getNodeColor(node.labNodeType, node.type)
      }
    }))

    // 上下流向:平滑贝塞尔曲线,统一线色(通信边虚线)
    const flowEdges: Edge[] = edges.map((link, index) => {
      const isComm = link.type === COMM_EDGE_TYPE
      return {
        id: `e-${link.source}-${link.target}-${index}`,
        source: link.source,
        target: link.target,
        type: 'default',
        animated: isComm,
        style: {
          stroke: EDGE_COLOR,
          strokeWidth: 2,
          strokeDasharray: isComm ? '4 4' : undefined
        }
      }
    })

    return { nodes: flowNodes, edges: flowEdges }
  }, [nodes, links])
}
