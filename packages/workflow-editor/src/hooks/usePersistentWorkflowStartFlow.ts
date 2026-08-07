import type {
  WorkflowAuthoringAggregate,
  WorkflowAuthoringApplyResponse
} from '@unilab/services'
import { useRef, useState } from 'react'

import {
  createWorkflowStartFlow,
  type WorkflowStartCommand,
  type WorkflowStartContext,
  type WorkflowStartIntent,
  type WorkflowStartSourceReview
} from '../runtime/WorkflowStartFlow'
import { errorMessage } from '../utils/persistentAuthoringProjection'
import type { FullSourceDiff } from './persistentWorkflowAuthoringTypes'

type WorkflowStartDraftResult =
  | {
      kind: 'saved'
      aggregate: WorkflowAuthoringAggregate
      editMode: WorkflowStartContext['editMode']
    }
  | {
      kind: 'review'
      review: WorkflowStartSourceReview
    }

interface WorkflowStartCommands {
  saveDraft: () => Promise<WorkflowStartDraftResult>
  saveReviewedSource: (
    command: Extract<WorkflowStartCommand, { kind: 'save_reviewed_source' }>
  ) => Promise<{
    aggregate: WorkflowAuthoringAggregate
    editMode: WorkflowStartContext['editMode']
  }>
  applyCandidate: (
    candidateHash: string
  ) => Promise<WorkflowAuthoringApplyResponse>
  readApplied: () => Promise<WorkflowAuthoringAggregate>
  openTaskInput: (authority: WorkflowAuthoringAggregate) => Promise<void>
  resolveRemoteConflict: () => void
}

interface PersistentWorkflowStartFlowOptions {
  context: WorkflowStartContext
  hasRemoteInvalidation: () => boolean
  commands: WorkflowStartCommands
  setFullSourceDiff: (diff: FullSourceDiff | null) => void
  setMessage: (message: string) => void
  setError: (message: string | null) => void
  isErrorHandled?: (error: unknown) => boolean
}

/**
 * 把运行入口错误转换为顶部问题文案；已被专用交互接管时不重复展示。
 *
 * @param error 运行入口捕获的原始错误。
 * @param isErrorHandled 判断专用界面是否已经接管错误的函数。
 * @returns 通用错误文案；已接管时返回 null。
 */
export function workflowStartFailureMessage(
  error: unknown,
  isErrorHandled?: (error: unknown) => boolean
): string | null {
  return isErrorHandled?.(error) ? null : errorMessage(error)
}

/**
 * 把工作流（Workflow）单入口状态机连接到既有创作和任务输入接缝。
 *
 * @param options 当前创作上下文、远端失效检查、权威命令与界面写入器。
 * @returns 动态按钮投影、繁忙态和启动/确认/取消命令。
 */
