import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import {
  type CodeLineMarker,
  useCodeMirror
} from '@unilab/code-editor'
import { useResizableSplit } from '@unilab/app-shell'
import type {
  WorkflowAuthoringCandidate,
  WorkflowAuthoringDiagnostic,
  WorkflowAuthoringResult,
  WorkflowDebugCommand,
  WorkflowRevision,
  WorkflowRun,
  WorkflowRunEvent,
  WorkflowRunNode,
  WorkflowRuntimePort
} from '@unilab/services'
import {
  CONTROL_DAG_JSON,
  createWorkflowExecutionScope,
  parseCanonicalWorkflow,
  remapWorkflowBreakpoints,
  remapWorkflowNodeId
} from '../utils/canonicalWorkflow'
import { migrateCloudWorkflowJson } from '../utils/parseWorkflowJson'
import {
  visibleWorkflowDebugControls,
  workflowDebugControls
} from '../utils/debugControls'
import { useWorkflowDownload } from '../hooks/useWorkflowDownload'
import { useWorkflowFileUpload } from '../hooks/useWorkflowFileUpload'
import { WorkflowDebugger } from './WorkflowDebugger'
import { WorkflowOutput } from './WorkflowOutput'
import { WorkflowSavePrompt } from './WorkflowSavePrompt'
import { useWorkflowSessionStore } from './WorkflowSessionProvider'
import { WorkflowStage } from './WorkflowStage'
import { WorkflowToolbar } from './WorkflowToolbar'
import styles from './workflow.module.scss'

export interface WorkflowStepFocus {
  stepId: string
  args: Readonly<Record<string, unknown>>
}

export interface WorkflowPanelProps {
  runtime: WorkflowRuntimePort
  activeWorkflowStorageKey?: string
  onStepFocus?: (focus: WorkflowStepFocus) => void
  onUnsavedChangesChange?: (hasUnsavedChanges: boolean) => void
}

const TERMINAL_RUN_STATES = new Set(['completed', 'failed', 'cancelled'])
type AuthoringMode = 'json' | 'python'
type RunMode = 'run' | 'debug'
type OutputTab = 'nodes' | 'events' | 'errors'
type CompactPane = 'code' | 'dag'

interface WorkflowPanelSession {
  authoringMode: AuthoringMode
  runMode: RunMode
  legendOpen: boolean
  outputExpanded: boolean
  outputTab: OutputTab
  compactPane: CompactPane
  sourceFileName: string | null
  sourceFileWriter: ((content: string) => Promise<void>) | null
  editorValue: string
  editorBaseline: string
  canonicalSource: string
  pythonBaseline: string | null
  pythonSourceMap: NonNullable<WorkflowAuthoringCandidate['source_map']>
  run: WorkflowRun | null
  runNodes: WorkflowRunNode[]
  events: WorkflowRunEvent[]
  breakpoints: string[]
  startNodeId: string | null
  selectedNodeId: string | null
  message: string
  error: string | null
  latestSequence: number
}

