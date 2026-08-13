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
  onRetry
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
        projectionLabel="Backend 定义 · 只读"
        projectionTitle="画布来自 Backend 当前工作流定义；创作写操作尚未启用"
        description={(
          <p>
            选择节点查看运行结果；单节点调试模式下，点击画布节点即可设为目标。
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
              beautifyDisabledReason="Backend 工作流画布当前只读，布局不会写回定义"
              canvasMutationEnabled={false}
            />
          )}
        </div>
      </div>
    </section>
  )
}
