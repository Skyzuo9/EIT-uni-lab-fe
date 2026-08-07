import type {
  WorkflowAuthoringAggregate,
  WorkflowAuthoringGraph,
  WorkflowAuthoringTransformResult,
  WorkflowRuntimePort
} from '@unilab/services'
import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction
} from 'react'

import { useWorkflowFileUpload } from './useWorkflowFileUpload'
import {
  beautifyPersistentAuthoringGraph,
  parseWorkflowAuthoringGraphImport
} from '../utils/persistentAuthoringGraph'
import {
  findWorkflowSummaries,
  importedWorkflowUuid,
  isWorkflowImportMismatch
} from '../utils/workflowImportMismatch'
import { authoringProjection } from '../utils/persistentAuthoringSession'
import type {
  FullSourceDiff,
  WorkflowImportMismatchPrompt,
  WorkflowPythonImport
} from './persistentWorkflowAuthoringTypes'
import type { WorkflowEditMode } from '../utils/workflowCanvasPolicy'

interface WorkflowImportFlowOptions {
  runtime: WorkflowRuntimePort
  workflowUuid: string
  aggregate: WorkflowAuthoringAggregate | null
  initialPythonImport?: WorkflowPythonImport
  onInitialPythonImportConsumed?: () => void
  onOpenWorkflow?: (
    workflowUuid: string,
    importedPython: WorkflowPythonImport
  ) => void
  updateEditorContent: (content: string) => void
  replaceEditorContent: (content: string) => void
  run: (operation: () => Promise<void>) => Promise<void>
  generateCanvasPython: (
    graph: WorkflowAuthoringGraph
  ) => Promise<WorkflowAuthoringTransformResult>
  restoreAggregate: (
    aggregate: WorkflowAuthoringAggregate,
    message: string
  ) => void
  localState: WorkflowImportLocalStateRef
  setMode: Dispatch<SetStateAction<WorkflowEditMode>>
  setGraph: Dispatch<SetStateAction<WorkflowAuthoringGraph | null>>
  setCanvasDirty: Dispatch<SetStateAction<boolean>>
  setSelectedNodeUuid: Dispatch<SetStateAction<string | null>>
  setSelectedNodeName: Dispatch<SetStateAction<string>>
  setSelectedNodeNameDirty: Dispatch<SetStateAction<boolean>>
  setFullSourceDiff: Dispatch<SetStateAction<FullSourceDiff | null>>
  setError: Dispatch<SetStateAction<string | null>>
  setMessage: Dispatch<SetStateAction<string>>
  clearRemotePending: () => void
}

interface WorkflowImportLocalStateRef {
  current: {
    mode: WorkflowEditMode
    codeDirty: boolean
    canvasDirty: boolean
    editorValue: string
    aggregate: WorkflowAuthoringAggregate | null
    graph: WorkflowAuthoringGraph | null
    selectedNodeUuid: string | null
    selectedNodeName: string
    selectedNodeNameDirty: boolean
  }
}

/**
 * 拥有 Python 导入、跨工作流（Workflow）归属提示与临时交接状态。
 *
 * @param options 当前权威聚合、编辑器写入器、界面状态写入器与导航回调。
 * @returns 导入安装器、拒绝展示器和三个恢复动作。
 */
