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
import ReactFlow, {
  Background,
  Controls,
  MiniMap
} from 'reactflow'
import type {
  Connection,
  EdgeChange,
  Node,
  NodeChange,
  ReactFlowInstance
} from 'reactflow'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import { useWorkflowDag } from '../hooks/useWorkflowDag'
import WorkflowNodeCard from './WorkflowNodeCard'
import WorkflowRoundedStepEdge from './WorkflowRoundedStepEdge'
import { WorkflowDagLayoutTools } from './WorkflowDagLayoutTools'
import {
  isWorkflowTextEditingTarget,
  nestedWorkflowGroupStatus
} from './workflowDagViewModel'
import type { WorkflowDagProps } from './workflowDagTypes'
import type { WorkflowNodeData } from './WorkflowNodeCard'
import { projectNestedWorkflow } from '../utils/canonicalWorkflow'
import {
  DEFAULT_WORKFLOW_DAG_LAYOUT_STRATEGY,
  DEFAULT_WORKFLOW_MATERIAL_SWIMLANE_DIRECTION,
  type WorkflowDagLayoutStrategy,
  type WorkflowMaterialSwimlaneDirection
} from '../utils/workflowDagLayoutStrategy'
import {
  CANVAS_EDIT_WORKFLOW_CANVAS,
  READ_ONLY_WORKFLOW_CANVAS,
  visibleReadOnlyEdgeChanges,
  visibleReadOnlyNodeChanges
} from '../utils/workflowCanvasPolicy'
import 'reactflow/dist/style.css'
import styles from './workflow.module.scss'

// 注册自定义节点类型(在组件外定义,避免每次渲染重建)
const nodeTypes = { wfNode: WorkflowNodeCard }
const edgeTypes = { workflowRoundedStep: WorkflowRoundedStepEdge }

