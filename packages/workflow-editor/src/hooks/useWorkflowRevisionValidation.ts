import type { WorkflowRevision, WorkflowRuntimePort } from '@unilab/services'
import { useCallback } from 'react'

interface WorkflowRevisionValidationOptions {
  runtime: WorkflowRuntimePort
  resolveRevision: () => Promise<WorkflowRevision>
  setError: (message: string | null) => void
  setMessage: (message: string) => void
}

/**
 * 建立由操作系统（OS）校验当前工作流（Workflow）修订版本的命令。
 *
 * @param options 修订解析器、运行时端口与反馈写入器。
 * @returns 通过校验的修订版本；校验失败时返回空值。
 */
export function useWorkflowRevisionValidation({
  runtime,
  resolveRevision,
  setError,
  setMessage
}: WorkflowRevisionValidationOptions): () => Promise<WorkflowRevision | null> {
  return useCallback(async () => {
    const revision = await resolveRevision()
    const result = await runtime.validateWorkflow(revision)
    if (!result.valid) {
      setError(
        result.issues
          .map((issue) => `${issue.code}: ${issue.message}`)
          .join('\n')
      )
      setMessage('校验未通过')
      return null
    }
    setMessage(
      `校验通过 · ${
        result.nodeCount ?? revision.invocations.length
      } 节点 · ${
        result.edgeCount ?? revision.control_edges.length
      } 边`
    )
    return revision
  }, [resolveRevision, runtime, setError, setMessage])
}
