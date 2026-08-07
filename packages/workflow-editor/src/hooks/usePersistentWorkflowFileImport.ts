import type {
  WorkflowAuthoringGraph,
  WorkflowAuthoringTransformResult
} from '@unilab/services'
import type {
  Dispatch,
  MutableRefObject,
  SetStateAction
} from 'react'

import {
  beautifyPersistentAuthoringGraph,
  parseWorkflowAuthoringGraphImport
} from '../utils/persistentAuthoringGraph'
import {
  authoringProjection,
  type AuthoringLocalSnapshot
} from '../utils/persistentAuthoringSession'
import type { WorkflowEditMode } from '../utils/workflowCanvasPolicy'
import { useWorkflowFileUpload } from './useWorkflowFileUpload'

interface FileImportLocalSnapshot extends AuthoringLocalSnapshot {
  aggregate: import('@unilab/services').WorkflowAuthoringAggregate | null
}

interface PersistentWorkflowFileImportOptions {
  workflowUuid: string
  localState: MutableRefObject<FileImportLocalSnapshot>
  generateCanvasPython: (
    graph: WorkflowAuthoringGraph
  ) => Promise<WorkflowAuthoringTransformResult>
  run: (operation: () => Promise<void>) => Promise<void>
  replaceEditorContent: (content: string) => void
  updateEditorContent: (content: string) => void
  setMode: Dispatch<SetStateAction<WorkflowEditMode>>
  setGraph: Dispatch<SetStateAction<WorkflowAuthoringGraph | null>>
  setCanvasDirty: Dispatch<SetStateAction<boolean>>
  setSelectedNodeUuid: Dispatch<SetStateAction<string | null>>
  setSelectedNodeName: Dispatch<SetStateAction<string>>
  setSelectedNodeNameDirty: Dispatch<SetStateAction<boolean>>
  setPendingPythonImport: Dispatch<SetStateAction<string | null>>
  setMessage: Dispatch<SetStateAction<string>>
  setError: Dispatch<SetStateAction<string | null>>
}

/**
 * 把 Python 或 JSON 文件导入工作流（Workflow）创作缓冲区。
 *
 * @param options 当前本地快照、图转换接口、编辑器接口与状态写入器。
 * @returns 文件选择器引用、导入命令与当前导入状态。
 */
export function usePersistentWorkflowFileImport({
  workflowUuid,
  localState,
  generateCanvasPython,
  run,
  replaceEditorContent,
  updateEditorContent,
  setMode,
  setGraph,
  setCanvasDirty,
  setSelectedNodeUuid,
  setSelectedNodeName,
  setSelectedNodeNameDirty,
  setPendingPythonImport,
  setMessage,
  setError
}: PersistentWorkflowFileImportOptions) {
  return useWorkflowFileUpload({
    /**
     * 校验文件类型与脏状态，并把内容投影为代码或画布草稿。
     *
     * @param input 文件文本与本地文件名。
     * @returns 无返回值；JSON 转换异步结果写回创作状态。
     */
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
      const nextGraph = authoringProjection(current.aggregate).graph
      setMode('code')
      setGraph(nextGraph)
      updateEditorContent(content)
      setCanvasDirty(false)
      setSelectedNodeUuid(null)
      setSelectedNodeName('')
      setSelectedNodeNameDirty(false)
      setPendingPythonImport(fileName)
      setError(null)
      setMessage(`${fileName} 已导入为未保存的 Python 草稿`)
      localState.current = {
        ...current,
        mode: 'code',
        codeDirty: true,
        canvasDirty: false,
        editorValue: content,
        graph: nextGraph,
        selectedNodeUuid: null,
        selectedNodeName: '',
        selectedNodeNameDirty: false
      }
    },
    /**
     * 把文件读取错误写入工作流编辑器错误区。
     *
     * @param uploadError 浏览器文件读取产生的错误消息。
     * @returns 无返回值。
     */
    onError: (uploadError) => setError(uploadError)
  })
}