export default function WorkflowPanel({
  runtime,
  activeWorkflowStorageKey,
  onStepFocus,
  onUnsavedChangesChange
}: WorkflowPanelProps): React.JSX.Element {
  const sessionStore = useWorkflowSessionStore()
  const sessionKey =
    activeWorkflowStorageKey || 'unilab.workflow.active.default.v1'
  const [initialSession] = useState<WorkflowPanelSession | null>(
    () => sessionStore?.read<WorkflowPanelSession>(sessionKey) ?? null
  )
  const [authoringMode, setAuthoringMode] = useState<AuthoringMode>(
    initialSession?.authoringMode ?? 'json'
  )
  const [runMode, setRunMode] = useState<RunMode>(
    initialSession?.runMode ?? 'run'
  )
  const [legendOpen, setLegendOpen] = useState(
    initialSession?.legendOpen ?? false
  )
  const [outputExpanded, setOutputExpanded] = useState(
    initialSession?.outputExpanded ?? true
  )
  const [outputTab, setOutputTab] = useState<OutputTab>(
    initialSession?.outputTab ?? 'nodes'
  )
  const [compactPane, setCompactPane] = useState<CompactPane>(
    initialSession?.compactPane ?? 'dag'
  )
  const [sourceFileName, setSourceFileName] = useState<string | null>(
    initialSession?.sourceFileName ?? null
  )
  const [saveFilePromptOpen, setSaveFilePromptOpen] = useState(false)
  const saveFileButtonRef = useRef<HTMLButtonElement>(null)
  const saveRevisionButtonRef = useRef<HTMLButtonElement>(null)
  const workflowDownload = useWorkflowDownload()
  const sourceFileWriter = useRef<
    ((content: string) => Promise<void>) | null
  >(initialSession?.sourceFileWriter ?? null)
  const editor = useCodeMirror(
    initialSession?.editorValue ?? CONTROL_DAG_JSON,
    authoringMode,
    initialSession?.editorBaseline
  )
  const [canonicalSource, setCanonicalSource] = useState(
    initialSession?.canonicalSource ?? CONTROL_DAG_JSON
  )
  const pythonBaseline = useRef<string | null>(
    initialSession?.pythonBaseline ?? null
  )
  const [pythonSourceMap, setPythonSourceMap] = useState<
    NonNullable<WorkflowAuthoringCandidate['source_map']>
  >(initialSession?.pythonSourceMap ?? [])
  const parsed = useMemo(() => {
    const source = authoringMode === 'json' ? editor.value : canonicalSource
    return parseCanonicalWorkflow(source)
  }, [authoringMode, canonicalSource, editor.value])
  const [run, setRun] = useState<WorkflowRun | null>(
    initialSession?.run ?? null
  )
  const [runNodes, setRunNodes] = useState<WorkflowRunNode[]>(
    initialSession?.runNodes ?? []
  )
  const [events, setEvents] = useState<WorkflowRunEvent[]>(
    initialSession?.events ?? []
  )
  const [breakpoints, setBreakpoints] = useState<Set<string>>(
    () => new Set(initialSession?.breakpoints ?? ['branch'])
  )
  const [startNodeId, setStartNodeId] = useState<string | null>(
    initialSession?.startNodeId ?? 'measure'
  )
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    initialSession?.selectedNodeId ?? null
  )
  const [message, setMessage] = useState(
    initialSession?.message ?? '标准工作流 DAG 已就绪'
  )
  const [error, setError] = useState<string | null>(
    initialSession?.error ?? null
  )
  const [busy, setBusy] = useState(false)
  const latestSequence = useRef(initialSession?.latestSequence ?? 0)
  const { containerRef, leftRatio, isDragging, handlePointerDown } =
    useResizableSplit({
      initialRatio: 0.38,
      minRatio: 0.28,
      maxRatio: 0.58
    })
  const latestSession = useRef<WorkflowPanelSession | null>(null)
  latestSession.current = {
    authoringMode,
    runMode,
    legendOpen,
    outputExpanded,
    outputTab,
    compactPane,
    sourceFileName,
    sourceFileWriter: sourceFileWriter.current,
    editorValue: editor.value,
    editorBaseline: editor.baseline,
    canonicalSource,
    pythonBaseline: pythonBaseline.current,
    pythonSourceMap,
    run,
    runNodes,
    events,
    breakpoints: [...breakpoints],
    startNodeId,
    selectedNodeId,
    message,
    error,
    latestSequence: latestSequence.current
  }

  const nodeStates = useMemo(
    () => Object.fromEntries(
      runNodes.map((node) => [node.sourceNodeId || node.nodeId, node.state])
    ),
    [runNodes]
  )
  const executionScope = useMemo(
    () => createWorkflowExecutionScope(
      parsed.nodes,
      parsed.links,
      startNodeId
    ),
    [parsed.links, parsed.nodes, startNodeId]
  )
  const codeMarkers = useMemo(
    () => workflowCodeMarkers({
      source: editor.value,
      mode: authoringMode,
      nodeIds: parsed.nodes.map((node) => node.id),
      sourceMap: pythonSourceMap,
      startNodeId: executionScope.startNodeId,
      beforeStartNodeIds: executionScope.beforeStartNodeIds,
      breakpoints,
      pausedBeforeNodeId: run?.debug?.pausedBeforeNodeId || null,
      nodeStates
    }),
    [
      authoringMode,
      breakpoints,
      editor.value,
      executionScope.beforeStartNodeIds,
      executionScope.startNodeId,
      nodeStates,
      parsed.nodes,
      pythonSourceMap,
      run?.debug?.pausedBeforeNodeId
    ]
  )

  useEffect(() => {
    editor.setLineMarkers(codeMarkers)
  }, [codeMarkers, editor.setLineMarkers])

  useEffect(
    () => () => {
      if (latestSession.current) {
        sessionStore?.write(sessionKey, latestSession.current)
      }
    },
    [sessionKey, sessionStore]
  )

  useEffect(() => {
    onUnsavedChangesChange?.(editor.isDirty)
  }, [editor.isDirty, onUnsavedChangesChange])

  useEffect(
    () => () => {
      onUnsavedChangesChange?.(false)
    },
    [onUnsavedChangesChange]
  )

  useEffect(() => {
    if (!editor.isDirty) return

    const preventUnsavedUnload = (event: BeforeUnloadEvent): void => {
      event.preventDefault()
      event.returnValue = ''
    }
    globalThis.addEventListener('beforeunload', preventUnsavedUnload)
    return () => {
      globalThis.removeEventListener('beforeunload', preventUnsavedUnload)
    }
  }, [editor.isDirty])

  useEffect(() => {
    if (!error) return
    setOutputExpanded(true)
    setOutputTab('errors')
  }, [error])

  useEffect(() => {
    if (!saveFilePromptOpen) return
    const preferredButton = sourceFileWriter.current
      ? saveFileButtonRef.current
      : saveRevisionButtonRef.current
    preferredButton?.focus()
  }, [saveFilePromptOpen])

  const selectedNode = runNodes.find(
    (node) =>
      node.nodeId === selectedNodeId ||
      node.sourceNodeId === selectedNodeId
  )

  const refreshRun = useCallback(async (runId: string) => {
    const [nextRun, nodes] = await Promise.all([
      runtime.getRun(runId),
      runtime.listRunNodes(runId)
    ])
    setRun(nextRun)
    setRunNodes(nodes)
  }, [runtime])

  useEffect(() => {
    if (!run?.id) return
    const runId = run.id
    const subscription = runtime.subscribeRunEvents(
      runId,
      (event) => {
        latestSequence.current = Math.max(latestSequence.current, event.seq)
        if (event.type === 'node.exception') {
          const detail = String(
            event.payload.message ||
            event.payload.detail ||
            event.payload.code ||
            'OS 返回节点执行失败'
          )
          setError(`节点 ${event.nodeId || '未知节点'} 执行异常：${detail}`)
        }
        setEvents((current) => (
          current.some((item) => item.seq === event.seq)
            ? current
            : [...current, event].sort((left, right) => left.seq - right.seq)
        ))
        void refreshRun(runId)
      },
      {
        afterSeq: latestSequence.current,
        onError: (subscriptionError) => setError(subscriptionError.message)
      }
    )
    void refreshRun(runId)
    return () => subscription.dispose()
  }, [refreshRun, run?.id, runtime])

  const withBusy = useCallback(async (
    operation: () => Promise<void>
  ): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await operation()
    } catch (operationError) {
      setError(
        operationError instanceof Error
          ? operationError.message
          : String(operationError)
      )
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    if (initialSession) return
    const workflowId = readActiveWorkflowId(activeWorkflowStorageKey)
    if (!workflowId) return

    let active = true
    setBusy(true)
    setError(null)
    void runtime.getWorkflow(workflowId)
      .then((document) => {
        if (!active) return
        const canonicalText = JSON.stringify(
          document.revision.canonical,
          null,
          2
        )
        setAuthoringMode('json')
        editor.replaceContent(canonicalText)
        setCanonicalSource(canonicalText)
        setSourceFileName(null)
        sourceFileWriter.current = null
        setSaveFilePromptOpen(false)
        setPythonSourceMap([])
        pythonBaseline.current = null
        latestSequence.current = 0
        setRun(null)
        setRunNodes([])
        setEvents([])
        setBreakpoints(new Set())
        setStartNodeId(null)
        setSelectedNodeId(null)
        setMessage(`已恢复修订版本 ${document.revision.id}`)
      })
      .catch((restoreError) => {
        if (!active) return
        setError(
          `无法恢复最近保存的工作流 ${workflowId}：${
            restoreError instanceof Error
              ? restoreError.message
              : String(restoreError)
          }`
        )
      })
      .finally(() => {
        if (active) setBusy(false)
      })

    return () => {
      active = false
    }
  }, [
    activeWorkflowStorageKey,
    editor.replaceContent,
    initialSession,
    runtime
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

          setAuthoringMode('python')
          editor.replaceContent(content)
          setSourceFileName(fileName)
          sourceFileWriter.current = writeBack || null
          setSaveFilePromptOpen(false)
          setPythonSourceMap([])
          pythonBaseline.current = null
          latestSequence.current = 0
          setRun(null)
          setRunNodes([])
          setEvents([])
          setBreakpoints(new Set())
          setStartNodeId(null)
          setSelectedNodeId(null)
          setMessage(`${fileName} 已载入，正在由 OS 编译并投影到 DAG`)

          const baseRevisionId = current.revision.revision_id
          const compiled = requireAuthoringCandidate(
            await runtime.compilePythonWorkflow(
              baseRevisionId,
              content,
              workflowFileSourceUri(fileName)
            ),
            `无法编译 ${fileName}`
          )
          const validated = requireAuthoringCandidate(
            await runtime.validateAuthoringCandidate(
              baseRevisionId,
              compiled
            ),
            `${fileName} 未通过编写校验`
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

        const canonical = parseCanonicalWorkflow(content)
        const migrated = canonical.revision
          ? null
          : migrateCloudWorkflowJson(content)
        const revision = canonical.revision || migrated?.revision
        if (!revision) {
          throw new Error(
            `无法导入 ${fileName}：${
              migrated?.error || canonical.error || '无法识别工作流格式'
            }`
          )
        }

        const canonicalText = JSON.stringify(revision, null, 2)
        const structure = parseCanonicalWorkflow(canonicalText)
        if (!structure.revision) {
          throw new Error(
            `无法导入 ${fileName}：${
              structure.error || '转换后的 Canonical v2 无法解析'
            }`
          )
        }

        setAuthoringMode('json')
        editor.replaceContent(canonicalText)
        setCanonicalSource(canonicalText)
        setSourceFileName(fileName)
        sourceFileWriter.current = writeBack || null
        setSaveFilePromptOpen(false)
        setPythonSourceMap([])
        pythonBaseline.current = null
        latestSequence.current = 0
        setRun(null)
        setRunNodes([])
        setEvents([])
        setBreakpoints(new Set())
        setStartNodeId(null)
        setSelectedNodeId(null)

        if (!migrated) {
          setMessage(
            `${fileName} 已导入 · ${structure.nodes.length} 个节点 · ${
              structure.links.length
            } 条控制边`
          )
          return
        }

        const warningSuffix = migrated.warnings.length > 0
          ? ` · ${migrated.warnings.join('；')}`
          : ''
        setMessage(
          `${fileName} 已自动迁移为 Canonical v2，正在由 OS 校验${warningSuffix}`
        )
        let result
        try {
          result = await runtime.validateWorkflow(revision)
        } catch (validationError) {
          throw new Error(
            `${fileName} 已自动迁移为 Canonical v2，但 OS 校验请求失败：${
              validationError instanceof Error
                ? validationError.message
                : String(validationError)
            }`
          )
        }
        if (!result.valid) {
          setMessage(
            `${fileName} 已自动迁移为 Canonical v2，但 OS 校验未通过${warningSuffix}`
          )
          setError(
            result.issues
              .map((issue) => `${issue.code}: ${issue.message}`)
              .join('\n')
          )
          return
        }
        setMessage(
          `${fileName} 已自动迁移并通过 OS 校验 · ${
            result.nodeCount ?? structure.nodes.length
          } 节点 · ${result.edgeCount ?? structure.links.length} 边${
            warningSuffix
          }`
        )
      })
    },
    onError: (uploadError) => setError(uploadError)
  })

  // JSON → Python：只要 OS 成功生成 Python 就允许切换视图，
  // validate 仅用于收集诊断（非阻塞）。真正的校验发生在保存 / 运行 / 应用时。
  const projectToPython = useCallback(async (
    revision: WorkflowRevision
  ): Promise<{
    candidate: WorkflowAuthoringCandidate
    diagnostics: WorkflowAuthoringDiagnostic[]
  }> => {
    const baseRevisionId = revision.revision_id
    const sourceUri = workflowSourceUri(revision.workflow_id)
    const generated = requireAuthoringCandidate(
      await runtime.generatePythonWorkflow(
        baseRevisionId,
        revision,
        sourceUri
      ),
      '标准工作流转换为 Python 失败'
    )
    const validation = await runtime.validateAuthoringCandidate(
      baseRevisionId,
      generated
    )
    const diagnostics = collectAuthoringDiagnostics(validation)
    // validate 通过时可能返回带更精确 source_map 的候选，否则回退到已生成的候选。
    return { candidate: validation.candidate ?? generated, diagnostics }
  }, [runtime])

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
      throw new Error(current.error || '缺少可供 Python 编译的基础修订版本')
    }
    if (!forcePythonCompile && editor.value === pythonBaseline.current) {
      return current.revision
    }

    const baseRevisionId = current.revision.revision_id
    const sourceUri = workflowSourceUri(current.revision.workflow_id)
    const compiled = requireAuthoringCandidate(
      await runtime.compilePythonWorkflow(
        baseRevisionId,
        editor.value,
        sourceUri
      ),
      'Python 编译为标准工作流失败'
    )
    const validated = requireAuthoringCandidate(
      await runtime.validateAuthoringCandidate(baseRevisionId, compiled),
      'Python 工作流未通过编写校验'
    )
    const nextCanonical = JSON.stringify(validated.canonical_ir, null, 2)
    const next = parseCanonicalWorkflow(nextCanonical)
    if (!next.revision) {
      throw new Error(next.error || 'OS 返回了无效的标准工作流修订版本')
    }
    setBreakpoints((currentBreakpoints) =>
      remapWorkflowBreakpoints(
        current.revision as WorkflowRevision,
        next.revision as WorkflowRevision,
        currentBreakpoints
      )
    )
    setStartNodeId((currentStartNodeId) =>
      remapWorkflowNodeId(
        current.revision as WorkflowRevision,
        next.revision as WorkflowRevision,
        currentStartNodeId
      )
    )
    setPythonSourceMap(validated.source_map || [])
    setCanonicalSource(nextCanonical)
    pythonBaseline.current = editor.value
    setMessage(
      `Python 已编译 · ${next.nodes.length} 节点 · ${next.links.length} 边`
    )
    return next.revision
  }, [authoringMode, canonicalSource, editor.value, runtime])

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
      const baseRevisionId = currentRevision.revision_id

      void runtime.compilePythonWorkflow(
        baseRevisionId,
        source,
        workflowSourceUri(currentRevision.workflow_id)
      )
        .then((compiled) => requireAuthoringCandidate(
          compiled,
          'Python 编译为标准工作流失败'
        ))
        .then((compiled) =>
          runtime.validateAuthoringCandidate(baseRevisionId, compiled)
        )
        .then((validated) => requireAuthoringCandidate(
          validated,
          'Python 工作流未通过编写校验'
        ))
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
          setBreakpoints((currentBreakpoints) =>
            remapWorkflowBreakpoints(
              currentRevision,
              next.revision as WorkflowRevision,
              currentBreakpoints
            )
          )
          setStartNodeId((currentStartNodeId) =>
            remapWorkflowNodeId(
              currentRevision,
              next.revision as WorkflowRevision,
              currentStartNodeId
            )
          )
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
          if (cancelled) return
          setMessage(
            'Python 草稿尚未通过 OS 编译，画布保留最近一次有效版本'
          )
        })
    }, 700)

    return () => {
      cancelled = true
      globalThis.clearTimeout(timer)
    }
  }, [authoringMode, canonicalSource, editor.value, runtime])

  const validate = useCallback(async (): Promise<WorkflowRevision | null> => {
    const revision = await resolveRevision()
    const result = await runtime.validateWorkflow(revision)
    if (!result.valid) {
      setError(result.issues.map((issue) => `${issue.code}: ${issue.message}`).join('\n'))
      setMessage('校验未通过')
      return null
    }
    setMessage(
      `校验通过 · ${result.nodeCount ?? revision.invocations.length} 节点 · ${
        result.edgeCount ?? revision.control_edges.length
      } 边`
    )
    return revision
  }, [resolveRevision, runtime])

  const switchAuthoringMode = (nextMode: AuthoringMode): void => {
    if (nextMode === authoringMode) return
    void withBusy(async () => {
      if (nextMode === 'python') {
        const revision = await resolveRevision()
        const { candidate, diagnostics } = await projectToPython(revision)
        const nextCanonical = JSON.stringify(candidate.canonical_ir, null, 2)
        setCanonicalSource(nextCanonical)
        setPythonSourceMap(candidate.source_map || [])
        pythonBaseline.current = candidate.python_source
        setAuthoringMode('python')
        if (compactPane !== 'code') setCompactPane('code')
        editor.replaceContent(candidate.python_source)
        const blockingDiagnostics = diagnostics.filter(
          (item) => item.severity === 'error'
        )
        if (blockingDiagnostics.length > 0) {
          setError(formatAuthoringDiagnostics(blockingDiagnostics))
          setMessage('已生成 Python，但存在校验问题，需在保存或运行前修正')
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
      const revision = await validate()
      if (!revision) return
      const document = await runtime.saveWorkflow(
        revision.workflow_id,
        revision
      )
      const savedCanonical = JSON.stringify(
        document.revision.canonical,
        null,
        2
      )
      setCanonicalSource(savedCanonical)
      persistActiveWorkflowId(
        activeWorkflowStorageKey,
        document.revision.canonical.workflow_id
      )
      editor.markSaved()
      let fileSaveMessage = ''
      if (saveFile && sourceFileName) {
        const sourceFileContent = isPythonWorkflowFile(sourceFileName)
          ? authoringMode === 'python'
            ? editor.value
            : pythonBaseline.current
          : savedCanonical
        if (sourceFileContent === null) {
          throw new Error(
            `无法写回 ${sourceFileName}：缺少最近一次有效的 Python 源码`
          )
        }
        if (sourceFileWriter.current) {
          try {
            await sourceFileWriter.current(sourceFileContent)
          } catch (writeError) {
            throw new Error(
              `修订版本 ${document.revision.id} 已保存，但写回 ${sourceFileName} 失败：${
                writeError instanceof Error
                  ? writeError.message
                  : String(writeError)
              }`
            )
          }
          fileSaveMessage = ` · 已更新 ${sourceFileName}`
        } else {
          workflowDownload.download(sourceFileContent, sourceFileName)
          fileSaveMessage = ` · 已下载 ${sourceFileName}`
        }
      }
      setMessage(
        `已保存修订版本 ${document.revision.id}${fileSaveMessage}`
      )
    })
  }

  const save = (): void => {
    if (sourceFileName) {
      setSaveFilePromptOpen(true)
      return
    }
    saveRevision(false)
  }

  const resolveFileSavePrompt = (saveFile: boolean): void => {
    setSaveFilePromptOpen(false)
    saveRevision(saveFile)
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

  const startRun = (debug: boolean): void => {
    void withBusy(async () => {
      const revision = await validate()
      if (!revision) return
      latestSequence.current = 0
      setEvents([])
      setRunNodes([])
      const created = await runtime.createRun({
        client_request_id: globalThis.crypto?.randomUUID?.() || String(Date.now()),
        source: {
          format: 'workflow_revision_v2',
          revision
        },
        ...(debug
          ? {
              debug: {
                pause_on_start: true,
                breakpoints: [...breakpoints].filter((nodeId) =>
                  executionScope.executableNodeIds.has(nodeId)
                ),
                ...(executionScope.startNodeId
                  ? { start_node_id: executionScope.startNodeId }
                  : {})
              }
            }
          : {})
      })
      setRun(created)
      setMessage(
        debug
          ? `调试运行 ${created.id.slice(0, 8)} 已创建，等待安全暂停`
          : `整图运行 ${created.id.slice(0, 8)} 已下发`
      )
    })
  }

  const command = (
    name: WorkflowDebugCommand,
    payload: Record<string, unknown> = {},
    acceptedMessage?: string
  ): void => {
    if (!run) return
    void withBusy(async () => {
      const next = await runtime.command(run.id, name, payload)
      setRun(next)
      await refreshRun(run.id)
      setMessage(acceptedMessage || `调试命令 ${name} 已由 OS 接受`)
    })
  }

  const toggleBreakpoint = (nodeId: string): void => {
    const next = new Set(breakpoints)
    if (next.has(nodeId)) next.delete(nodeId)
    else next.add(nodeId)
    setBreakpoints(next)
    if (run?.debug?.enabled && !TERMINAL_RUN_STATES.has(run.status)) {
      command('set_breakpoints', { node_ids: [...next] })
    }
  }

  const setExecutionStart = (nodeId: string): void => {
    if (run?.debug?.enabled && !TERMINAL_RUN_STATES.has(run.status)) {
      setError('起始点在本次运行创建后不可修改；请先终止运行再重新设置')
      return
    }
    setStartNodeId((current) => {
      const next = current === nodeId ? null : nodeId
      setMessage(
        next
          ? `已设置调试起始点 ${nodeId}；其之前及不可达节点在调试运行中不执行`
          : '已取消指定起始点，将从 DAG 根节点开始'
      )
      return next
    })
  }

  const selectNode = (nodeId: string): void => {
    setSelectedNodeId(nodeId)
    const sourceLine = workflowNodeLine(
      editor.value,
      authoringMode,
      pythonSourceMap,
      nodeId
    )
    if (sourceLine) editor.revealLine(sourceLine)
    const step = parsed.steps[
      parsed.nodes.findIndex((node) => node.id === nodeId)
    ]
    if (step) onStepFocus?.({ stepId: nodeId, args: step.args })
  }

  const debugStatus = run?.debug?.status || 'disabled'
  const debugControls = visibleWorkflowDebugControls(
    workflowDebugControls({
      debugEnabled: Boolean(run?.debug?.enabled),
      debugStatus,
      runStatus: run?.status || 'draft',
      busy
    })
  )
  const runStatus = run?.status || 'draft'
  const completedNodeCount = runNodes.filter(
    (node) => ['success', 'skipped'].includes(node.state)
  ).length
  const sourceInvalid = authoringMode === 'json' && Boolean(parsed.error)
  const sourceRunnable = !sourceInvalid
  const pythonHasUnappliedChanges =
    authoringMode === 'python' &&
    editor.value !== pythonBaseline.current
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
  const outputNodes: WorkflowRunNode[] = runNodes.length
    ? runNodes
    : parsed.nodes.map((node) => ({
        nodeId: node.id,
        sourceNodeId: node.id,
        nodeType: node.type,
        deviceId: '',
        action: node.className,
        state: executionScope.beforeStartNodeIds.has(node.id)
          ? 'excluded'
          : 'pending',
        result: {},
        attempt: 0
      }))

  return (
    <div
      className={`${styles.workflow} workflow-runtime relative flex h-full w-full flex-col bg-[var(--unilab-color-canvas)] text-[var(--unilab-color-text)]`}
    >
      <WorkflowToolbar
        authoringMode={authoringMode}
        runMode={runMode}
        compactPane={compactPane}
        message={message}
        busy={busy}
        sourceRunnable={sourceRunnable}
        fileInputRef={fileUpload.inputRef}
        onFileChange={fileUpload.handleFileChange}
        onAuthoringModeChange={switchAuthoringMode}
        onCompactPaneChange={setCompactPane}
        onImportJson={() => fileUpload.openFilePicker('json')}
        onImportPython={() => fileUpload.openFilePicker('python')}
        onLoad={load}
        onApplyPython={() =>
          void withBusy(async () => {
            await resolveRevision(true)
          })
        }
        onValidate={() =>
          void withBusy(async () => {
            await validate()
          })
        }
        onSave={save}
        onRunModeChange={setRunMode}
        onStart={() => startRun(runMode === 'debug')}
      />

      {error && (
        <div className="workflow-runtime__problem" role="alert">
          <strong>异常处理</strong>
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)}>关闭</button>
        </div>
      )}
      {saveFilePromptOpen && sourceFileName && (
        <WorkflowSavePrompt
          fileName={sourceFileName}
          canWriteOriginal={Boolean(sourceFileWriter.current)}
          saveFileButtonRef={saveFileButtonRef}
          saveRevisionButtonRef={saveRevisionButtonRef}
          onCancel={() => setSaveFilePromptOpen(false)}
          onSaveRevision={() => resolveFileSavePrompt(false)}
          onSaveFile={() => resolveFileSavePrompt(true)}
        />
      )}
      <WorkflowStage
        compactPane={compactPane}
        containerRef={containerRef}
        editor={editor}
        editorTitle={editorTitle}
        editorLanguage={authoringMode === 'json' ? 'JSON' : 'Python'}
        isDragging={isDragging}
        leftRatio={leftRatio}
        onDividerPointerDown={handlePointerDown}
        nodes={parsed.nodes}
        links={parsed.links}
        parseError={parsed.error}
        nodeStates={nodeStates}
        breakpoints={breakpoints}
        startNodeId={executionScope.startNodeId}
        beforeStartNodeIds={executionScope.beforeStartNodeIds}
        pausedBeforeNodeId={run?.debug?.pausedBeforeNodeId || null}
        pythonHasUnappliedChanges={pythonHasUnappliedChanges}
        legendOpen={legendOpen}
        onLegendToggle={() => setLegendOpen((current) => !current)}
        onNodeSelect={selectNode}
        onSetStart={setExecutionStart}
        onToggleBreakpoint={toggleBreakpoint}
      >
        <WorkflowDebugger
          debugStatus={debugStatus}
          runStatus={runStatus}
          pausedBeforeNodeId={run?.debug?.pausedBeforeNodeId || null}
          startNodeId={executionScope.startNodeId}
          breakpointCount={breakpoints.size}
          controls={debugControls}
          onCommand={(nextCommand, acceptedMessage) =>
            command(nextCommand, {}, acceptedMessage)
          }
        />

        <WorkflowOutput
          expanded={outputExpanded}
          activeTab={outputTab}
          completedNodeCount={completedNodeCount}
          expectedNodeCount={runNodes.length || parsed.nodes.length}
          nodes={outputNodes}
          events={events}
          error={error}
          selectedNode={selectedNode}
          selectedNodeId={selectedNodeId}
          pausedBeforeNodeId={run?.debug?.pausedBeforeNodeId || null}
          onExpandedChange={setOutputExpanded}
          onTabChange={setOutputTab}
          onNodeSelect={selectNode}
          onClearError={() => setError(null)}
        />
      </WorkflowStage>
    </div>
  )
}

