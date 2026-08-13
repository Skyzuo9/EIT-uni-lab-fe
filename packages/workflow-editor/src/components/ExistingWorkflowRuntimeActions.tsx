import type {
  WorkflowRunNodeOption,
  WorkflowRunPreflightReport,
  WorkflowTaskCommandType,
  WorkflowTaskRunMode
} from '@unilab/services'

import { existingWorkflowRunButtonLabel } from '../utils/existingWorkflowRunProjection'
import { ExistingWorkflowRunSetup } from './ExistingWorkflowRunSetup'
import { WorkflowButton } from './WorkflowButton'
import {
  WorkflowDebugControls,
  type WorkflowRuntimeControl
} from './WorkflowDebugger'
import { WorkflowToolbarIcon } from './WorkflowWorkspaceToolbar'

interface ExistingWorkflowRuntimeActionsProps {
  runMode: WorkflowTaskRunMode
  targetNodeUuid: string
  enabledNodes: readonly WorkflowRunNodeOption[]
  busy: boolean
  liveTask: boolean
  preparationLoading: boolean
  preparationError: string | null
  preflightLoading: boolean
  preflight: WorkflowRunPreflightReport | null
  preflightError: string | null
  preflightReady: boolean
  targetRequired: boolean
  startDisabled: boolean
  startDisabledReason: string
  controls: readonly WorkflowRuntimeControl<WorkflowTaskCommandType>[]
  onRunModeChange: (runMode: WorkflowTaskRunMode) => void
  onTargetNodeChange: (nodeUuid: string) => void
  onPreparationRetry: () => void
  onPreflightRetry: () => void
  onStart: () => void
  onRefresh: () => void
  onCommand: (command: WorkflowTaskCommandType, message: string) => void
}

/**
 * 把 Backend 特有的预检与工作流任务（WorkflowTask）命令适配为共享工具栏操作。
 *
 * @param props Backend 运行准备事实、运行模式和权威任务命令回调。
 * @returns 插入 dev 共享工具栏操作区的控件集合，不创建第二个工具栏。
 */
export function ExistingWorkflowRuntimeActions({
  runMode,
  targetNodeUuid,
  enabledNodes,
  busy,
  liveTask,
  preparationLoading,
  preparationError,
  preflightLoading,
  preflight,
  preflightError,
  preflightReady,
  targetRequired,
  startDisabled,
  startDisabledReason,
  controls,
  onRunModeChange,
  onTargetNodeChange,
  onPreparationRetry,
  onPreflightRetry,
  onStart,
  onRefresh,
  onCommand
}: ExistingWorkflowRuntimeActionsProps): React.JSX.Element {
  return (
    <>
      <WorkflowButton
        type="button"
        className="persistent-authoring__debug-icon"
        aria-label="刷新状态"
        data-tooltip="刷新运行状态"
        disabled={busy}
        disabledReason="正在读取 Backend 运行状态"
        title="从 Backend 补读任务、节点作业和反馈"
        onClick={onRefresh}
      >
        <WorkflowToolbarIcon name="refresh" />
      </WorkflowButton>

      {!liveTask ? (
        <details className="persistent-authoring__run-mode-menu workflow-runtime__run-settings">
          <summary
            role="button"
            aria-label="配置运行方式"
            data-tooltip="配置运行方式"
            title="配置运行方式、单节点目标与 Backend 预检"
          >
            <WorkflowToolbarIcon name="settings" />
          </summary>
          <div>
            <ExistingWorkflowRunSetup
              runMode={runMode}
              targetNodeUuid={targetNodeUuid}
              enabledNodes={enabledNodes}
              disabled={busy}
              preparationLoading={preparationLoading}
              preparationError={preparationError}
              preflightLoading={preflightLoading}
              preflight={preflight}
              preflightError={preflightError}
              preflightReady={preflightReady}
              targetRequired={targetRequired}
              onRunModeChange={onRunModeChange}
              onTargetNodeChange={onTargetNodeChange}
              onPreparationRetry={onPreparationRetry}
              onPreflightRetry={onPreflightRetry}
            />
          </div>
        </details>
      ) : null}

      {!liveTask ? (
        <WorkflowButton
          type="button"
          className="persistent-authoring__debug-icon is-start"
          aria-label={existingWorkflowRunButtonLabel(runMode)}
          data-tooltip={existingWorkflowRunButtonLabel(runMode)}
          disabled={startDisabled}
          disabledReason={startDisabledReason}
          title={existingWorkflowRunButtonLabel(runMode)}
          onClick={onStart}
        >
          <WorkflowToolbarIcon name="play" />
        </WorkflowButton>
      ) : (
        <WorkflowDebugControls
          compact
          controls={controls}
          actionGroupLabel="工作流任务运行控制"
          dangerGroupLabel="工作流任务停止控制"
          commandDataAttribute="runtime"
          onCommand={onCommand}
        />
      )}
    </>
  )
}
