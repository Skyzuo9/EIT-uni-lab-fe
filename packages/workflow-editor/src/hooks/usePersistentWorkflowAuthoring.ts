import { useCodeMirror } from '@unilab/code-editor'
import type {
  WorkflowAuthoringAggregate,
  WorkflowAuthoringGraph
} from '@unilab/services'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'

import {
  workflowAuthoringSurfacePolicy,
  type WorkflowEditMode
} from '../utils/workflowCanvasPolicy'
import {
  beautifyPersistentAuthoringGraph,
  projectPersistentAuthoringGraph
} from '../utils/persistentAuthoringGraph'
import {
  projectMaterialTraces
} from '../utils/workflowMaterialTrace'
import {
  workflowDagLayoutStrategyLabel,
  workflowMaterialSwimlaneDirectionLabel,
  type WorkflowDagLayoutStrategy,
  type WorkflowMaterialSwimlaneDirection
} from '../utils/workflowDagLayoutStrategy'
import {
  AuthoringOperationQueue,
  authoringProjection
} from '../utils/persistentAuthoringSession'
import {
  errorMessage,
  workflowGraphJsonProjection,
  workflowIoMetadata
} from '../utils/persistentAuthoringProjection'
import type {
  FullSourceDiff,
  PersistentWorkflowAuthoringOptions,
  RemoteConflict,
  WorkflowCodeProjection
} from './persistentWorkflowAuthoringTypes'
import { usePersistentWorkflowCanvasNodeEditor } from './usePersistentWorkflowCanvasNodeEditor'
import { usePersistentWorkflowAuthoritySync } from './usePersistentWorkflowAuthoritySync'
import { usePersistentWorkflowCatalogs } from './usePersistentWorkflowCatalogs'
import { usePersistentWorkflowDraftPersistence } from './usePersistentWorkflowDraftPersistence'
import { usePersistentWorkflowEditMode } from './usePersistentWorkflowEditMode'
import { usePersistentWorkflowFileImport } from './usePersistentWorkflowFileImport'
import { usePersistentWorkflowStartCoordinator } from './usePersistentWorkflowStartCoordinator'
import { usePersistentWorkflowTaskPanel } from './usePersistentWorkflowTaskPanel'
import { usePersistentWorkflowTransform } from './usePersistentWorkflowTransform'
import { useWorkflowPanelRuntimeProjection } from './useWorkflowPanelRuntimeProjection'

export type { PersistentWorkflowAuthoringOptions } from './persistentWorkflowAuthoringTypes'

