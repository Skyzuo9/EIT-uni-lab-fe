import { useEffect, useRef } from 'react'

import type { PersistentWorkflowAuthoringModel } from './persistentWorkflowAuthoringModel'
import { WorkflowButton } from './WorkflowButton'

interface PersistentWorkflowToolbarProps {
  model: PersistentWorkflowAuthoringModel
}

/**
 * 展示工作流（Workflow）编辑模式、导入、仅保存和单一运行入口。
 *
 * @param props 工作流创作会话投影。
 * @returns 保持既有可访问性分组的工具栏。
 */
export function PersistentWorkflowToolbar({
  model
}: PersistentWorkflowToolbarProps): React.JSX.Element {
  const moreMenuRef = useSaveDraftShortcut(model)

  return (
    <header className="workflow__toolbar persistent-authoring__toolbar">
      <WorkflowToolbarContext model={model} />
      <WorkflowEditingModeSwitch model={model} />
      <div className="workflow__toolbar-actions">
        <WorkflowImportActions model={model} />
        <WorkflowMoreMenu model={model} menuRef={moreMenuRef} />
        <WorkflowRunActions model={model} />
      </div>
    </header>
  )
}

/** 注册工作流源码（Workflow Source）的键盘保存入口。 */
function useSaveDraftShortcut(
  model: PersistentWorkflowAuthoringModel
): React.RefObject<HTMLDetailsElement | null> {
  const {
    aggregate,
    busy,
    fullSourceDiff,
    pendingMode,
    remoteConflict,
    runtimeBusy,
    saveDraft,
    taskInputForm,
    workflowImportMismatch,
    workflowStartBusy
  } = model
  const moreMenuRef = useRef<HTMLDetailsElement | null>(null)

  useEffect(() => {
    /** 将 Ctrl/Cmd+S 委托给工作流源码保存命令。 */
    const handleSaveShortcut = (event: KeyboardEvent): void => {
      const isSaveShortcut = event.key.toLowerCase() === 's' &&
        (event.ctrlKey || event.metaKey)
      const saveBlocked = busy || runtimeBusy || workflowStartBusy ||
        !aggregate || Boolean(fullSourceDiff) || Boolean(pendingMode) ||
        Boolean(remoteConflict) || Boolean(workflowImportMismatch) ||
        Boolean(taskInputForm)
      if (!isSaveShortcut || saveBlocked) return
      event.preventDefault()
      saveDraft()
    }
    document.addEventListener('keydown', handleSaveShortcut)
    return () => document.removeEventListener('keydown', handleSaveShortcut)
  }, [
    aggregate,
    busy,
    fullSourceDiff,
    pendingMode,
    remoteConflict,
    runtimeBusy,
    saveDraft,
    taskInputForm,
    workflowImportMismatch,
    workflowStartBusy
  ])

  return moreMenuRef
}

/** 展示工作流（Workflow）标题与会话消息。 */
function WorkflowToolbarContext({
  model
}: PersistentWorkflowToolbarProps): React.JSX.Element {
  return (
    <div className="workflow__context">
      <div className="workflow__title-row">
        <span className="workflow__toolbar-label">工作流编写</span>
        <span className="workflow__format">OS 工作流编辑</span>
      </div>
      <span
        className="workflow-runtime__message"
        role="status"
        aria-live="polite"
      >
        {model.message}
      </span>
    </div>
  )
}

/** 展示代码与画布的单编辑权模式切换。 */
function WorkflowEditingModeSwitch({
  model
}: PersistentWorkflowToolbarProps): React.JSX.Element {
  return (
    <div
      className="workflow__mode-switch"
      role="group"
      aria-label="工作流单编辑权模式"
    >
      <WorkflowButton
        type="button"
        className={model.mode === 'code' ? 'is-active' : ''}
        aria-pressed={model.mode === 'code'}
        disabled={model.busy}
        disabledReason="正在处理工作流，暂时不能切换编辑模式"
        onClick={() => model.requestMode('code')}
      >
        代码模式
      </WorkflowButton>
      <WorkflowButton
        type="button"
        className={model.mode === 'canvas' ? 'is-active' : ''}
        aria-pressed={model.mode === 'canvas'}
        disabled={model.busy}
        disabledReason="正在处理工作流，暂时不能切换编辑模式"
        onClick={() => model.requestMode('canvas')}
      >
        画布模式
      </WorkflowButton>
    </div>
  )
}

/** 展示工作流（Workflow）列表和源码导入入口。 */
function WorkflowImportActions({
  model
}: PersistentWorkflowToolbarProps): React.JSX.Element {
  const { aggregate, busy, dirty, fileUpload, onChooseWorkflow } = model
  const importDisabledReason = busy
    ? '正在处理工作流，请稍后导入'
    : dirty
      ? '请先保存当前可写内容'
      : '工作流尚未加载完成'

  return (
    <>
      <input
        ref={fileUpload.inputRef}
        className="workflow__file-input"
        type="file"
        accept=".py,text/x-python"
        aria-label="选择工作流文件"
        onChange={fileUpload.handleFileChange}
      />
      <div
        className="persistent-authoring__toolbar-group"
        role="group"
        aria-label="工作流导航与导入"
      >
        {onChooseWorkflow && (
          <WorkflowButton
            type="button"
            className="workflow__upload"
            disabled={busy || dirty}
            disabledReason={busy
              ? '正在处理工作流，请稍后返回列表'
              : '请先保存当前可写内容'}
            title={dirty ? '请先保存当前可写表示' : undefined}
            onClick={onChooseWorkflow}
          >
            工作流列表
          </WorkflowButton>
        )}
        <WorkflowButton
          type="button"
          className="workflow__upload"
          disabled={busy || dirty || !aggregate}
          disabledReason={`${importDisabledReason} Python`}
          title={dirty ? '请先保存当前可写表示' : undefined}
          onClick={() => fileUpload.openFilePicker('python')}
        >
          导入 Python
        </WorkflowButton>
        <WorkflowButton
          type="button"
          className="workflow__upload"
          disabled={busy || dirty || !aggregate}
          disabledReason={`${importDisabledReason} JSON`}
          title={dirty ? '请先保存当前可写表示' : undefined}
          onClick={() => fileUpload.openFilePicker('json')}
        >
          导入 JSON
        </WorkflowButton>
      </div>
    </>
  )
}