function readActiveWorkflowId(storageKey?: string): string | null {
  if (!storageKey) return null
  try {
    const raw = globalThis.localStorage?.getItem(storageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw) as {
      version?: unknown
      workflowId?: unknown
    }
    return parsed.version === 1 &&
      typeof parsed.workflowId === 'string' &&
      parsed.workflowId.trim()
      ? parsed.workflowId
      : null
  } catch {
    return null
  }
}

function persistActiveWorkflowId(
  storageKey: string | undefined,
  workflowId: string
): void {
  if (!storageKey) return
  try {
    globalThis.localStorage?.setItem(
      storageKey,
      JSON.stringify({ version: 1, workflowId })
    )
  } catch {
    // OS persistence succeeded; unavailable browser storage must not fail save.
  }
}

function collectAuthoringDiagnostics(
  result: WorkflowAuthoringResult
): WorkflowAuthoringDiagnostic[] {
  return [
    ...result.diagnostics,
    ...(result.candidate?.diagnostics || [])
  ]
}

function formatAuthoringDiagnostics(
  diagnostics: ReadonlyArray<WorkflowAuthoringDiagnostic>
): string {
  return diagnostics
    .map((item) => {
      const location = item.start_line
        ? `L${item.start_line}:${item.start_column || 1} `
        : ''
      return `${location}${item.code}: ${item.message}`
    })
    .join('\n')
}

