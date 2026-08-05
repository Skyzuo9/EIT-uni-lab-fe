import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction
} from 'react'
import { useCodeMirror } from '@unilab/code-editor'
import type {
  WorkflowAuthoringCandidate,
  WorkflowRevision,
  WorkflowRuntimePort
} from '@unilab/services'

import {
  CONTROL_DAG_JSON,
  parseCanonicalWorkflow
} from '../utils/canonicalWorkflow'
import { beautifyWorkflowRevision } from '../utils/dagLayout'
import {
  workflowDagLayoutStrategyLabel,
  type WorkflowDagLayoutStrategy
} from '../utils/workflowDagLayoutStrategy'
import {
  compilePythonRevision,
  formatAuthoringDiagnostics,
  isPythonWorkflowFile,
  parseImportedWorkflow,
  persistActiveWorkflowId,
  projectWorkflowToPython,
  readActiveWorkflowId,
  saveWorkflowRevision,
  workflowFileSourceUri,
  workflowSourceUri
} from '../utils/workflowAuthoringOperations'
import { useWorkflowDownload } from './useWorkflowDownload'
import { useWorkflowFileUpload } from './useWorkflowFileUpload'

export type WorkflowAuthoringMode = 'json' | 'python'

export interface WorkflowAuthoringSnapshot {
  authoringMode: WorkflowAuthoringMode
  sourceFileName: string | null
  sourceFileWriter: ((content: string) => Promise<void>) | null
  editorValue: string
  editorBaseline: string
  canonicalSource: string
  pythonBaseline: string | null
  pythonSourceMap: NonNullable<WorkflowAuthoringCandidate['source_map']>
  layoutDirty: boolean
}

interface UseWorkflowAuthoringParams {
  runtime: WorkflowRuntimePort
  activeWorkflowStorageKey?: string
  initial: WorkflowAuthoringSnapshot | null
  compactPane: 'code' | 'dag'
  onRequestCodePane: () => void
  onResetRun: () => void
  onRevisionRemapped: (
    previous: WorkflowRevision,
    next: WorkflowRevision
  ) => void
  onUnsavedChangesChange?: (hasUnsavedChanges: boolean) => void
  setMessage: Dispatch<SetStateAction<string>>
  setError: Dispatch<SetStateAction<string | null>>
  withBusy: (operation: () => Promise<void>) => Promise<void>
}