/** 展示低频工作流（Workflow）操作。 */
function WorkflowMoreMenu({
  model,
  menuRef
}: PersistentWorkflowToolbarProps & {
  menuRef: React.RefObject<HTMLDetailsElement | null>
}): React.JSX.Element {
  const runningEntryBusy = model.runtimeBusy || model.workflowStartBusy

  /** 保存草稿并关闭更多菜单。 */
  const saveDraftFromMoreMenu = (): void => {
    menuRef.current?.removeAttribute('open')
    model.saveDraft()
  }

  return (
    <details ref={menuRef} className="persistent-authoring__more">
      <summary aria-label="更多工作流操作">更多</summary>
      <div
        className="persistent-authoring__more-menu"
        role="menu"
        aria-label="更多工作流操作"
      >
        <WorkflowButton
          type="button"
          role="menuitem"
          disabled={model.busy || runningEntryBusy || !model.aggregate}
          disabledReason={model.busy || runningEntryBusy
            ? '正在处理工作流，请稍后仅保存草稿'
            : '工作流尚未加载完成'}
          onClick={saveDraftFromMoreMenu}
        >
          <span>仅保存草稿</span>
          <kbd>Ctrl+S</kbd>
        </WorkflowButton>
      </div>
    </details>
  )
}

/** 展示工作流任务（WorkflowTask）的运行模式与启动入口。 */
function WorkflowRunActions({
  model
}: PersistentWorkflowToolbarProps): React.JSX.Element {
  const runningEntryBusy = model.runtimeBusy || model.workflowStartBusy
  const startDisabled = model.busy || runningEntryBusy ||
    model.singleNodeTargetMissing || model.workflowStartPresentation.disabled
  const disabledReason = workflowStartDisabledReason(model, runningEntryBusy)

  return (
    <div
      className="persistent-authoring__toolbar-group persistent-authoring__toolbar-run"
      role="group"
      aria-label="工作流任务运行"
    >
      <WorkflowRunModeSwitch model={model} busy={runningEntryBusy} />
      <WorkflowButton
        type="button"
        className="workflow-runtime__primary"
        disabled={startDisabled}
        disabledReason={disabledReason}
        title={model.aggregate
          ? `${model.workflowStartPresentation.label}；当前已应用版本 ` +
            `${model.aggregate.workflow_revision}`
          : '工作流尚未就绪'}
        onClick={model.startWorkflow}
      >
        {runningEntryBusy
          ? '处理中…'
          : model.taskRunMode === 'single_node'
            ? '开始单节点调试'
            : model.workflowStartPresentation.label}
      </WorkflowButton>
    </div>
  )
}

/** 展示工作流任务（WorkflowTask）的三种运行模式。 */
function WorkflowRunModeSwitch({
  model,
  busy
}: PersistentWorkflowToolbarProps & { busy: boolean }): React.JSX.Element {
  return (
    <div
      className="workflow__mode-switch workflow__run-mode"
      role="group"
      aria-label="任务运行模式"
    >
      <WorkflowButton
        type="button"
        className={model.taskRunMode === 'normal' ? 'is-active' : ''}
        aria-pressed={model.taskRunMode === 'normal'}
        disabled={busy}
        disabledReason="正在处理工作流任务，暂时不能切换运行模式"
        onClick={() => model.setTaskRunMode('normal')}
      >
        正常运行
      </WorkflowButton>
      <WorkflowButton
        type="button"
        className={model.taskRunMode === 'step' ? 'is-active' : ''}
        aria-pressed={model.taskRunMode === 'step'}
        disabled={busy}
        disabledReason="正在处理工作流任务，暂时不能切换运行模式"
        onClick={() => model.setTaskRunMode('step')}
      >
        单步模式
      </WorkflowButton>
      <WorkflowButton
        type="button"
        className={model.taskRunMode === 'single_node' ? 'is-active' : ''}
        aria-pressed={model.taskRunMode === 'single_node'}
        disabled={busy}
        disabledReason="正在处理工作流任务，暂时不能切换运行模式"
        onClick={model.selectSingleNodeMode}
      >
        单节点调试
      </WorkflowButton>
    </div>
  )
}

/** 解释工作流任务（WorkflowTask）启动入口为何不可用。 */
function workflowStartDisabledReason(
  model: PersistentWorkflowAuthoringModel,
  runningEntryBusy: boolean
): string {
  if (model.busy) return '正在处理工作流编写操作，请稍候'
  if (runningEntryBusy) return '正在处理上一项工作流任务操作，请稍候'
  if (model.singleNodeTargetMissing) return '请先在画布节点上设置起始点'
  return model.workflowStartPresentation.disabledReason ?? '工作流尚未就绪'
}