function requireAuthoringCandidate(
  result: WorkflowAuthoringResult,
  fallback: string
): WorkflowAuthoringCandidate {
  const diagnostics = collectAuthoringDiagnostics(result)
  const errors = diagnostics.filter((item) => item.severity === 'error')
  if (!result.candidate || errors.length > 0) {
    const detail = formatAuthoringDiagnostics(
      errors.length > 0 ? errors : diagnostics
    )
    throw new Error(detail || fallback)
  }
  return result.candidate
}

function workflowSourceUri(workflowId: string): string {
  const safeName = workflowId
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'workflow'
  return `workflows/${safeName}.py`
}

function isPythonWorkflowFile(fileName: string): boolean {
  return fileName.toLowerCase().endsWith('.py')
}

function workflowFileSourceUri(fileName: string): string {
  return workflowSourceUri(fileName.replace(/\.py$/i, ''))
}

interface WorkflowCodeMarkerOptions {
  source: string
  mode: AuthoringMode
  nodeIds: ReadonlyArray<string>
  sourceMap: NonNullable<WorkflowAuthoringCandidate['source_map']>
  startNodeId: string | null
  beforeStartNodeIds: ReadonlySet<string>
  breakpoints: ReadonlySet<string>
  pausedBeforeNodeId: string | null
  nodeStates: Readonly<Record<string, string>>
}