/**
 * 渲染工作流拓扑、运行状态、物料流句柄及可选的画布编辑控制。
 *
 * @param props 工作流节点、边、状态、编辑能力与布局回调。
 * @returns 可缩放、可适配且遵守当前画布权限的 ReactFlow 视图。
 */
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
  pausedBeforeNodeId = null,
  canBeautify = true,
  beautifyDisabledReason = '请先完成当前 Python 编译',
  onBeautify,
  canvasMutationEnabled = false,
  nodePositionMutationEnabled = false,
  onNodePositionChange,
  onConnectHandles,
  onDeleteRequest
}: WorkflowDagProps): React.JSX.Element {
  const [isBeautifying, setIsBeautifying] = useState(false)
  const [layoutStrategy, setLayoutStrategy] =
    useState<WorkflowDagLayoutStrategy>(
      DEFAULT_WORKFLOW_DAG_LAYOUT_STRATEGY
    )
  const [swimlaneDirection, setSwimlaneDirection] =
    useState<WorkflowMaterialSwimlaneDirection>(
      DEFAULT_WORKFLOW_MATERIAL_SWIMLANE_DIRECTION
    )
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(
    () => new Set()
  )
  const containerRef = useRef<HTMLDivElement | null>(null)
  const flowInstanceRef = useRef<ReactFlowInstance | null>(null)
  const beautifyTimerRef = useRef<
    ReturnType<typeof globalThis.setTimeout> | null
  >(null)
  const groupSignature = useMemo(
    () => nodes
      .filter((node) => node.groupKind === 'subworkflow')
      .map((node) => `${node.id}:${node.compositeSignature || ''}`)
      .join('|'),
    [nodes]
  )
  useEffect(() => {
    setExpandedGroupIds(new Set())
  }, [groupSignature])
  useEffect(
    () => () => {
      if (beautifyTimerRef.current !== null) {
        globalThis.clearTimeout(beautifyTimerRef.current)
      }
    },
    []
  )
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
    nestedProjection.links,
    layoutStrategy,
    swimlaneDirection
  )
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const visibleChanges = nodePositionMutationEnabled
        ? changes
        : visibleReadOnlyNodeChanges(changes)
      if (visibleChanges.length > 0) onNodesChange(visibleChanges)
    },
    [nodePositionMutationEnabled, onNodesChange]
  )
  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const visibleChanges = visibleReadOnlyEdgeChanges(changes)
      if (visibleChanges.length > 0) onEdgesChange(visibleChanges)
    },
    [onEdgesChange]
  )
  const nodeById = useMemo(
    () => new Map(nodes.map((node) => [node.id, node])),
    [nodes]
  )
  const runtimeNodes = useMemo(
    () => flowNodes.map((node) => {
      const sourceNode = nodeById.get(node.id)
      const status = sourceNode?.groupKind === 'subworkflow'
        ? nestedWorkflowGroupStatus(sourceNode, nodeStates)
        : nodeStates[node.id] || 'pending'
      const beforeStart = beforeStartNodeIds.has(node.id)
      const pausedBefore = pausedBeforeNodeId === node.id
      const startNode = startNodeId === node.id
      return {
        ...node,
        deletable: false,
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
            ? 'var(--unilab-color-skipped)'
            : pausedBefore
              ? 'var(--unilab-color-paused)'
              : status === 'success'
                ? 'var(--unilab-color-success)'
                : status === 'running'
                  ? 'var(--unilab-color-warning)'
                  : 'var(--unilab-color-text-subtle)',
          status,
          breakpoint: breakpoints.has(node.id),
          startNode,
          beforeStart,
          pausedBefore,
          groupExpanded: expandedGroupIds.has(node.id),
          onToggleGroup: toggleGroup,
          onSetStart: sourceNode?.type === 'material_source'
            ? undefined
            : onSetStart,
          onToggleBreakpoint: sourceNode?.type === 'material_source'
            ? undefined
            : onToggleBreakpoint
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
      deletable: false,
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
  const deletionSelection = useMemo(() => ({
    nodeUuids: flowNodes
      .filter((node) => node.selected)
      .map((node) => node.id),
    edgeUuids: flowEdges
      .filter((edge) => edge.selected)
      .map((edge) => edge.id)
  }), [flowEdges, flowNodes])
  const deletionDisabledReason = useMemo(() => {
    if (!canvasMutationEnabled) {
      return '代码模式下工作流画布只读；请切换到画布模式'
    }
    if (
      deletionSelection.nodeUuids.length === 0 &&
      deletionSelection.edgeUuids.length === 0
    ) return '请先选择允许编辑的节点或连线'
    for (const nodeUuid of deletionSelection.nodeUuids) {
      const sourceNode = nodeById.get(nodeUuid)
      if (sourceNode?.authoringReadOnly) {
        return sourceNode.authoringReadOnlyReason ||
          '复合工作流内部或系统节点只读，不能直接删除'
      }
    }
    for (const edgeUuid of deletionSelection.edgeUuids) {
      const edge = flowEdges.find((item) => item.id === edgeUuid)
      if (!edge) continue
      const sourceReason = nodeById.get(edge.source)?.authoringReadOnlyReason
      const targetReason = nodeById.get(edge.target)?.authoringReadOnlyReason
      if (sourceReason || targetReason) {
        return '复合工作流内部或系统节点的连线只读，不能直接删除'
      }
    }
    return null
  }, [
    canvasMutationEnabled,
    deletionSelection,
    flowEdges,
    nodeById
  ])
  /** 请求创作层删除当前选中的规范化节点与连线。 */
  const requestSelectedDeletion = useCallback((): void => {
    if (deletionDisabledReason || !onDeleteRequest) return
    onDeleteRequest(deletionSelection)
  }, [deletionDisabledReason, deletionSelection, onDeleteRequest])
  const graphSignature = useMemo(
    () => JSON.stringify({
      nodes: flowNodes.map((node) => [
        node.id,
        node.position.x,
        node.position.y
      ]),
      links: flowEdges.map((edge) => [edge.source, edge.target])
    }),
    [flowEdges, flowNodes]
  )
  useEffect(() => {
    let fitFrame = 0
    const syncFrame = requestAnimationFrame(() => {
      fitFrame = requestAnimationFrame(() => {
        void flowInstanceRef.current?.fitView({
          padding: 0.16,
          minZoom: 0.2,
          maxZoom: 1
        })
      })
    })
    return () => {
      cancelAnimationFrame(syncFrame)
      cancelAnimationFrame(fitFrame)
    }
  }, [graphSignature])
  useEffect(() => {
    const container = containerRef.current
    if (!container || typeof ResizeObserver === 'undefined') return
    let fitFrame = 0
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(fitFrame)
      fitFrame = requestAnimationFrame(() => {
        void flowInstanceRef.current?.fitView({
          padding: 0.16,
          minZoom: 0.2,
          maxZoom: 1
        })
      })
    })
    observer.observe(container)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(fitFrame)
    }
  }, [])
  const handleBeautify = useCallback(() => {
    if (!canBeautify || !onBeautify) return
    setIsBeautifying(true)
    onBeautify(layoutStrategy, swimlaneDirection)
    if (beautifyTimerRef.current !== null) {
      globalThis.clearTimeout(beautifyTimerRef.current)
    }
    beautifyTimerRef.current = globalThis.setTimeout(() => {
      setIsBeautifying(false)
      beautifyTimerRef.current = null
    }, 480)
  }, [canBeautify, layoutStrategy, onBeautify, swimlaneDirection])

  /**
   * 切换画布布局策略并立即刷新本地预览。
   *
   * @param event 布局策略下拉框的变更事件。
   * @returns 无返回值；只有点击“应用布局”才会写入工作流草稿。
   */
  const handleLayoutStrategyChange = useCallback((
    event: React.ChangeEvent<HTMLSelectElement>
  ): void => {
    setLayoutStrategy(event.target.value as WorkflowDagLayoutStrategy)
  }, [])

  /**
   * 切换物料泳道的流向并立即刷新本地预览。
   *
   * @param direction 用户选择的纵向或横向物料泳道方向。
   * @returns 无返回值；只有点击“应用布局”才会写入工作流草稿。
   */
  const handleSwimlaneDirectionChange = useCallback((
    direction: WorkflowMaterialSwimlaneDirection
  ): void => {
    setSwimlaneDirection(direction)
  }, [])

  if (flowNodes.length === 0) {
    return (
      <p className="px-3.5 py-3 text-xs text-[var(--unilab-color-text-muted)]">
        当前工作流未定义节点，无法生成拓扑图
      </p>
    )
  }

  return (
    <div
      ref={containerRef}
      className={styles.dag}
      onKeyDownCapture={(event) => {
        if (
          event.key !== 'Delete' &&
          event.key !== 'Backspace'
        ) return
        if (!onDeleteRequest) return
        if (isWorkflowTextEditingTarget(event.target)) return
        if (deletionDisabledReason) return
        event.preventDefault()
        event.stopPropagation()
        requestSelectedDeletion()
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        const target = event.target
        if (!(target instanceof Element)) return
        const node = target.closest('.react-flow__node[data-id]')
        const nodeId = node?.getAttribute('data-id')
        if (!nodeId) return
        event.preventDefault()
        onNodeSelect(nodeId)
      }}
    >
      <ReactFlow
        className={[
          isBeautifying ? 'is-beautifying' : '',
          `wf-layout--${layoutStrategy}`,
          `wf-layout-direction--${swimlaneDirection}`
        ].filter(Boolean).join(' ')}
        nodes={runtimeNodes}
        edges={runtimeEdges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={(connection: Connection) => {
          if (
            !canvasMutationEnabled ||
            !connection.source ||
            !connection.sourceHandle ||
            !connection.target ||
            !connection.targetHandle
          ) return
          onConnectHandles?.({
            sourceNodeUuid: connection.source,
            sourceHandleUuid: connection.sourceHandle,
            targetNodeUuid: connection.target,
            targetHandleUuid: connection.targetHandle
          })
        }}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.16, minZoom: 0.2, maxZoom: 1 }}
        minZoom={0.2}
        {...(
          canvasMutationEnabled
            ? CANVAS_EDIT_WORKFLOW_CANVAS
            : READ_ONLY_WORKFLOW_CANVAS
        )}
        nodesDraggable={nodePositionMutationEnabled}
        elementsSelectable
        proOptions={{ hideAttribution: true }}
        onInit={(instance) => {
          flowInstanceRef.current = instance
        }}
        onNodeClick={(_event, node: Node<WorkflowNodeData>) => onNodeSelect(node.id)}
        onNodeDragStop={(_event, node: Node<WorkflowNodeData>) => {
          if (!nodePositionMutationEnabled) return
          onNodePositionChange?.(node.id, node.position)
        }}
        onNodeContextMenu={(event, node: Node<WorkflowNodeData>) => {
          event.preventDefault()
          if (node.data.kind === 'material_source') return
          onSetStart?.(node.id)
        }}
        onNodeDoubleClick={(_event, node: Node<WorkflowNodeData>) => {
          if (node.data.kind === 'material_source') return
          onToggleBreakpoint?.(node.id)
        }}
      >
        <Background
          gap={24}
          size={0.75}
          color="var(--unilab-color-border-strong)"
        />
        <Controls showInteractive={false} />
        <WorkflowDagLayoutTools
          layoutStrategy={layoutStrategy}
          swimlaneDirection={swimlaneDirection}
          isBeautifying={isBeautifying}
          canBeautify={canBeautify}
          beautifyDisabledReason={beautifyDisabledReason}
          deletionDisabledReason={deletionDisabledReason}
          deletionEnabled={Boolean(onDeleteRequest)}
          onDeleteSelection={requestSelectedDeletion}
          onLayoutStrategyChange={handleLayoutStrategyChange}
          onSwimlaneDirectionChange={handleSwimlaneDirectionChange}
          onBeautify={handleBeautify}
        />
        <MiniMap
          pannable
          zoomable
          nodeColor={(node) =>
            node.data?.color ?? 'var(--unilab-color-text-subtle)'
          }
        />
      </ReactFlow>
    </div>
  )
}
