import type {
  WorkflowAuthoringCandidate,
  WorkflowRevision,
  WorkflowRuntimePort
} from '@unilab/services'
import type { MutableRefObject } from 'react'

import {
  compilePythonRevision,
  isPythonWorkflowFile,
  parseImportedWorkflow,
  workflowFileSourceUri
} from '../utils/workflowAuthoringOperations'
import { parseCanonicalWorkflow } from '../utils/canonicalWorkflow'
import { useWorkflowFileUpload } from './useWorkflowFileUpload'
import type { WorkflowAuthoringMode } from './workflowAuthoringTypes'

interface WorkflowAuthoringFileImportOptions {
  runtime: WorkflowRuntimePort
  canonicalSource: string
  pythonBaseline: MutableRefObject<string | null>
  resetImportedSource: (options: {
    mode: WorkflowAuthoringMode
    editorContent: string
    canonicalContent: string
    fileName: string | null
    writeBack?: (content: string) => Promise<void>
  }) => void
  setCanonicalSource: (source: string) => void
  setPythonSourceMap: (
    sourceMap: NonNullable<WorkflowAuthoringCandidate['source_map']>
  ) => void
  setMessage: (message: string) => void
  setError: (message: string | null) => void
  withBusy: (operation: () => Promise<void>) => Promise<void>
}

/**
 * 导入旧版 JSON、标准工作流（Workflow）JSON 或 Python 工作流源码。
 *
 * @param options 操作系统（OS）校验端口、当前基础修订与状态写入器。
 * @returns 浏览器文件选择器接口和读取状态。
 */
export function useWorkflowAuthoringFileImport({
  runtime,
  canonicalSource,
  pythonBaseline,
  resetImportedSource,
  setCanonicalSource,
  setPythonSourceMap,
  setMessage,
  setError,
  withBusy
}: WorkflowAuthoringFileImportOptions) {
  return useWorkflowFileUpload({
    /** 解析导入文件并把规范结果安装到当前创作会话。 */
    onLoaded: ({ content, fileName, writeBack }) => {
      void withBusy(async () => {
        if (isPythonWorkflowFile(fileName)) {
          const current = parseCanonicalWorkflow(canonicalSource)
          if (!current.revision) {
            throw new Error(
              current.error || '缺少可供 Python 编译的基础修订版本'
            )
          }
          resetImportedSource({
            mode: 'python',
            editorContent: content,
            canonicalContent: canonicalSource,
            fileName,
            writeBack
          })
          setMessage(`${fileName} 已载入，正在由 OS 编译并投影到 DAG`)
          const validated = await compilePythonRevision(
            runtime,
            current.revision,
            content,
            workflowFileSourceUri(fileName)
          )
          const nextCanonical = JSON.stringify(validated.canonical_ir, null, 2)
          const next = parseCanonicalWorkflow(nextCanonical)
          if (!next.revision) {
            throw new Error(next.error || 'OS 返回了无效的标准工作流修订版本')
          }
          setCanonicalSource(nextCanonical)
          setPythonSourceMap(validated.source_map || [])
          pythonBaseline.current = content
          setMessage(
            `${fileName} 已应用到画布 · ${next.nodes.length} 个节点 · ${
              next.links.length
            } 条控制边`
          )
          return
        }

        const imported = parseImportedWorkflow(content, fileName)
        const canonicalText = JSON.stringify(imported.revision, null, 2)
        resetImportedSource({
          mode: 'json',
          editorContent: canonicalText,
          canonicalContent: canonicalText,
          fileName,
          writeBack
        })
        if (!imported.migrated) {
          setMessage(
            `${fileName} 已导入 · ${imported.nodeCount} 个节点 · ${
              imported.edgeCount
            } 条控制边`
          )
          return
        }

        const warningSuffix = imported.warnings.length > 0
          ? ` · ${imported.warnings.join('；')}`
          : ''
        setMessage(
          `${fileName} 已转换为标准工作流格式（v2），正在由 OS 校验${
            warningSuffix
          }`
        )
        let result
        try {
          result = await runtime.validateWorkflow(imported.revision)
        } catch (validationError) {
          throw new Error(
            `${fileName} 已转换为标准工作流格式（v2），但 OS 校验请求失败：${
              validationError instanceof Error
                ? validationError.message
                : String(validationError)
            }`
          )
        }
        if (!result.valid) {
          setMessage(
            `${fileName} 已转换为标准工作流格式（v2），但 OS 校验未通过${
              warningSuffix
            }`
          )
          setError(
            result.issues
              .map((issue) => `${issue.code}: ${issue.message}`)
              .join('\n')
          )
          return
        }
        setMessage(
          `${fileName} 已转换为标准工作流格式并通过 OS 校验 · ${
            result.nodeCount ?? imported.nodeCount
          } 节点 · ${result.edgeCount ?? imported.edgeCount} 边${warningSuffix}`
        )
      })
    },
    /** 把浏览器文件读取错误投影到创作错误区。 */
    onError: (uploadError) => setError(uploadError)
  })
}
