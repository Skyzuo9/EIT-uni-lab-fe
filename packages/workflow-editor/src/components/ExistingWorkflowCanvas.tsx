import type { WorkflowStructure } from '../utils/parseWorkflow'

import WorkflowDag from './WorkflowDag'
import { WorkflowCanvasStageHeader } from './WorkflowCanvasStageHeader'

interface ExistingWorkflowCanvasProps {
  workflowName?: string
  structure: WorkflowStructure
  loading: boolean
  error: string | null
  selectedNodeId: string | null
  nodeStates: Readonly<Record<string, string>>
  onNodeSelect: (nodeUuid: string) => void
  onRetry: () => void
  editable?: boolean
  dirty?: boolean
  onNodePositionChange?: (
    nodeUuid: string,
    position: { x: number; y: number }
  ) => void
  onConnectHandles?: (connection: {
    sourceNodeUuid: string
    sourceHandleUuid: string
    targetNodeUuid: string
    targetHandleUuid: string
  }) => void
  onDeleteRequest?: (selection: {
    nodeUuids: string[]
    edgeUuids: string[]
  }) => void
  onToggleDisabled?: (nodeUuid: string) => void
}

/**
 * 以 dev 工作流画布结构展示 Backend 已有工作流的只读定义与任务状态。
 *
 * @param props 工作流名称、只读 DAG、加载状态和节点选择回调。
 * @returns 不提供创作写操作的统一 WorkflowDag 工作区。
 */
export function ExistingWorkflowCanvas({
  workflowName,
  structure,
  loading,
  error,
  selectedNodeId,
  nodeStates,
  onNodeSelect,
  onRetry,
  editable = false,
  dirty = false,
  onNodePositionChange,
  onConnectHandles,
  onDeleteRequest,
  onToggleDisabled
}: ExistingWorkflowCanvasProps): React.JSX.Element {
  return (
    <section
      className="persistent-authoring__pane persistent-authoring__canvas workflow-runtime__existing-canvas"
      aria-label="工作流画布"
    >
      <WorkflowCanvasStageHeader
        title={workflowName || '完整控制流 DAG'}
        nodeCount={structure.nodes.length}
        linkCount={structure.links.length}
        projectionLabel={editable
          ? `Backend 定义 · ${dirty ? '待保存' : '已同步'}`
          : 'Backend 定义 · 只读'}
        projectionTitle={editable
          ? '画布修改通过 revision CAS 直接保存到 Backend；不改写工作区代码'
          : '画布来自 Backend 当前工作流定义；创作写操作尚未启用'}
        description={(
          <p>
            {editable
              ? '画布直接编辑 Backend 工作流；本地 Python 代码不会作用于本图。'
              : '选择节点查看运行结果；单节点调试模式下，点击画布节点即可设为目标。'}
          </p>
        )}
      />
      <div className="persistent-authoring__canvas-body is-palette-closed">
        <div className="persistent-authoring__graph-stage">
          {loading ? (
            <p className="workflow-runtime__existing-canvas-state" role="status">
              正在读取 Backend 工作流图…
            </p>
          ) : error ? (
            <div className="workflow-runtime__existing-canvas-state is-error" role="alert">
              <strong>工作流画布读取失败</strong>
              <span>{error}</span>
              <button type="button" onClick={onRetry}>重试</button>
            </div>
          ) : (
            <WorkflowDag
              nodes={structure.nodes}
              links={structure.links}
              onNodeSelect={onNodeSelect}
              selectedNodeId={selectedNodeId}
              nodeStates={nodeStates}
              canBeautify={false}
              beautifyDisabledReason={editable
                ? 'Backend 画布暂不自动改写布局；可拖动节点后保存'
                : 'Backend 工作流画布当前只读，布局不会写回定义'}
              canvasMutationEnabled={editable}
              nodePositionMutationEnabled={editable}
              onNodePositionChange={onNodePositionChange}
              onConnectHandles={onConnectHandles}
              onDeleteRequest={onDeleteRequest}
              onToggleDisabled={onToggleDisabled}
            />
          )}
        </div>
      </div>
    </section>
  )
}
