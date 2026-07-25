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
import { useMemo } from 'react'
import { useWorkflowDag } from '../hooks/useWorkflowDag'
import WorkflowNodeCard from './WorkflowNodeCard'
import type { WorkflowNodeData } from './WorkflowNodeCard'
import type { WorkflowLink, WorkflowNode } from '../utils/parseWorkflow'
import 'reactflow/dist/style.css'
import styles from './vendor.module.scss'

interface WorkflowDagProps {
  nodes: WorkflowNode[]
  links: WorkflowLink[]
  onNodeSelect: (nodeId: string) => void
  onToggleBreakpoint?: (nodeId: string) => void
  nodeStates?: Readonly<Record<string, string>>
  breakpoints?: ReadonlySet<string>
}

// 注册自定义节点类型(在组件外定义,避免每次渲染重建)
const nodeTypes = { wfNode: WorkflowNodeCard }

// 拓扑 DAG:只读展示,支持缩放/平移/minimap,节点为大 web 风格卡片
export default function WorkflowDag({
  nodes,
  links,
  onNodeSelect,
  onToggleBreakpoint,
  nodeStates = {},
  breakpoints = new Set()
}: WorkflowDagProps): React.JSX.Element {
  const { nodes: flowNodes, edges: flowEdges, onNodesChange, onEdgesChange } = useWorkflowDag(
    nodes,
    links
  )
  const runtimeNodes = useMemo(
    () => flowNodes.map((node) => ({
      ...node,
      className: [
        node.className,
        `wf-flow-node--${nodeStates[node.id] || 'pending'}`,
        breakpoints.has(node.id) ? 'wf-flow-node--breakpoint' : ''
      ].filter(Boolean).join(' '),
      data: {
        ...node.data,
        status: nodeStates[node.id] || 'pending',
        breakpoint: breakpoints.has(node.id)
      }
    })),
    [breakpoints, flowNodes, nodeStates]
  )

  if (flowNodes.length === 0) {
    return <p className="px-3.5 py-3 text-xs text-[#9ca3af]">当前 JSON 未定义 nodes,无法生成拓扑图</p>
  }

  return (
    <div className={styles.dag}>
      <ReactFlow
        nodes={runtimeNodes}
        edges={flowEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_event, node: Node<WorkflowNodeData>) => onNodeSelect(node.id)}
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
