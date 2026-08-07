import { Panel } from 'reactflow'

import {
  WORKFLOW_DAG_LAYOUT_STRATEGIES,
  WORKFLOW_MATERIAL_SWIMLANE_DIRECTIONS,
  workflowDagLayoutStrategyLabel,
  workflowMaterialSwimlaneDirectionLabel,
  type WorkflowDagLayoutStrategy,
  type WorkflowMaterialSwimlaneDirection
} from '../utils/workflowDagLayoutStrategy'
import { WorkflowButton } from './WorkflowButton'

interface WorkflowDagLayoutToolsProps {
  layoutStrategy: WorkflowDagLayoutStrategy
  swimlaneDirection: WorkflowMaterialSwimlaneDirection
  isBeautifying: boolean
  canBeautify: boolean
  beautifyDisabledReason: string
  deletionDisabledReason: string | null
  deletionEnabled: boolean
  onDeleteSelection: () => void
  onLayoutStrategyChange: React.ChangeEventHandler<HTMLSelectElement>
  onSwimlaneDirectionChange: (
    direction: WorkflowMaterialSwimlaneDirection
  ) => void
  onBeautify: () => void
}

/**
 * 渲染工作流（Workflow）画布的删除与布局工具面板。
 *
 * @param props 当前布局投影、可用性原因及无状态命令回调。
 * @returns ReactFlow 右上角工具面板。
 */
export function WorkflowDagLayoutTools({
  layoutStrategy,
  swimlaneDirection,
  isBeautifying,
  canBeautify,
  beautifyDisabledReason,
  deletionDisabledReason,
  deletionEnabled,
  onDeleteSelection,
  onLayoutStrategyChange,
  onSwimlaneDirectionChange,
  onBeautify
}: WorkflowDagLayoutToolsProps): React.JSX.Element {
  return (
    <Panel position="top-right">
      <div
        className="workflow-runtime__layout-tools"
        aria-label="工作流布局工具"
      >
        {deletionEnabled && (
          <WorkflowButton
            type="button"
            className="workflow-runtime__delete-selection"
            disabled={Boolean(deletionDisabledReason)}
            disabledReason={deletionDisabledReason || ''}
            onClick={onDeleteSelection}
          >
            <span aria-hidden="true">⌫</span>
            删除选中项
          </WorkflowButton>
        )}
        <select
          className="workflow-runtime__layout-strategy"
          aria-label="布局策略"
          value={layoutStrategy}
          onChange={onLayoutStrategyChange}
        >
          {WORKFLOW_DAG_LAYOUT_STRATEGIES.map((strategy) => (
            <option key={strategy.value} value={strategy.value}>
              {strategy.label}
            </option>
          ))}
        </select>
        {layoutStrategy === 'material-swimlanes' && (
          <div
            className="workflow-runtime__swimlane-direction"
            role="group"
            aria-label="物料泳道方向"
          >
            {WORKFLOW_MATERIAL_SWIMLANE_DIRECTIONS.map((direction) => (
              <button
                key={direction.value}
                type="button"
                className={swimlaneDirection === direction.value
                  ? 'is-active'
                  : undefined}
                aria-pressed={swimlaneDirection === direction.value}
                title={direction.description}
                onClick={() => onSwimlaneDirectionChange(direction.value)}
              >
                {direction.label}
              </button>
            ))}
          </div>
        )}
        <WorkflowButton
          type="button"
          className="workflow-runtime__beautify"
          disabled={!canBeautify || isBeautifying}
          disabledReason={isBeautifying
            ? '正在应用工作流布局，请稍候'
            : beautifyDisabledReason}
          aria-label={layoutStrategy === 'material-swimlanes'
            ? `应用${workflowMaterialSwimlaneDirectionLabel(
                swimlaneDirection
              )}物料泳道布局`
            : `应用${workflowDagLayoutStrategyLabel(layoutStrategy)}布局`}
          title={canBeautify
            ? WORKFLOW_DAG_LAYOUT_STRATEGIES.find(
                (strategy) => strategy.value === layoutStrategy
              )?.description
            : beautifyDisabledReason}
          onClick={onBeautify}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 3l1.35 3.65L17 8l-3.65 1.35L12 13l-1.35-3.65L7 8l3.65-1.35L12 3Z"
            />
            <path
              d="M18.5 13l.85 2.15L21.5 16l-2.15.85L18.5 19l-.85-2.15L15.5 16l2.15-.85L18.5 13Z"
            />
            <path
              d="M6 14l.65 1.35L8 16l-1.35.65L6 18l-.65-1.35L4 16l1.35-.65L6 14Z"
            />
          </svg>
          <span>{isBeautifying ? '正在应用' : '应用布局'}</span>
        </WorkflowButton>
      </div>
    </Panel>
  )
}