export function usePersistentWorkflowStartFlow({
  context,
  hasRemoteInvalidation,
  commands,
  setFullSourceDiff,
  setMessage,
  setError,
  isErrorHandled
}: PersistentWorkflowStartFlowOptions) {
  // flowRef 只拥有浏览器内短生命周期顺序，不拥有工作流任务（WorkflowTask）。
  const flowRef = useRef(createWorkflowStartFlow())
  const [, setPresentationRevision] = useState(0)
  const [workflowStartBusy, setWorkflowStartBusy] = useState(false)

  /**
   * 强制重新投影状态机的动态按钮文案。
   *
   * @returns 无返回值；只推进本地展示修订。
   */
  const refreshPresentation = (): void => {
    setPresentationRevision((revision) => revision + 1)
  }

  /**
   * 串行执行状态机签发的单条命令，并把权威结果继续交回状态机。
   *
   * @param command 保存、差异确认、应用、精确补读或打开任务输入命令。
   * @returns 自动链路暂停或完成后的 Promise；异常会阻断后续运行。
   */
  const execute = async (command: WorkflowStartCommand): Promise<void> => {
    if (command.kind === 'blocked') throw new Error(command.message)
    if (command.kind === 'review_source') {
      setFullSourceDiff({ ...command.review, applyAfterSave: false })
      setMessage(
        command.review.reason === 'source_normalization'
          ? `草稿已保存；请确认 OS 规范化后的完整 Python，再继续${
              command.intent === 'apply' ? '应用' : '运行'
            }`
          : `请确认画布生成的完整 Python，再继续${
              command.intent === 'apply' ? '应用' : '运行'
            }`
      )
      return
    }
    if (command.kind === 'save_draft') {
      const result = await commands.saveDraft()
      const next = result.kind === 'saved'
        ? flowRef.current.resume({
            kind: 'draft_saved',
            aggregate: result.aggregate,
            editMode: result.editMode
          })
        : flowRef.current.resume({
            kind: 'source_review_required',
            review: result.review
          })
      await execute(next)
      return
    }
    if (command.kind === 'save_reviewed_source') {
      const saved = await commands.saveReviewedSource(command)
      await execute(flowRef.current.resume({
        kind: 'draft_saved',
        aggregate: saved.aggregate,
        editMode: saved.editMode
      }))
      return
    }
    if (command.kind === 'apply_candidate') {
      const response = await commands.applyCandidate(command.candidateHash)
      await execute(flowRef.current.resume({
        kind: 'candidate_applied',
        response
      }))
      return
    }
    if (command.kind === 'read_applied') {
      const aggregate = await commands.readApplied()
      await execute(flowRef.current.resume({
        kind: 'applied_read',
        aggregate
      }))
      return
    }
    if (command.kind === 'application_complete') {
      flowRef.current.cancel()
      refreshPresentation()
      return
    }
    await commands.openTaskInput(command.authority)
    flowRef.current.cancel()
    refreshPresentation()
  }

  /**
   * 在统一繁忙态中执行一次工作流（Workflow）运行入口命令。
   *
   * @param command 状态机签发的第一条或恢复命令。
   * @returns 无返回值；错误关闭本次意图并保留权威已保存事实。
   */
  const run = (command: WorkflowStartCommand): void => {
    setWorkflowStartBusy(true)
    setError(null)
    refreshPresentation()
    void execute(command)
      .catch((startError) => {
        flowRef.current.cancel()
        const failureMessage = workflowStartFailureMessage(
          startError,
          isErrorHandled
        )
        if (failureMessage) setError(failureMessage)
      })
      .finally(() => {
        setWorkflowStartBusy(false)
        refreshPresentation()
      })
  }

  /**
   * 从当前创作状态启动单一运行入口。
   *
   * @returns 无返回值；存在远端失效时只进入冲突处理，不运行旧修订。
   */
  const startIntent = (intent: WorkflowStartIntent): void => {
    if (hasRemoteInvalidation()) {
      flowRef.current.cancel()
      commands.resolveRemoteConflict()
      refreshPresentation()
      return
    }
    const command = flowRef.current.start(context, intent)
    if (command.kind === 'blocked') {
      setError(command.message)
      refreshPresentation()
      return
    }
    run(command)
  }

  /** 保存、校验并应用当前版本，不打开任务输入。 */
  const applyWorkflowVersion = (): void => {
    startIntent('apply')
  }

  /** 开始运行；必要时先自动应用当前版本。 */
  const startWorkflow = (): void => {
    startIntent('run')
  }

  /**
   * 接受运行入口要求的完整源码差异并恢复自动链路。
   *
   * @returns 已处理时为 true；普通仅保存差异返回 false。
   */
  const acceptWorkflowStartReview = (): boolean => {
    if (flowRef.current.snapshot(context).phase !== 'awaiting_source_review') {
      return false
    }
    setFullSourceDiff(null)
    run(flowRef.current.resume({ kind: 'source_review_accepted' }))
    return true
  }

  /**
   * 取消运行入口等待中的源码差异，不撤销已保存或已应用事实。
   *
   * @returns 已处理时为 true；普通仅保存差异返回 false。
   */
  const cancelWorkflowStartReview = (): boolean => {
    const snapshot = flowRef.current.snapshot(context)
    if (snapshot.phase !== 'awaiting_source_review') {
      return false
    }
    flowRef.current.cancel()
    refreshPresentation()
    setMessage(
      snapshot.intent === 'apply'
        ? '已取消本次应用；已保存的工作流源码保持不变'
        : '已取消本次运行；已保存的工作流源码保持不变'
    )
    return true
  }

  return {
    acceptWorkflowStartReview,
    applyWorkflowVersion,
    cancelWorkflowStartReview,
    startWorkflow,
    workflowStartBusy,
    workflowStartPresentation: flowRef.current.snapshot(context)
  }
}
