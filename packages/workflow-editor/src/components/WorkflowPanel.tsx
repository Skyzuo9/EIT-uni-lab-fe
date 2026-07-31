import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import type { CodeLineMarker } from '@unilab/code-editor'
import { useResizableSplit } from '@unilab/app-shell'
import type {
  WorkflowAuthoringCandidate,
  WorkflowRevision,
  WorkflowRuntimePort
} from '@unilab/services'

import {
  useWorkflowAuthoring,
  type WorkflowAuthoringMode,
  type WorkflowAuthoringSnapshot
} from '../hooks/useWorkflowAuthoring'
import {
  useWorkflowRun,
  type WorkflowRunSnapshot
} from '../hooks/useWorkflowRun'
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

type RunMode = 'run' | 'debug'
type OutputTab = 'nodes' | 'events' | 'errors'
type CompactPane = 'code' | 'dag'

interface WorkflowPanelSession
  extends WorkflowAuthoringSnapshot, WorkflowRunSnapshot {
  runMode: RunMode
  legendOpen: boolean
  outputExpanded: boolean
  outputTab: OutputTab
  compactPane: CompactPane
  message: string
  error: string | null
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
  const [message, setMessage] = useState(
    initialSession?.message ?? '标准工作流 DAG 已就绪'
  )
  const [error, setError] = useState<string | null>(
    initialSession?.error ?? null
  )
  const [busy, setBusy] = useState(false)
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

  const resetRunRef = useRef<() => void>(() => {})
  const remapExecutionScopeRef = useRef<(
    previous: WorkflowRevision,
    next: WorkflowRevision
  ) => void>(() => {})
  const resetRun = useCallback(() => resetRunRef.current(), [])
  const remapExecutionScope = useCallback((
    previous: WorkflowRevision,
    next: WorkflowRevision
  ) => remapExecutionScopeRef.current(previous, next), [])

  const authoring = useWorkflowAuthoring({
    runtime,
    activeWorkflowStorageKey,
    initial: initialSession,
    compactPane,
    onRequestCodePane: () => setCompactPane('code'),
    onResetRun: resetRun,
    onRevisionRemapped: remapExecutionScope,
    onUnsavedChangesChange,
    setMessage,
    setError,
    withBusy
  })
  const workflowRun = useWorkflowRun({
    runtime,
    initial: initialSession,
    nodes: authoring.parsed.nodes,
    links: authoring.parsed.links,
    busy,
    validateRevision: authoring.validateRevision,
    setMessage,
    setError,
    withBusy
  })
  resetRunRef.current = workflowRun.resetRun
  remapExecutionScopeRef.current = workflowRun.remapExecutionScope

  const { containerRef, leftRatio, isDragging, handlePointerDown } =
    useResizableSplit({
      initialRatio: 0.38,
      minRatio: 0.28,
      maxRatio: 0.58
    })
  const latestSession = useRef<WorkflowPanelSession | null>(null)
  latestSession.current = {
    ...authoring.snapshot,
    ...workflowRun.snapshot,
    runMode,
    legendOpen,
    outputExpanded,
    outputTab,
    compactPane,
    message,
    error
  }

  const codeMarkers = useMemo(
    () => workflowCodeMarkers({
      source: authoring.editor.value,
      mode: authoring.authoringMode,
      nodeIds: authoring.parsed.nodes.map((node) => node.id),
      sourceMap: authoring.pythonSourceMap,
      startNodeId: workflowRun.executionScope.startNodeId,
      beforeStartNodeIds:
        workflowRun.executionScope.beforeStartNodeIds,
      breakpoints: workflowRun.breakpoints,
      pausedBeforeNodeId:
        workflowRun.run?.debug?.pausedBeforeNodeId || null,
      nodeStates: workflowRun.nodeStates
    }),
    [
      authoring.authoringMode,
      authoring.editor.value,
      authoring.parsed.nodes,
      authoring.pythonSourceMap,
      workflowRun.breakpoints,
      workflowRun.executionScope.beforeStartNodeIds,
      workflowRun.executionScope.startNodeId,
      workflowRun.nodeStates,
      workflowRun.run?.debug?.pausedBeforeNodeId
    ]
  )

  useEffect(() => {
    authoring.editor.setLineMarkers(codeMarkers)
  }, [authoring.editor.setLineMarkers, codeMarkers])

  useEffect(
    () => () => {
      if (latestSession.current) {
        sessionStore?.write(sessionKey, latestSession.current)
      }
    },
    [sessionKey, sessionStore]
  )

  useEffect(() => {
    if (!error) return
    setOutputExpanded(true)
    setOutputTab('errors')
  }, [error])

  const selectNode = (nodeId: string): void => {
    workflowRun.setSelectedNodeId(nodeId)
    const sourceLine = workflowNodeLine(
      authoring.editor.value,
      authoring.authoringMode,
      authoring.pythonSourceMap,
      nodeId
    )
    if (sourceLine) authoring.editor.revealLine(sourceLine)
    const step = authoring.parsed.steps[
      authoring.parsed.nodes.findIndex((node) => node.id === nodeId)
    ]
    if (step) onStepFocus?.({ stepId: nodeId, args: step.args })
  }

  return (
    <div
      className={`${styles.workflow} workflow-runtime relative flex h-full w-full flex-col bg-[var(--unilab-color-canvas)] text-[var(--unilab-color-text)]`}
    >
      <WorkflowToolbar
        authoringMode={authoring.authoringMode}
        runMode={runMode}
        compactPane={compactPane}
        message={message}
        busy={busy}
        sourceRunnable={authoring.sourceRunnable}
        fileInputRef={authoring.fileUpload.inputRef}
        onFileChange={authoring.fileUpload.handleFileChange}
        onAuthoringModeChange={authoring.switchAuthoringMode}
        onCompactPaneChange={setCompactPane}
        onImportJson={() => authoring.fileUpload.openFilePicker('json')}
        onImportPython={() =>
          authoring.fileUpload.openFilePicker('python')
        }
        onLoad={authoring.load}
        onApplyPython={authoring.applyPython}
        onValidate={authoring.validate}
        onSave={authoring.save}
        onRunModeChange={setRunMode}
        onStart={() => workflowRun.startRun(runMode === 'debug')}
      />

      {error && (
        <div className="workflow-runtime__problem" role="alert">
          <strong>异常处理</strong>
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)}>
            关闭
          </button>
        </div>
      )}
      {authoring.saveFilePromptOpen && authoring.sourceFileName && (
        <WorkflowSavePrompt
          fileName={authoring.sourceFileName}
          canWriteOriginal={authoring.canWriteOriginal}
          saveFileButtonRef={authoring.saveFileButtonRef}
          saveRevisionButtonRef={authoring.saveRevisionButtonRef}
          onCancel={authoring.cancelSavePrompt}
          onSaveRevision={() =>
            authoring.resolveFileSavePrompt(false)
          }
          onSaveFile={() => authoring.resolveFileSavePrompt(true)}
        />
      )}
      <WorkflowStage
        compactPane={compactPane}
        containerRef={containerRef}
        editor={authoring.editor}
        editorTitle={authoring.editorTitle}
        editorLanguage={
          authoring.authoringMode === 'json' ? 'JSON' : 'Python'
        }
        isDragging={isDragging}
        leftRatio={leftRatio}
        onDividerPointerDown={handlePointerDown}
        nodes={authoring.parsed.nodes}
        links={authoring.parsed.links}
        parseError={authoring.parsed.error}
        nodeStates={workflowRun.nodeStates}
        breakpoints={workflowRun.breakpoints}
        startNodeId={workflowRun.executionScope.startNodeId}
        beforeStartNodeIds={
          workflowRun.executionScope.beforeStartNodeIds
        }
        pausedBeforeNodeId={
          workflowRun.run?.debug?.pausedBeforeNodeId || null
        }
        pythonHasUnappliedChanges={
          authoring.pythonHasUnappliedChanges
        }
        legendOpen={legendOpen}
        canBeautify={authoring.canBeautify && !busy}
        onBeautify={authoring.beautifyLayout}
        onLegendToggle={() => setLegendOpen((current) => !current)}
        onNodeSelect={selectNode}
        onSetStart={workflowRun.setExecutionStart}
        onToggleBreakpoint={workflowRun.toggleBreakpoint}
      >
        <WorkflowDebugger
          debugStatus={workflowRun.debugStatus}
          runStatus={workflowRun.runStatus}
          pausedBeforeNodeId={
            workflowRun.run?.debug?.pausedBeforeNodeId || null
          }
          startNodeId={workflowRun.executionScope.startNodeId}
          breakpointCount={workflowRun.breakpoints.size}
          controls={workflowRun.debugControls}
          onCommand={(nextCommand, acceptedMessage) =>
            workflowRun.command(nextCommand, {}, acceptedMessage)
          }
        />

        <WorkflowOutput
          expanded={outputExpanded}
          activeTab={outputTab}
          completedNodeCount={workflowRun.completedNodeCount}
          expectedNodeCount={
            workflowRun.runNodes.length || authoring.parsed.nodes.length
          }
          nodes={workflowRun.outputNodes}
          events={workflowRun.events}
          error={error}
          selectedNode={workflowRun.selectedNode}
          selectedNodeId={workflowRun.selectedNodeId}
          pausedBeforeNodeId={
            workflowRun.run?.debug?.pausedBeforeNodeId || null
          }
          onExpandedChange={setOutputExpanded}
          onTabChange={setOutputTab}
          onNodeSelect={selectNode}
          onClearError={() => setError(null)}
        />
      </WorkflowStage>
    </div>
  )
}

