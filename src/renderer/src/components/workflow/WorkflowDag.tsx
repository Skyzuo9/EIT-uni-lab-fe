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
import { useWorkflowDag } from '../../hooks/useWorkflowDag'
import WorkflowNodeCard from './WorkflowNodeCard'
import type { WorkflowNodeData } from './WorkflowNodeCard'
import type { WorkflowLink, WorkflowNode } from '../../utils/parseWorkflow'
import 'reactflow/dist/style.css'

interface WorkflowDagProps {
  nodes: WorkflowNode[]
  links: WorkflowLink[]
  onNodeSelect: (nodeId: string) => void
}

// 注册自定义节点类型(在组件外定义,避免每次渲染重建)
const nodeTypes = { wfNode: WorkflowNodeCard }

// 拓扑 DAG:只读展示,支持缩放/平移/minimap,节点为大 web 风格卡片
export default function WorkflowDag({ nodes, links, onNodeSelect }: WorkflowDagProps): JSX.Element {
  const { nodes: flowNodes, edges: flowEdges } = useWorkflowDag(nodes, links)

  if (flowNodes.length === 0) {
    return <p className="section__hint">当前 JSON 未定义 nodes,无法生成拓扑图</p>
  }

  return (
    <div className="wf-dag">
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        fitView
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_event, node: Node<WorkflowNodeData>) => onNodeSelect(node.id)}
      >
        <Background gap={16} color="#eef0f2" />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable nodeColor={(node) => node.data?.color ?? '#94A3B8'} />
      </ReactFlow>
    </div>
  )
}
