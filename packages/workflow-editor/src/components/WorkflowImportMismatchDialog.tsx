import type {
  WorkflowImportMismatchPrompt
} from '../hooks/persistentWorkflowAuthoringTypes'
import { WorkflowButton } from './WorkflowButton'

interface WorkflowImportMismatchDialogProps {
  prompt: WorkflowImportMismatchPrompt
  busy: boolean
  onContinueEditing: () => void
  onDiscardImport: () => void
  onOpenImportedWorkflow?: () => void
}

/**
 * 解释导入文件与当前工作流（Workflow）的关联差异，并提供可恢复动作。
 *
 * @param props 当前与导入工作流信息及三个明确决策动作。
 * @returns 单一、模态且可由辅助技术识别的归属提示。
 */
export function WorkflowImportMismatchDialog({
  prompt,
  busy,
  onContinueEditing,
  onDiscardImport,
  onOpenImportedWorkflow
}: WorkflowImportMismatchDialogProps): React.JSX.Element {
  const currentName = prompt.currentWorkflowName || '当前工作流'
  const importedName = prompt.importedWorkflowName || '文件中的工作流'
  const fileName = prompt.importedFileName || '导入的 Python 文件'
  const canOpenImportedWorkflow = Boolean(
    prompt.importedWorkflowUuid &&
    prompt.canOpenImportedWorkflow &&
    onOpenImportedWorkflow
  )

  return (
    <div className="workflow-save-prompt">
      <section
        className="workflow-save-prompt__dialog workflow-import-mismatch"
        role="dialog"
        aria-modal="true"
        aria-labelledby="workflow-import-mismatch-title"
        aria-describedby="workflow-import-mismatch-description"
      >
        <header className="workflow-save-prompt__header">
          <div className="workflow-import-mismatch__title">
            <span
              className="workflow-import-mismatch__title-icon"
              aria-hidden="true"
            >
              !
            </span>
            <h2 id="workflow-import-mismatch-title">
              这个文件属于另一个工作流
            </h2>
          </div>
        </header>

        <div className="workflow-save-prompt__body">
          <p id="workflow-import-mismatch-description">
            你正在编辑「{currentName}」，但「{fileName}」关联的是
            「{importedName}」。请选择接下来要处理的位置。
          </p>

          <div className="workflow-import-mismatch__comparison">
            <WorkflowReference
              label="正在编辑"
              name={currentName}
              workflowUuid={prompt.currentWorkflowUuid}
            />
            <span
              className="workflow-import-mismatch__connector"
              aria-hidden="true"
            >
              <span className="workflow-import-mismatch__arrow">→</span>
            </span>
            <WorkflowReference
              label="导入文件"
              name={importedName}
              workflowUuid={prompt.importedWorkflowUuid}
            />
          </div>

          <p
            className="workflow-save-prompt__notice workflow-import-mismatch__notice"
            role="status"
          >
            <span aria-hidden="true">✓</span>
            <span>当前工作流没有被修改，导入内容仍保留在编辑器中。</span>
          </p>
        </div>

        <footer className="workflow-save-prompt__actions">
          <WorkflowButton
            type="button"
            className="workflow-save-prompt__cancel workflow-import-mismatch__discard"
            disabled={busy}
            disabledReason="正在读取工作流信息，请稍候"
            onClick={onDiscardImport}
          >
            放弃导入
          </WorkflowButton>
          <WorkflowButton
            type="button"
            className="workflow-save-prompt__revision"
            disabled={busy}
            disabledReason="正在读取工作流信息，请稍候"
            autoFocus={!canOpenImportedWorkflow}
            onClick={onContinueEditing}
          >
            继续修改导入内容
          </WorkflowButton>
          {canOpenImportedWorkflow && (
            <WorkflowButton
              type="button"
              className="workflow-save-prompt__file"
              disabled={busy}
              disabledReason="正在读取工作流信息，请稍候"
              autoFocus
              onClick={onOpenImportedWorkflow}
              aria-label={`打开「${importedName}」并继续`}
              title={`打开「${importedName}」并继续`}
            >
              打开对应工作流
            </WorkflowButton>
          )}
        </footer>
      </section>
    </div>
  )
}

/** 呈现一个工作流（Workflow）的易读名称与辅助排障编号。 */
function WorkflowReference({
  label,
  name,
  workflowUuid
}: {
  label: string
  name: string
  workflowUuid: string | null
}): React.JSX.Element {
  return (
    <div className="workflow-import-mismatch__reference">
      <span>{label}</span>
      <strong title={name}>{name}</strong>
      {workflowUuid ? (
        <code title={workflowUuid}>工作流编号 {workflowUuid}</code>
      ) : (
        <code>未读取到工作流编号</code>
      )}
    </div>
  )
}
