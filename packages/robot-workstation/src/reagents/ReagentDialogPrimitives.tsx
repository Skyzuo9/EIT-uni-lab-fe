import { useId } from 'react'

import { buttonClass, uiClass } from '../uiClasses'
import { useAccessibleDialog } from '../useAccessibleDialog'
import { WorkstationIcon } from '../WorkstationIcon'
import styles from '../workstation.module.scss'

/**
 * 渲染试剂模块共享模态框，并在提交期间阻止关闭造成操作状态丢失。
 * @param props 标题、说明、忙碌状态、内容和关闭回调。
 * @returns 带焦点约束和可访问名称的模态框。
 */
export function ReagentDialogFrame({
  title,
  description,
  busy,
  wide = false,
  children,
  onClose
}: {
  title: string
  description: string
  busy: boolean
  wide?: boolean
  children: React.ReactNode
  onClose: () => void
}): React.JSX.Element {
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useAccessibleDialog(() => {
    if (!busy) onClose()
  })
  return (
    <div className={uiClass.dialogBackdrop} role="presentation">
      <section
        ref={dialogRef}
        className={`${styles.formDialog} ${wide ? styles.formDialogWide : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={busy}
        tabIndex={-1}
      >
        <div className={uiClass.panelHeader}>
          <div>
            <h2 id={titleId}>{title}</h2>
            <small id={descriptionId}>{description}</small>
          </div>
          <button className={buttonClass('secondary', 'icon')} type="button" disabled={busy} onClick={onClose} aria-label="关闭">
            <WorkstationIcon name="close" />
          </button>
        </div>
        {children}
      </section>
    </div>
  )
}

/**
 * 渲染试剂表单共享的取消与提交动作。
 * @param props 关闭回调、提交文案和禁用状态。
 * @returns 固定在表单末尾的操作区。
 */
export function ReagentDialogActions({
  onClose,
  submitLabel,
  disabled
}: {
  onClose: () => void
  submitLabel: string
  disabled: boolean
}): React.JSX.Element {
  return (
    <div className={uiClass.dialogActions}>
      <button className={buttonClass()} type="button" disabled={disabled} onClick={onClose}>取消</button>
      <button className={buttonClass('primary')} type="submit" disabled={disabled}>{submitLabel}</button>
    </div>
  )
}

/**
 * 把未知写入异常转换为可行动中文错误，同时保留 Backend 原始消息。
 * @param error 未信任异常。
 * @param fallback 没有可读消息时使用的提示。
 * @returns 可以直接展示给用户的错误文案。
 */
export function reagentDialogErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