export function useWorkflowAuthoring({
  runtime,
  activeWorkflowStorageKey,
  initial,
  compactPane,
  onRequestCodePane,
  onResetRun,
  onRevisionRemapped,
  onUnsavedChangesChange,
  setMessage,
  setError,
  withBusy
}: UseWorkflowAuthoringParams) {
  const [authoringMode, setAuthoringMode] =
    useState<WorkflowAuthoringMode>(initial?.authoringMode ?? 'json')
  const [sourceFileName, setSourceFileName] = useState<string | null>(
    initial?.sourceFileName ?? null
  )
  const [saveFilePromptOpen, setSaveFilePromptOpen] = useState(false)
  const saveFileButtonRef = useRef<HTMLButtonElement>(null)
  const saveRevisionButtonRef = useRef<HTMLButtonElement>(null)
  const workflowDownload = useWorkflowDownload()
  const sourceFileWriter = useRef<
    ((content: string) => Promise<void>) | null
  >(initial?.sourceFileWriter ?? null)
  const editor = useCodeMirror(
    initial?.editorValue ?? CONTROL_DAG_JSON,
    authoringMode,
    initial?.editorBaseline
  )
  const [canonicalSource, setCanonicalSource] = useState(
    initial?.canonicalSource ?? CONTROL_DAG_JSON
  )
  const pythonBaseline = useRef<string | null>(
    initial?.pythonBaseline ?? null
  )
  const [pythonSourceMap, setPythonSourceMap] = useState<
    NonNullable<WorkflowAuthoringCandidate['source_map']>
  >(initial?.pythonSourceMap ?? [])
  const [layoutDirty, setLayoutDirty] = useState(
    initial?.layoutDirty ?? false
  )
  const parsed = useMemo(() => {
    const source =
      authoringMode === 'json' ? editor.value : canonicalSource
    return parseCanonicalWorkflow(source)
  }, [authoringMode, canonicalSource, editor.value])

  useEffect(() => {
    onUnsavedChangesChange?.(editor.isDirty || layoutDirty)
  }, [editor.isDirty, layoutDirty, onUnsavedChangesChange])

  useEffect(
    () => () => {
      onUnsavedChangesChange?.(false)
    },
    [onUnsavedChangesChange]
  )

  useEffect(() => {
    if (!editor.isDirty && !layoutDirty) return
    const preventUnsavedUnload = (event: BeforeUnloadEvent): void => {
      event.preventDefault()
      event.returnValue = ''
    }
    globalThis.addEventListener('beforeunload', preventUnsavedUnload)
    return () => {
      globalThis.removeEventListener('beforeunload', preventUnsavedUnload)
    }
  }, [editor.isDirty, layoutDirty])

  useEffect(() => {
    if (!saveFilePromptOpen) return
    const preferredButton = sourceFileWriter.current
      ? saveFileButtonRef.current
      : saveRevisionButtonRef.current
    preferredButton?.focus()
  }, [saveFilePromptOpen])

  const resetImportedSource = useCallback((options: {
    mode: WorkflowAuthoringMode
    editorContent: string
    canonicalContent: string
    fileName: string | null
    writeBack?: (content: string) => Promise<void>
  }): void => {
    setAuthoringMode(options.mode)
    editor.replaceContent(options.editorContent)
    setCanonicalSource(options.canonicalContent)
    setSourceFileName(options.fileName)
    sourceFileWriter.current = options.writeBack || null
    setSaveFilePromptOpen(false)
    setPythonSourceMap([])
    pythonBaseline.current = null
    setLayoutDirty(false)
    onResetRun()
  }, [editor.replaceContent, onResetRun])

  useEffect(() => {
    if (initial) return
    const workflowId = readActiveWorkflowId(activeWorkflowStorageKey)
    if (!workflowId) return

    let active = true
    void withBusy(async () => {
      try {
        const document = await runtime.getWorkflow(workflowId)
        if (!active) return
        const canonicalText = JSON.stringify(
          document.revision.canonical,
          null,
          2
        )
        resetImportedSource({
          mode: 'json',
          editorContent: canonicalText,
          canonicalContent: canonicalText,
          fileName: null
        })
        setMessage(`已恢复修订版本 ${document.revision.id}`)
      } catch (restoreError) {
        if (!active) return
        throw new Error(
          `无法恢复最近保存的工作流 ${workflowId}：${
            restoreError instanceof Error
              ? restoreError.message
              : String(restoreError)
          }`
        )
      }
    })
    return () => {
      active = false
    }
  }, [
    activeWorkflowStorageKey,
    initial,
    resetImportedSource,
    runtime,
    setMessage,
    withBusy
  ])

  const projectToPython = useCallback(
    (revision: WorkflowRevision) =>
      projectWorkflowToPython(runtime, revision),
    [runtime]
  )

  const resolveRevision = useCallback(async (
    forcePythonCompile = false
  ): Promise<WorkflowRevision> => {
    if (authoringMode === 'json') {
      const current = parseCanonicalWorkflow(editor.value)
      if (!current.revision) {
        throw new Error(current.error || '标准工作流 DAG 无法解析')
      }
      setCanonicalSource(editor.value)
      return current.revision
    }

    const current = parseCanonicalWorkflow(canonicalSource)
    if (!current.revision) {
      throw new Error(
        current.error || '缺少可供 Python 编译的基础修订版本'
      )
    }
    if (!forcePythonCompile && editor.value === pythonBaseline.current) {
      return current.revision
    }

    const validated = await compilePythonRevision(
      runtime,
      current.revision,
      editor.value,
      workflowSourceUri(current.revision.workflow_id)
    )
    const nextCanonical = JSON.stringify(validated.canonical_ir, null, 2)
    const next = parseCanonicalWorkflow(nextCanonical)
    if (!next.revision) {
      throw new Error(
        next.error || 'OS 返回了无效的标准工作流修订版本'
      )
    }
    onRevisionRemapped(current.revision, next.revision)
    setPythonSourceMap(validated.source_map || [])
    setCanonicalSource(nextCanonical)
    pythonBaseline.current = editor.value
    setMessage(
      `Python 已编译 · ${next.nodes.length} 节点 · ${next.links.length} 边`
    )
    return next.revision
  }, [
    authoringMode,
    canonicalSource,
    editor.value,
    onRevisionRemapped,
    runtime,
    setMessage
  ])

  const fileUpload = useWorkflowFileUpload({
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
          } 节点 · ${result.edgeCount ?? imported.edgeCount} 边${
            warningSuffix
          }`
        )
      })
    },
    onError: (uploadError) => setError(uploadError)
  })

  useEffect(() => {
    if (
      authoringMode !== 'python' ||
      !editor.value.trim() ||
      editor.value === pythonBaseline.current
    ) {
      return
    }
    const source = editor.value
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
    editor.value,
    onRevisionRemapped,
    runtime,
    setMessage
  ])

  const validateRevision = useCallback(async (
  ): Promise<WorkflowRevision | null> => {
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

  /**
   * 按选定策略更新 Canonical 修订版本中的节点布局坐标。
   *
   * @param strategy 用户选择的工作流（Workflow）画布布局策略。
   * @returns 无返回值；结果写入当前未保存修订版本。
   */
  const beautifyLayout = useCallback((
    strategy: WorkflowDagLayoutStrategy
  ): void => {
    if (!parsed.revision || parsed.nodes.length === 0) return
    const nextRevision = beautifyWorkflowRevision(
      parsed.revision,
      parsed.nodes,
      parsed.links,
      strategy
    )
    const nextCanonical = JSON.stringify(nextRevision, null, 2)
    setCanonicalSource(nextCanonical)
    if (authoringMode === 'json') {
      editor.updateContent(nextCanonical)
    }
    setLayoutDirty(true)
    onResetRun()
    setMessage(
      `已应用${workflowDagLayoutStrategyLabel(strategy)}布局；` +
      '保存修订版本后将写入工作流'
    )
  }, [
    authoringMode,
    editor.updateContent,
    onResetRun,
    parsed.links,
    parsed.nodes,
    parsed.revision,
    setMessage
  ])

  const switchAuthoringMode = (
    nextMode: WorkflowAuthoringMode
  ): void => {
    if (nextMode === authoringMode) return
    void withBusy(async () => {
      if (nextMode === 'python') {
        const revision = await resolveRevision()
        const { candidate, diagnostics } = await projectToPython(revision)
        setCanonicalSource(JSON.stringify(candidate.canonical_ir, null, 2))
        setPythonSourceMap(candidate.source_map || [])
        pythonBaseline.current = candidate.python_source
        setAuthoringMode('python')
        if (compactPane !== 'code') onRequestCodePane()
        editor.replaceContent(candidate.python_source)
        const blockingDiagnostics = diagnostics.filter(
          (item) => item.severity === 'error'
        )
        if (blockingDiagnostics.length > 0) {
          setError(formatAuthoringDiagnostics(blockingDiagnostics))
          setMessage(
            '已生成 Python，但存在校验问题，需在保存或运行前修正'
          )
        } else {
          setMessage(
            '已由 OS 生成 Python 草稿；修改后将自动编译并应用到画布'
          )
        }
        return
      }

      const revision = await resolveRevision()
      const nextCanonical = JSON.stringify(revision, null, 2)
      setCanonicalSource(nextCanonical)
      setAuthoringMode('json')
      editor.replaceContent(nextCanonical)
      setMessage('Python 已通过 OS 编译并切换为标准 JSON')
    })
  }

  const saveRevision = (saveFile: boolean): void => {
    void withBusy(async () => {
      const revision = await validateRevision()
      if (!revision) return
      const saved = await saveWorkflowRevision({
        runtime,
        revision,
        activeWorkflowStorageKey,
        saveFile,
        sourceFileName,
        sourceFileWriter: sourceFileWriter.current,
        authoringMode,
        editorValue: editor.value,
        pythonBaseline: pythonBaseline.current,
        download: workflowDownload.download
      })
      setCanonicalSource(saved.canonical)
      editor.markSaved()
      setLayoutDirty(false)
      setMessage(saved.message)
    })
  }

  const save = (): void => {
    if (sourceFileName) {
      setSaveFilePromptOpen(true)
    } else {
      saveRevision(false)
    }
  }

  const load = (): void => {
    void withBusy(async () => {
      const document = await runtime.getWorkflow('control-demo')
      const revision = document.revision.canonical
      persistActiveWorkflowId(
        activeWorkflowStorageKey,
        revision.workflow_id
      )
      setSourceFileName(null)
      sourceFileWriter.current = null
      setSaveFilePromptOpen(false)
      setLayoutDirty(false)
      if (authoringMode === 'python') {
        const { candidate } = await projectToPython(revision)
        setCanonicalSource(JSON.stringify(candidate.canonical_ir, null, 2))
        setPythonSourceMap(candidate.source_map || [])
        pythonBaseline.current = candidate.python_source
        editor.replaceContent(candidate.python_source)
      } else {
        const nextCanonical = JSON.stringify(revision, null, 2)
        setCanonicalSource(nextCanonical)
        editor.replaceContent(nextCanonical)
      }
      setMessage(`已从 OS 载入修订版本 ${document.revision.id}`)
    })
  }

  const sourceRunnable =
    authoringMode !== 'json' || !parsed.error
  const editorTitle =
    sourceFileName &&
    (
      (authoringMode === 'python' &&
        isPythonWorkflowFile(sourceFileName)) ||
      (authoringMode === 'json' &&
        !isPythonWorkflowFile(sourceFileName))
    )
      ? sourceFileName
      : authoringMode === 'json'
        ? `${parsed.revision?.workflow_id || 'workflow'}.revision.json`
        : `${parsed.revision?.workflow_id || 'workflow'}.py`

  return {
    authoringMode,
    sourceFileName,
    saveFilePromptOpen,
    saveFileButtonRef,
    saveRevisionButtonRef,
    canWriteOriginal: Boolean(sourceFileWriter.current),
    editor,
    canonicalSource,
    pythonSourceMap,
    parsed,
    fileUpload,
    sourceRunnable,
    canBeautify:
      Boolean(parsed.revision && parsed.nodes.length > 0) &&
      !(
        authoringMode === 'python' &&
        editor.value !== pythonBaseline.current
      ),
    editorTitle,
    pythonHasUnappliedChanges:
      authoringMode === 'python' &&
      editor.value !== pythonBaseline.current,
    switchAuthoringMode,
    load,
    applyPython: () =>
      void withBusy(async () => {
        await resolveRevision(true)
      }),
    validate: () =>
      void withBusy(async () => {
        await validateRevision()
      }),
    validateRevision,
    beautifyLayout,
    save,
    cancelSavePrompt: () => setSaveFilePromptOpen(false),
    resolveFileSavePrompt: (saveFile: boolean) => {
      setSaveFilePromptOpen(false)
      saveRevision(saveFile)
    },
    snapshot: {
      authoringMode,
      sourceFileName,
      sourceFileWriter: sourceFileWriter.current,
      editorValue: editor.value,
      editorBaseline: editor.baseline,
      canonicalSource,
      pythonBaseline: pythonBaseline.current,
      pythonSourceMap,
      layoutDirty
    } satisfies WorkflowAuthoringSnapshot
  }
}