export function useWorkflowImportFlow({
  runtime,
  workflowUuid,
  aggregate,
  initialPythonImport,
  onInitialPythonImportConsumed,
  onOpenWorkflow,
  updateEditorContent,
  replaceEditorContent,
  run,
  generateCanvasPython,
  restoreAggregate,
  localState,
  setMode,
  setGraph,
  setCanvasDirty,
  setSelectedNodeUuid,
  setSelectedNodeName,
  setSelectedNodeNameDirty,
  setFullSourceDiff,
  setError,
  setMessage,
  clearRemotePending
}: WorkflowImportFlowOptions) {
  const [pendingPythonImport, setPendingPythonImport] =
    useState<string | null>(null)
  const [workflowImportMismatch, setWorkflowImportMismatch] =
    useState<WorkflowImportMismatchPrompt | null>(null)
  const initialPythonImportRef = useRef(initialPythonImport)
  const initialPythonImportConsumedRef = useRef(onInitialPythonImportConsumed)
  initialPythonImportRef.current = initialPythonImport
  initialPythonImportConsumedRef.current = onInitialPythonImportConsumed

  /** 把 Python 文件安装为当前工作流（Workflow）的未保存浏览器内容。 */
  const installPythonImport = useCallback((
    importedPython: WorkflowPythonImport,
    baseAggregate: WorkflowAuthoringAggregate
  ): void => {
    const nextGraph = authoringProjection(baseAggregate).graph
    setMode('code')
    setGraph(nextGraph)
    updateEditorContent(importedPython.content)
    setCanvasDirty(false)
    setSelectedNodeUuid(null)
    setSelectedNodeName('')
    setSelectedNodeNameDirty(false)
    setPendingPythonImport(importedPython.fileName)
    setWorkflowImportMismatch(null)
    setError(null)
    setMessage(
      `${importedPython.fileName} 已导入为未保存的 Python 草稿`
    )
    localState.current = {
      ...localState.current,
      mode: 'code',
      codeDirty: true,
      canvasDirty: false,
      editorValue: importedPython.content,
      aggregate: baseAggregate,
      graph: nextGraph,
      selectedNodeUuid: null,
      selectedNodeName: '',
      selectedNodeNameDirty: false
    }
  }, [
    localState,
    setCanvasDirty,
    setError,
    setGraph,
    setMessage,
    setMode,
    setSelectedNodeName,
    setSelectedNodeNameDirty,
    setSelectedNodeUuid,
    updateEditorContent
  ])

  const fileUpload = useWorkflowFileUpload({
    onLoaded: ({ content, fileName }) => {
      const current = localState.current
      if (!current.aggregate) {
        setError('工作流编辑数据尚未就绪，无法导入文件')
        return
      }
      if (current.codeDirty || current.canvasDirty) {
        setError('请先保存或放弃当前未保存修改，再导入文件')
        return
      }
      const lowerFileName = fileName.toLowerCase()
      if (lowerFileName.endsWith('.json')) {
        setPendingPythonImport(null)
        void run(async () => {
          const importedGraph = parseWorkflowAuthoringGraphImport(
            content,
            workflowUuid
          )
          const generated = await generateCanvasPython(importedGraph)
          if (!generated.graph || !generated.normalized_python_source) {
            throw new Error('OS 未返回完整的画布与 Python 数据')
          }
          const beautifiedGraph = beautifyPersistentAuthoringGraph(
            generated.graph
          )
          setMode('canvas')
          setGraph(beautifiedGraph)
          replaceEditorContent(generated.normalized_python_source)
          setCanvasDirty(true)
          setSelectedNodeUuid(null)
          setSelectedNodeName('')
          setSelectedNodeNameDirty(false)
          setError(null)
          setMessage(
            `${fileName} 已导入到画布；保存前将检查完整 Python 差异`
          )
          localState.current = {
            ...current,
            mode: 'canvas',
            codeDirty: false,
            canvasDirty: true,
            editorValue: generated.normalized_python_source,
            graph: beautifiedGraph,
            selectedNodeUuid: null,
            selectedNodeName: '',
            selectedNodeNameDirty: false
          }
        })
        return
      }
      if (!lowerFileName.endsWith('.py')) {
        setError('当前入口只接受 .py 或 .json 工作流文件')
        return
      }
      installPythonImport({ content, fileName }, current.aggregate)
    },
    onError: (uploadError) => setError(uploadError)
  })

  /** 在目标工作流（Workflow）权威聚合加载后消费一次临时 Python 交接。 */
  const consumeInitialPythonImport = useCallback((
    baseAggregate: WorkflowAuthoringAggregate
  ): void => {
    const importedPython = initialPythonImportRef.current
    if (!importedPython) return
    installPythonImport(importedPython, baseAggregate)
    initialPythonImportRef.current = undefined
    initialPythonImportConsumedRef.current?.()
  }, [installPythonImport])

  /** 把 OS 跨工作流源码拒绝转换为一次可恢复的归属提示。 */
  const presentWorkflowImportMismatch = useCallback(async (
    saveError: unknown,
    pythonSource: string
  ): Promise<boolean> => {
    if (!isWorkflowImportMismatch(saveError)) return false
    const importedUuid = importedWorkflowUuid(
      saveError,
      workflowUuid,
      pythonSource
    )
    let summaries: Awaited<ReturnType<typeof findWorkflowSummaries>> =
      new Map()
    try {
      summaries = await findWorkflowSummaries(
        runtime,
        importedUuid ? [workflowUuid, importedUuid] : [workflowUuid]
      )
    } catch {
      // 名称补充失败不应遮蔽可恢复的导入提示。
    }
    const currentSummary = summaries.get(workflowUuid.toLowerCase())
    const importedSummary = importedUuid
      ? summaries.get(importedUuid.toLowerCase())
      : undefined
    setFullSourceDiff(null)
    setWorkflowImportMismatch({
      currentWorkflowUuid: workflowUuid,
      currentWorkflowName: currentSummary?.name ?? null,
      importedWorkflowUuid: importedUuid,
      importedWorkflowName: importedSummary?.name ?? null,
      canOpenImportedWorkflow: Boolean(importedSummary && onOpenWorkflow),
      importedFileName: pendingPythonImport,
      importedPythonSource: pythonSource
    })
    setError(null)
    setMessage('导入内容尚未保存；请选择接下来要编辑的工作流')
    return true
  }, [
    pendingPythonImport,
    runtime,
    setError,
    setFullSourceDiff,
    setMessage,
    onOpenWorkflow,
    workflowUuid
  ])

  /** 保留导入内容并关闭归属提示，让用户继续在当前编辑器修改。 */
  const continueEditingWorkflowImport = (): void => {
    setWorkflowImportMismatch(null)
    setMessage('导入内容仍未保存；请修改文件中的工作流编号后再保存')
  }

  /** 放弃未保存的导入内容，并恢复当前工作流（Workflow）的权威源码。 */
  const discardWorkflowImport = (): void => {
    if (!aggregate) return
    setWorkflowImportMismatch(null)
    setPendingPythonImport(null)
    setFullSourceDiff(null)
    clearRemotePending()
    restoreAggregate(aggregate, '已放弃导入，当前工作流没有发生变化')
  }

  /** 打开导入文件关联的工作流（Workflow），并交接未保存源码。 */
  const openImportedWorkflow = (): void => {
    const importedUuid = workflowImportMismatch?.importedWorkflowUuid
    if (
      !importedUuid ||
      !workflowImportMismatch.canOpenImportedWorkflow ||
      !onOpenWorkflow
    ) return
    const prompt = workflowImportMismatch
    setWorkflowImportMismatch(null)
    onOpenWorkflow(importedUuid, {
      fileName: prompt.importedFileName || '导入的工作流.py',
      content: prompt.importedPythonSource
    })
  }

  return {
    consumeInitialPythonImport,
    continueEditingWorkflowImport,
    discardWorkflowImport,
    fileUpload,
    installPythonImport,
    openImportedWorkflow,
    pendingPythonImport,
    presentWorkflowImportMismatch,
    setPendingPythonImport,
    workflowImportMismatch
  }
}