function workflowCodeMarkers(
  options: WorkflowCodeMarkerOptions
): CodeLineMarker[] {
  const markers: CodeLineMarker[] = []
  for (const nodeId of options.nodeIds) {
    const line = workflowNodeLine(
      options.source,
      options.mode,
      options.sourceMap,
      nodeId
    )
    if (!line) continue
    if (options.beforeStartNodeIds.has(nodeId)) {
      markers.push({
        nodeId,
        line,
        kind: 'before-start',
        label: '不执行'
      })
    } else {
      const state = options.nodeStates[nodeId]
      if (state === 'running') {
        markers.push({ nodeId, line, kind: 'running', label: '正在运行' })
      } else if (state === 'success') {
        markers.push({ nodeId, line, kind: 'success', label: '成功' })
      } else if (state === 'failed' || state === 'reconciling') {
        markers.push({ nodeId, line, kind: 'failed', label: '失败' })
      } else if (state === 'skipped') {
        markers.push({ nodeId, line, kind: 'skipped', label: '已跳过' })
      }
    }
    if (options.startNodeId === nodeId) {
      markers.push({ nodeId, line, kind: 'start', label: '⚑ 起始点' })
    }
    if (options.breakpoints.has(nodeId)) {
      markers.push({ nodeId, line, kind: 'breakpoint', label: '● 断点' })
    }
    if (options.pausedBeforeNodeId === nodeId) {
      markers.push({ nodeId, line, kind: 'paused', label: '下一步' })
    }
  }
  return markers
}

function workflowNodeLine(
  source: string,
  mode: AuthoringMode,
  sourceMap: NonNullable<WorkflowAuthoringCandidate['source_map']>,
  nodeId: string
): number | null {
  if (mode === 'python') {
    const span = sourceMap.find((item) => item.node_id === nodeId)
    return span?.start_line || null
  }
  const encodedNodeId = JSON.stringify(nodeId)
  const lines = source.split(/\r?\n/)
  const index = lines.findIndex(
    (line) => line.includes('"node_id"') && line.includes(encodedNodeId)
  )
  return index >= 0 ? index + 1 : null
}
