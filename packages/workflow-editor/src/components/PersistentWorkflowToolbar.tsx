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
  const {
    aggregate,
    busy,
    dirty,
    fileUpload,
    fullSourceDiff,
    message,
    mode,
    onChooseWorkflow,
    pendingMode,
    remoteConflict,
    requestMode,
    runtimeBusy,
    saveDraft,
    selectSingleNodeMode,
    singleNodeTargetMissing,
    setTaskRunMode,
    startWorkflow,
    taskInputForm,
    taskRunMode,
    workflowStartBusy,
    workflowStartPresentation
  } = model
  const moreMenuRef = useRef<HTMLDetailsElement | null>(null)

  /**
   * 从“更多”菜单仅保存工作流源码（Workflow Source）并收起菜单。
   *
   * @returns 无返回值；双 CAS 仍由创作会话执行。
   */
  const saveDraftFromMoreMenu = (): void => {
    moreMenuRef.current?.removeAttribute('open')
    saveDraft()
  }

  useEffect(() => {
    /**
     * 拦截 Ctrl/Cmd+S 并委托给工作流源码（Workflow Source）保存命令。
     *
     * @param event 浏览器键盘事件。
     * @returns 无返回值；弹窗或运行期间保留浏览器默认行为。
     */
    const handleSaveShortcut = (event: KeyboardEvent): void => {
      if (
        event.key.toLowerCase() !== 's' ||
        (!event.ctrlKey && !event.metaKey) ||
        busy ||
        runtimeBusy ||
        workflowStartBusy ||
        !aggregate ||
        fullSourceDiff ||
        pendingMode ||
        remoteConflict ||
        taskInputForm
      ) return
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
    workflowStartBusy
  ])

  const runningEntryBusy = runtimeBusy || workflowStartBusy

  return (
    <header className="workflow__toolbar persistent-authoring__toolbar">
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
          {message}
        </span>
      </div>

      <div
        className="workflow__mode-switch"
        role="group"
        aria-label="工作流单编辑权模式"
      >
        <WorkflowButton
          type="button"
          className={mode === 'code' ? 'is-active' : ''}
          aria-pressed={mode === 'code'}
          disabled={busy}
          disabledReason="正在处理工作流，暂时不能切换编辑模式"
          onClick={() => requestMode('code')}
        >
          代码模式
        </WorkflowButton>
        <WorkflowButton
          type="button"
          className={mode === 'canvas' ? 'is-active' : ''}
          aria-pressed={mode === 'canvas'}
          disabled={busy}
          disabledReason="正在处理工作流，暂时不能切换编辑模式"
          onClick={() => requestMode('canvas')}
        >
          画布模式
        </WorkflowButton>
      </div>

      <div className="workflow__toolbar-actions">
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
            disabledReason={busy
              ? '正在处理工作流，请稍后导入 Python'
              : dirty
                ? '请先保存当前可写内容'
                : '工作流尚未加载完成'}
            title={dirty ? '请先保存当前可写表示' : undefined}
            onClick={() => fileUpload.openFilePicker('python')}
          >
            导入 Python
          </WorkflowButton>
          <WorkflowButton
            type="button"
            className="workflow__upload"
            disabled={busy || dirty || !aggregate}
            disabledReason={busy
              ? '正在处理工作流，请稍后导入 JSON'
              : dirty
                ? '请先保存当前可写内容'
                : '工作流尚未加载完成'}
            title={dirty ? '请先保存当前可写表示' : undefined}
            onClick={() => fileUpload.openFilePicker('json')}
          >
            导入 JSON
          </WorkflowButton>
        </div>

        <details ref={moreMenuRef} className="persistent-authoring__more">
          <summary aria-label="更多工作流操作">更多</summary>
          <div
            className="persistent-authoring__more-menu"
            role="menu"
            aria-label="更多工作流操作"
          >
            <WorkflowButton
              type="button"
              role="menuitem"
              disabled={busy || runningEntryBusy || !aggregate}
              disabledReason={busy || runningEntryBusy
                ? '正在处理工作流，请稍后仅保存草稿'
                : '工作流尚未加载完成'}
              onClick={saveDraftFromMoreMenu}
            >
              <span>仅保存草稿</span>
              <kbd>Ctrl+S</kbd>
            </WorkflowButton>
          </div>
        </details>

        <div
          className="persistent-authoring__toolbar-group persistent-authoring__toolbar-run"
          role="group"
          aria-label="工作流任务运行"
        >
          <div
            className="workflow__mode-switch workflow__run-mode"
            role="group"
            aria-label="任务运行模式"
          >
            <WorkflowButton
              type="button"
              className={taskRunMode === 'normal' ? 'is-active' : ''}
              aria-pressed={taskRunMode === 'normal'}
              disabled={runningEntryBusy}
              disabledReason="正在处理工作流任务，暂时不能切换运行模式"
              onClick={() => setTaskRunMode('normal')}
            >
              正常运行
            </WorkflowButton>
            <WorkflowButton
              type="button"
              className={taskRunMode === 'step' ? 'is-active' : ''}
              aria-pressed={taskRunMode === 'step'}
              disabled={runningEntryBusy}
              disabledReason="正在处理工作流任务，暂时不能切换运行模式"
              onClick={() => setTaskRunMode('step')}
            >
              单步模式
            </WorkflowButton>
            <WorkflowButton
              type="button"
              className={taskRunMode === 'single_node' ? 'is-active' : ''}
              aria-pressed={taskRunMode === 'single_node'}
              disabled={runningEntryBusy}
              disabledReason="正在处理工作流任务，暂时不能切换运行模式"
              onClick={selectSingleNodeMode}
            >
              单节点调试
            </WorkflowButton>
          </div>
          <WorkflowButton
            type="button"
            className="workflow-runtime__primary"
            disabled={
              busy ||
              runningEntryBusy ||
              singleNodeTargetMissing ||
              workflowStartPresentation.disabled
            }
            disabledReason={busy
              ? '正在处理工作流编写操作，请稍候'
              : runningEntryBusy
                ? '正在处理上一项工作流任务操作，请稍候'
                : singleNodeTargetMissing
                  ? '请先在画布节点上设置起始点'
                : workflowStartPresentation.disabledReason ??
                  '工作流尚未就绪'}
            title={aggregate
              ? `${workflowStartPresentation.label}；当前已应用版本 ` +
                `${aggregate.workflow_revision}`
              : '工作流尚未就绪'}
            onClick={startWorkflow}
          >
            {runningEntryBusy
              ? '处理中…'
              : taskRunMode === 'single_node'
                ? '开始单节点调试'
                : workflowStartPresentation.label}
          </WorkflowButton>
        </div>
      </div>
    </header>
  )
}
