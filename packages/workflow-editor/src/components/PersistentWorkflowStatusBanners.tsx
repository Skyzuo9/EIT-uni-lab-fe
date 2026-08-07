import { diagnosticRange } from '../utils/persistentAuthoringSession'
import type { PersistentWorkflowAuthoringModel } from './persistentWorkflowAuthoringModel'
import { WorkflowButton } from './WorkflowButton'

/**
 * 展示工作流（Workflow）创作、运行同步和源码诊断状态。
 *
 * @param props 工作流创作视图模型。
 * @returns 当前存在的错误横幅与诊断列表。
 */
export function PersistentWorkflowStatusBanners({
  model
}: {
  model: PersistentWorkflowAuthoringModel
}): React.JSX.Element {
  const {
    diagnostics,
    error,
    runRuntime,
    runtimeBusy,
    setError,
    taskRuntime
  } = model

  return (
    <>
      {error && (
        <div className="workflow-runtime__problem" role="alert">
          <strong>工作流编辑操作失败</strong>
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)}>关闭</button>
        </div>
      )}
      {taskRuntime.snapshot.error && (
        <div className="workflow-runtime__problem" role="alert">
          <strong>运行状态读取失败</strong>
          <span>
            {taskRuntime.snapshot.projectionStale
              ? `上一次一致状态已保留：${taskRuntime.snapshot.error}`
              : taskRuntime.snapshot.feedbackStale
                ? `已确认的反馈事件已保留：${taskRuntime.snapshot.error}`
                : taskRuntime.snapshot.error}
          </span>
          <WorkflowButton
            type="button"
            disabled={runtimeBusy}
            disabledReason="正在补读工作流任务状态，请稍候"
            onClick={() => runRuntime(() => taskRuntime.refresh())}
          >
            重试状态读取
          </WorkflowButton>
          <button type="button" onClick={taskRuntime.clearError}>关闭</button>
        </div>
      )}
      {diagnostics.length > 0 && (
        <section
          className="persistent-authoring__diagnostics"
          aria-label="Python 草稿诊断"
        >
          <strong>草稿诊断</strong>
          <ul>
            {diagnostics.map((diagnostic, index) => (
              <li key={`${diagnostic.code}:${index}`}>
                <code>{diagnostic.code}</code>
                <span>{diagnostic.message}</span>
                {diagnosticRange(diagnostic) && (
                  <span>位置 {diagnosticRange(diagnostic)}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
