import type {
  WorkflowAuthoringCandidate,
  WorkflowRevision,
  WorkflowRuntimePort
} from '@unilab/services'
import { useEffect, type MutableRefObject } from 'react'

import { parseCanonicalWorkflow } from '../utils/canonicalWorkflow'
import {
  compilePythonRevision,
  workflowSourceUri
} from '../utils/workflowAuthoringOperations'
import type { WorkflowAuthoringMode } from './workflowAuthoringTypes'

interface WorkflowPythonAutoProjectionOptions {
  runtime: WorkflowRuntimePort
  authoringMode: WorkflowAuthoringMode
  canonicalSource: string
  source: string
  pythonBaseline: MutableRefObject<string | null>
  onRevisionRemapped: (
    previous: WorkflowRevision,
    next: WorkflowRevision
  ) => void
  setPythonSourceMap: (
    sourceMap: NonNullable<WorkflowAuthoringCandidate['source_map']>
  ) => void
  setCanonicalSource: (source: string) => void
  setMessage: (message: string) => void
}

/**
 * 将通过操作系统（OS）编译的 Python 草稿自动投影回工作流（Workflow）画布。
 *
 * @param options 当前源码、基础修订以及投影结果写入器。
 */
export function useWorkflowPythonAutoProjection({
  runtime,
  authoringMode,
  canonicalSource,
  source,
  pythonBaseline,
  onRevisionRemapped,
  setPythonSourceMap,
  setCanonicalSource,
  setMessage
}: WorkflowPythonAutoProjectionOptions): void {
  useEffect(() => {
    if (
      authoringMode !== 'python' ||
      !source.trim() ||
      source === pythonBaseline.current
    ) {
      return
    }
    const current = parseCanonicalWorkflow(canonicalSource)
    if (!current.revision) return
    const currentRevision = current.revision
    let cancelled = false
    const timer = globalThis.setTimeout(() => {
      if (source === pythonBaseline.current) return
      void compilePythonRevision(
        runtime,
        currentRevision,
        source,
        workflowSourceUri(currentRevision.workflow_id)
      )
        .then((validated) => {
          if (cancelled) return
          const nextCanonical = JSON.stringify(
            validated.canonical_ir,
            null,
            2
          )
          const next = parseCanonicalWorkflow(nextCanonical)
          if (!next.revision) {
            throw new Error(
              next.error || 'OS 返回了无效的标准工作流修订版本'
            )
          }
          onRevisionRemapped(currentRevision, next.revision)
          setPythonSourceMap(validated.source_map || [])
          setCanonicalSource(nextCanonical)
          pythonBaseline.current = source
          setMessage(
            `Python 已自动应用到画布 · ${next.nodes.length} 节点 · ${
              next.links.length
            } 边`
          )
        })
        .catch(() => {
          if (!cancelled) {
            setMessage(
              'Python 草稿尚未通过 OS 编译，画布保留最近一次有效版本'
            )
          }
        })
    }, 700)

    return () => {
      cancelled = true
      globalThis.clearTimeout(timer)
    }
  }, [
    authoringMode,
    canonicalSource,
    onRevisionRemapped,
    pythonBaseline,
    runtime,
    setCanonicalSource,
    setMessage,
    setPythonSourceMap,
    source
  ])
}