export function usePersistentWorkflowAuthoring({
  runtime,
  workflowUuid,
  traceRuntime,
  resourceSlotOptionsPort,
  onUnsavedChangesChange,
  onWorkflowRuntimeProjectionChange,
  onSelectedWorkflowStepChange,
  onChooseWorkflow
}: PersistentWorkflowAuthoringOptions) {
  const [mode, setMode] = useState<WorkflowEditMode>('code')
  const [codeProjection, setCodeProjection] =
    useState<WorkflowCodeProjection>('python')
  const [aggregate, setAggregate] =
    useState<WorkflowAuthoringAggregate | null>(null)
  const policy = workflowAuthoringSurfacePolicy(mode)
  const editor = useCodeMirror(
    '',
    'python',
    '',
    policy.pythonEditorReadOnly || aggregate === null
  )
  const jsonProjectionEditor = useCodeMirror('', 'json', '', true)
  const [graph, setGraph] = useState<WorkflowAuthoringGraph | null>(null)
  const [canvasDirty, setCanvasDirty] = useState(false)
  const [selectedNodeUuid, setSelectedNodeUuid] = useState<string | null>(null)

  useEffect(() => {
    onSelectedWorkflowStepChange?.(selectedNodeUuid)
    return () => onSelectedWorkflowStepChange?.(null)
  }, [onSelectedWorkflowStepChange, selectedNodeUuid])
  const [selectedNodeName, setSelectedNodeName] = useState('')
  const [selectedNodeNameDirty, setSelectedNodeNameDirty] = useState(false)
  const [actionParametersOpen, setActionParametersOpen] = useState(false)
  const [workflowIoOpen, setWorkflowIoOpen] = useState(false)
  const [nodePaletteOpen, setNodePaletteOpen] = useState(true)
  const [message, setMessage] = useState('正在读取 OS 工作流编辑状态…')
  const [error, setError] = useState<string | null>(null)
  const {
    actionCatalog,
    effectiveMaterialSourceCatalog,
    materialSourceAuthorityBlocked,
    materialSourceCatalog,
    materialSourceCatalogError,
    materialSourceCatalogLoading,
    refreshMaterialSourceCatalog,
    refreshWorkflowCatalogsAfterConflict
  } = usePersistentWorkflowCatalogs({ runtime, graph, setError })
  const [busy, setBusy] = useState(false)
  const [pendingMode, setPendingMode] = useState<WorkflowEditMode | null>(null)
  const [fullSourceDiff, setFullSourceDiff] =
    useState<FullSourceDiff | null>(null)
  const [pendingPythonImport, setPendingPythonImport] =
    useState<string | null>(null)
  const [remoteConflict, setRemoteConflict] =
    useState<RemoteConflict | null>(null)
  const operationQueue = useRef<AuthoringOperationQueue | null>(null)
  if (operationQueue.current === null) {
    operationQueue.current = new AuthoringOperationQueue()
  }
  const queue = operationQueue.current
  const remotePending = useRef(false)
  const localState = useRef({
    mode,
    codeDirty: editor.isDirty,
    canvasDirty: canvasDirty || selectedNodeNameDirty,
    editorValue: editor.value,
    aggregate,
    graph,
    selectedNodeUuid,
    selectedNodeName,
    selectedNodeNameDirty
  })
  localState.current = {
    mode,
    codeDirty: editor.isDirty,
    canvasDirty: canvasDirty || selectedNodeNameDirty,
    editorValue: editor.value,
    aggregate,
    graph,
    selectedNodeUuid,
    selectedNodeName,
    selectedNodeNameDirty
  }

  const { installAggregate, readRemoteConflict } =
    usePersistentWorkflowAuthoritySync({
      runtime,
      workflowUuid,
      queue,
      state: {
        localState,
        remotePending,
        replaceEditorContent: editor.replaceContent,
        setAggregate,
        setGraph,
        setCanvasDirty,
        setSelectedNodeUuid,
        setSelectedNodeName,
        setSelectedNodeNameDirty,
        setRemoteConflict,
        setMessage,
        setError,
        setBusy
      }
    })

  const { generateCanvasPython } = usePersistentWorkflowTransform({
    runtime,
    workflowUuid,
    aggregate,
    actionCatalog,
    queue,
    localState,
    refreshWorkflowCatalogsAfterConflict,
    setGraph,
    setCanvasDirty,
    setMessage
  })

  const fileUpload = usePersistentWorkflowFileImport({
    workflowUuid,
    localState,
    generateCanvasPython,
    run: async (operation) => {
      setBusy(true)
      setError(null)
      try {
        await operation()
      } catch (operationError) {
        setError(errorMessage(operationError))
      } finally {
        setBusy(false)
      }
    },
    replaceEditorContent: editor.replaceContent,
    updateEditorContent: editor.updateContent,
    setMode,
    setGraph,
    setCanvasDirty,
    setSelectedNodeUuid,
    setSelectedNodeName,
    setSelectedNodeNameDirty,
    setPendingPythonImport,
    setMessage,
    setError
  })


  const structure = useMemo(
    () => graph
      ? projectPersistentAuthoringGraph(graph, materialSourceCatalog)
      : { nodes: [], links: [], steps: [], error: null },
    [graph, materialSourceCatalog]
  )
  useEffect(() => {
    jsonProjectionEditor.replaceContent(
      graph ? workflowGraphJsonProjection(graph) : '{}'
    )
  }, [graph, jsonProjectionEditor.replaceContent])

  /**
   * 按选定策略重排当前候选图，并把坐标结果留在画布草稿中。
   *
   * @param strategy 用户选择的工作流（Workflow）画布布局策略。
   * @param swimlaneDirection 物料泳道策略当前选中的流向。
   * @returns 无返回值；没有可编辑候选图时保持现状。
   */
  const beautifyCanvasLayout = useCallback((
    strategy: WorkflowDagLayoutStrategy,
    swimlaneDirection: WorkflowMaterialSwimlaneDirection
  ): void => {
    if (!graph || !policy.canvasMutationEnabled || busy) return
    const nextGraph = beautifyPersistentAuthoringGraph(
      graph,
      strategy,
      swimlaneDirection
    )
    setGraph(nextGraph)
    setCanvasDirty(true)
    setSelectedNodeNameDirty(false)
    setError(null)
    setMessage(
      `已应用${workflowDagLayoutStrategyLabel(strategy)}${
        strategy === 'material-swimlanes'
          ? `（${workflowMaterialSwimlaneDirectionLabel(
              swimlaneDirection
            )}）`
          : ''
      }布局；` +
      '保存草稿后将写入工作流'
    )
  }, [busy, graph, policy.canvasMutationEnabled])
  const materialTraces = useMemo(
    () => projectMaterialTraces(structure.nodes, structure.links),
    [structure.links, structure.nodes]
  )
  const dirty = mode === 'code'
    ? editor.isDirty
    : canvasDirty || selectedNodeNameDirty
  const taskPanel = usePersistentWorkflowTaskPanel({
    runtime,
    workflowUuid,
    aggregate,
    structure,
    editorValue: editor.value,
    setCodeMarkers: editor.setLineMarkers,
    queue,
    resourceSlotOptionsPort,
    setMessage,
    setError
  })
  useWorkflowPanelRuntimeProjection({
    aggregate,
    runtimeSnapshot: taskPanel.taskRuntime.snapshot,
    onProjectionChange: onWorkflowRuntimeProjectionChange
  })

  useEffect(() => {
    onUnsavedChangesChange?.(dirty)
  }, [dirty, onUnsavedChangesChange])

  useEffect(
    () => () => onUnsavedChangesChange?.(false),
    [onUnsavedChangesChange]
  )

  const run = useCallback(async (
    operation: () => Promise<void>
  ): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await operation()
    } catch (operationError) {
      setError(errorMessage(operationError))
    } finally {
      setBusy(false)
    }
  }, [])

  const { requestMode, discardAndSwitch } = usePersistentWorkflowEditMode({
    aggregate,
    mode,
    dirty,
    pendingMode,
    generateCanvasPython,
    run,
    replaceEditorContent: editor.replaceContent,
    setGraph,
    setCanvasDirty,
    setSelectedNodeUuid,
    setSelectedNodeName,
    setSelectedNodeNameDirty,
    setPendingPythonImport,
    setPendingMode,
    setMode,
    setMessage
  })

  const draftPersistence = usePersistentWorkflowDraftPersistence({
    runtime,
    workflowUuid,
    queue,
    aggregate,
    mode,
    graph,
    busy,
    fullSourceDiff,
    pendingPythonImport,
    remoteConflict,
    selectedNodeUuid,
    selectedNodeName,
    selectedNodeNameDirty,
    editorValue: editor.value,
    localState,
    remotePending,
    generateCanvasPython,
    run,
    installAggregate,
    readRemoteConflict,
    refreshWorkflowCatalogsAfterConflict,
    setGraph,
    setCanvasDirty,
    setSelectedNodeNameDirty,
    setFullSourceDiff,
    setPendingPythonImport,
    setRemoteConflict,
    setMode,
    setMessage,
    setError
  })

  const projectionKind = aggregate
    ? authoringProjection(aggregate).kind
    : null
  const diagnostics = aggregate?.draft?.diagnostics ?? []
  const canvasNodeEditor = usePersistentWorkflowCanvasNodeEditor({
    actionCatalog,
    canvasMutationEnabled: policy.canvasMutationEnabled,
    codeSourceMap: taskPanel.codeSourceMap,
    diagnostics,
    effectiveMaterialSourceCatalog,
    graph,
    materialSourceAuthorityBlocked,
    materialSourceCatalog,
    revealLine: editor.revealLine,
    selectedNodeNameDirty,
    selectedNodeUuid,
    setActionParametersOpen,
    setCanvasDirty,
    setError,
    setGraph,
    setMessage,
    setSelectedNodeName,
    setSelectedNodeNameDirty,
    setSelectedNodeUuid
  })

  const workflowStartCoordinator = usePersistentWorkflowStartCoordinator({
    runtime,
    workflowUuid,
    queue,
    aggregate,
    mode,
    dirty,
    blockedReason: materialSourceAuthorityBlocked
      ? '物料来源目录或引用已失效，请先刷新'
      : null,
    graph,
    editorValue: editor.value,
    selectedNodeUuid,
    selectedNodeName,
    selectedNodeNameDirty,
    remotePending,
    generateCanvasPython,
    applyCandidateByHash: draftPersistence.applyCandidateByHash,
    installAggregate,
    readRemoteConflict,
    openTaskInput: taskPanel.openTaskInputFormForAuthority,
    run,
    setGraph,
    setCanvasDirty,
    setSelectedNodeNameDirty,
    setPendingPythonImport,
    setFullSourceDiff,
    setMode,
    setMessage,
    setError
  })

  const {
    adoptRemoteConflict,
    applyCandidate,
    cancelDraftFullSourceDiff,
    retryLocalAfterConflict,
    saveDraft
  } = draftPersistence

  /**
   * 接受当前完整源码差异，并交还发起该差异的保存或运行流程。
   *
   * @returns 无返回值；异步结果由对应深模块投影到界面状态。
   */
  const acceptFullSourceDiff = (): void => {
    if (workflowStartCoordinator.acceptWorkflowStartReview()) return
    draftPersistence.acceptDraftFullSourceDiff()
  }

  /**
   * 取消当前完整源码差异及可能等待中的工作流（Workflow）运行意图。
   *
   * @returns 无返回值；已经持久化的操作系统（OS）权威事实保持不变。
   */
  const cancelFullSourceDiff = (): void => {
    workflowStartCoordinator.cancelWorkflowStartReview()
    cancelDraftFullSourceDiff()
  }

  const appliedIo = aggregate
    ? workflowIoMetadata(aggregate.applied_graph)
    : null
  const candidateIo = graph ? workflowIoMetadata(graph) : null

  return {
    acceptFullSourceDiff, actionCatalog, actionParametersOpen,
    adoptRemoteConflict, aggregate, appliedIo,
    applyCandidate, beautifyCanvasLayout,
    busy, cancelFullSourceDiff, candidateIo, codeProjection,
    diagnostics,
    dirty, discardAndSwitch, editor, effectiveMaterialSourceCatalog, error,
    fileUpload, fullSourceDiff, graph, jsonProjectionEditor,
    materialSourceAuthorityBlocked, materialSourceCatalogError,
    materialSourceCatalogLoading, materialTraces, message, mode,
    nodePaletteOpen, onChooseWorkflow, pendingMode, policy, projectionKind,
    refreshMaterialSourceCatalog, remoteConflict, requestMode,
    retryLocalAfterConflict, runtime, saveDraft,
    selectedNodeName, selectedNodeUuid,
    setActionParametersOpen, setCanvasDirty, setCodeProjection, setError,
    setFullSourceDiff, setGraph, setMessage, setNodePaletteOpen,
    setPendingMode, setRemoteConflict, setSelectedNodeName,
    setSelectedNodeNameDirty, setSelectedNodeUuid, setWorkflowIoOpen, structure,
    traceRuntime, workflowIoOpen, workflowUuid,
    ...canvasNodeEditor,
    ...taskPanel,
    ...workflowStartCoordinator
  }
}
