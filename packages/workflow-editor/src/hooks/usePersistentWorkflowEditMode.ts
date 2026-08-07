import type {
  WorkflowAuthoringAggregate,
  WorkflowAuthoringGraph,
  WorkflowAuthoringTransformResult
} from '@unilab/services'
import {
  useCallback,
  type Dispatch,
  type SetStateAction
} from 'react'

import { beautifyPersistentAuthoringGraph } from '../utils/persistentAuthoringGraph'
import {
  workflowAuthoringModeSwitchDecision,
  type WorkflowEditMode
} from '../utils/workflowCanvasPolicy'
import {
  authoringProjection,
  authoringStateMessage
} from '../utils/persistentAuthoringSession'
import { authoritativePython } from '../utils/persistentAuthoringProjection'

interface PersistentWorkflowEditModeOptions {
  aggregate: WorkflowAuthoringAggregate | null
  mode: WorkflowEditMode
  dirty: boolean
  pendingMode: WorkflowEditMode | null
  generateCanvasPython: (
    graph: WorkflowAuthoringGraph
  ) => Promise<WorkflowAuthoringTransformResult>
  run: (operation: () => Promise<void>) => Promise<void>
  replaceEditorContent: (content: string) => void
  setGraph: Dispatch<SetStateAction<WorkflowAuthoringGraph | null>>
  setCanvasDirty: Dispatch<SetStateAction<boolean>>
  setSelectedNodeUuid: Dispatch<SetStateAction<string | null>>
  setSelectedNodeName: Dispatch<SetStateAction<string>>
  setSelectedNodeNameDirty: Dispatch<SetStateAction<boolean>>
  setPendingPythonImport: Dispatch<SetStateAction<string | null>>
  setPendingMode: Dispatch<SetStateAction<WorkflowEditMode | null>>
  setMode: Dispatch<SetStateAction<WorkflowEditMode>>
  setMessage: Dispatch<SetStateAction<string>>
}

/**
 * 维护工作流代码与画布两种互斥编辑模式的切换事务。
 *
 * @param options 当前权威聚合、脏状态、转换命令和界面状态写入器。
 * @returns 请求切换和放弃本地修改后切换的用户命令。
 */
export function usePersistentWorkflowEditMode({
  aggregate,
  mode,
  dirty,
  pendingMode,
  generateCanvasPython,
  run,
  replaceEditorContent,
  setGraph,
  setCanvasDirty,
  setSelectedNodeUuid,
  setSelectedNodeName,
  setSelectedNodeNameDirty,
  setPendingPythonImport,
  setPendingMode,
  setMode,
  setMessage
}: PersistentWorkflowEditModeOptions) {
  /**
   * 切换单编辑权模式，并在进入画布模式时建立美化投影。
   *
   * @param nextMode 目标编辑模式。
   * @returns 模式与 OS 投影同步完成后的 Promise。
   */
  const enterMode = useCallback(async (
    nextMode: WorkflowEditMode
  ): Promise<void> => {
    if (!aggregate) throw new Error('工作流编辑数据尚未就绪')
    setPendingPythonImport(null)
    if (nextMode === 'canvas') {
      const sourceGraph = authoringProjection(aggregate).graph
      const generated = await generateCanvasPython(sourceGraph)
      setGraph(beautifyPersistentAuthoringGraph(
        generated.graph || sourceGraph
      ))
      replaceEditorContent(generated.normalized_python_source as string)
      setCanvasDirty(false)
      setSelectedNodeUuid(null)
      setSelectedNodeName('')
      setSelectedNodeNameDirty(false)
      setMode('canvas')
      setMessage('画布模式：Python 是 OS 生成的只读投影')
      return
    }
    setGraph(authoringProjection(aggregate).graph)
    replaceEditorContent(authoritativePython(aggregate))
    setCanvasDirty(false)
    setSelectedNodeUuid(null)
    setSelectedNodeName('')
    setSelectedNodeNameDirty(false)
    setMode('code')
    setMessage(authoringStateMessage(aggregate))
  }, [
    aggregate,
    generateCanvasPython,
    replaceEditorContent,
    setCanvasDirty,
    setGraph,
    setMessage,
    setMode,
    setPendingPythonImport,
    setSelectedNodeName,
    setSelectedNodeNameDirty,
    setSelectedNodeUuid
  ])

  /**
   * 请求编辑模式切换，并在当前表面有修改时打开确认流程。
   *
   * @param nextMode 用户请求的目标模式。
   * @returns 无返回值；需要确认时只冻结目标模式。
   */
  const requestMode = (nextMode: WorkflowEditMode): void => {
    const decision = workflowAuthoringModeSwitchDecision({
      currentMode: mode,
      requestedMode: nextMode,
      activeSurfaceDirty: dirty
    })
    if (decision === 'stay') return
    if (decision === 'confirm_dirty') {
      setPendingMode(nextMode)
      return
    }
    void run(() => enterMode(nextMode))
  }

  /**
   * 放弃当前本地修改，并进入已经确认的目标编辑模式。
   *
   * @returns 无返回值；没有待确认目标或权威聚合时保持现状。
   */
  const discardAndSwitch = (): void => {
    if (!pendingMode || !aggregate) return
    const nextMode = pendingMode
    setPendingMode(null)
    replaceEditorContent(authoritativePython(aggregate))
    setGraph(authoringProjection(aggregate).graph)
    setCanvasDirty(false)
    setSelectedNodeUuid(null)
    setSelectedNodeName('')
    setSelectedNodeNameDirty(false)
    setPendingPythonImport(null)
    void run(() => enterMode(nextMode))
  }

  return { requestMode, discardAndSwitch }
}
