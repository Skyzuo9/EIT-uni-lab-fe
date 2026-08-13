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
  editingAvailable?: boolean
  editable?: boolean
  dirty?: boolean
  readOnlyReason?: string
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
 * 以 dev 工作流画布结构展示并编辑 Backend 权威工作流定义与任务状态。
 *
 * @param props 工作流名称、Backend DAG、编辑能力、加载状态和节点选择回调。
 * @returns 通过能力状态区分可编辑、任务期锁定与无写能力的统一 WorkflowDag 工作区。
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
  editingAvailable = editable,
  dirty = false,
  readOnlyReason,
  onNodePositionChange,
  onConnectHandles,
  onDeleteRequest,
  onToggleDisabled
}: ExistingWorkflowCanvasProps): React.JSX.Element {
  const temporarilyLocked = editingAvailable && !editable
  const projectionLabel = editable
    ? `Backend 定义 · ${dirty ? '待保存' : '已同步'}`
    : temporarilyLocked
      ? 'Backend 定义 · 运行中锁定'
      : 'Backend 定义 · 只读'
  const projectionTitle = editable
    ? '前端画布修改通过 revision CAS 直接保存到 Backend；工作区代码修改不生效'
    : temporarilyLocked
      ? readOnlyReason || '当前有活动任务；任务结束后可继续编辑和保存 Backend 工作流定义'
      : readOnlyReason || 'Backend 当前未提供工作流定义写能力'

  return (
    <section
      className="persistent-authoring__pane persistent-authoring__canvas workflow-runtime__existing-canvas"
      aria-label="工作流画布"
    >
      <WorkflowCanvasStageHeader
        title={workflowName || '完整控制流 DAG'}
        nodeCount={structure.nodes.length}
        linkCount={structure.links.length}
        projectionLabel={projectionLabel}
        projectionTitle={projectionTitle}
        description={(
          <p>
            {editable
              ? 'Backend Authority：画布可编辑并直接保存；本地 Python 代码修改不生效。'
              : temporarilyLocked
                ? '活动任务期间画布暂时锁定；任务结束后可继续编辑和保存，本地 Python 代码修改仍不生效。'
                : '选择节点查看运行结果；当前 Backend 未开放画布保存。'}
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
                : temporarilyLocked
                  ? '活动任务期间不能修改工作流定义'
                  : readOnlyReason || 'Backend 工作流画布当前只读，布局不会写回定义'}
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