interface WorkflowCodeMarkerOptions {
  source: string
  mode: WorkflowAuthoringMode
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
        markers.push({
          nodeId,
          line,
          kind: 'running',
          label: '正在运行'
        })
      } else if (state === 'success') {
        markers.push({
          nodeId,
          line,
          kind: 'success',
          label: '成功'
        })
      } else if (state === 'failed' || state === 'reconciling') {
        markers.push({
          nodeId,
          line,
          kind: 'failed',
          label: '失败'
        })
      } else if (state === 'skipped') {
        markers.push({
          nodeId,
          line,
          kind: 'skipped',
          label: '已跳过'
        })
      }
    }
    if (options.startNodeId === nodeId) {
      markers.push({
        nodeId,
        line,
        kind: 'start',
        label: '⚑ 起始点'
      })
    }
    if (options.breakpoints.has(nodeId)) {
      markers.push({
        nodeId,
        line,
        kind: 'breakpoint',
        label: '● 断点'
      })
    }
    if (options.pausedBeforeNodeId === nodeId) {
      markers.push({
        nodeId,
        line,
        kind: 'paused',
        label: '下一步'
      })
    }
  }
  return markers
}

function workflowNodeLine(
  source: string,
  mode: WorkflowAuthoringMode,
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
    (line) =>
      line.includes('"node_id"') && line.includes(encodedNodeId)
  )
  return index >= 0 ? index + 1 : null
}
