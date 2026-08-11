import { EditorManager, EditorWidget } from '@theia/editor/lib/browser'
import { FileService } from '@theia/filesystem/lib/browser/file-service'
import { ApplicationShell, Message } from '@theia/core/lib/browser'
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget'
import { MessageService } from '@theia/core/lib/common/message-service'
import { URI } from '@theia/core/lib/common/uri'
import { ProblemManager } from '@theia/markers/lib/browser/problem/problem-manager'
import {
  DiagnosticSeverity,
  type Diagnostic
} from '@theia/core/shared/vscode-languageserver-protocol'
import {
  Disposable,
  DisposableCollection
} from '@theia/core/lib/common/disposable'
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  MaterialStoreProvider,
  MaterialWorkbench,
  createMaterialStore,
  type MaterialId,
  type MaterialStore
} from '@unilab/material'
import {
  assertCapability,
  createServices,
  getDefaultBackend,
  type Services
} from '@unilab/services'
import {
  WorkflowPanel,
  type WorkflowPanelRuntimeProjection
} from '@unilab/workflow-editor'
import {
  createWorkflowIdeSyncState,
  synchronizeSavedWorkflowSource,
  WorkflowIdeHostAdapter,
  type WorkflowIdeBridge,
  type WorkflowIdeDiagnosticSeverity,
  type WorkflowIdeResolvedDiagnostic,
  type WorkflowIdeResolvedLocation,
  type WorkflowSourceProjection
} from '@unilab/workflow-ide-bridge'
import type {
  WorkbenchEnvironmentLogKind,
  WorkbenchRuntimeMode,
  WorkbenchSessionSnapshot
} from '@unilab/workbench-session'
import * as React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  WorkbenchSessionClient,
  WorkbenchSessionServer
} from '../common/workbench-session-protocol'
import { WorkbenchSessionClientImpl } from './workbench-session-client'
import { EnvironmentManager } from './environment-manager'
import { createTheiaWorkflowIdeAdapter } from './theia-workflow-ide-adapter'
import { WorkbenchMaterialViewport } from './workbench-material-viewport'
import { WorkbenchSessionGate } from './workbench-session-gate'
import { hasWorkbenchUnsavedChanges } from './workbench-unsaved-changes'

type SourceSaveHandler = (pythonSource: string) => Promise<void>

@injectable()
export class TheiaWorkflowPrototypeWidget extends ReactWidget {
  static readonly ID = 'unilab:authoring-workbench'
  static readonly LABEL = 'UniLab Authoring'

  @inject(EditorManager)
  protected readonly editorManager!: EditorManager

  @inject(ApplicationShell)
  protected readonly shell!: ApplicationShell

  @inject(FileService)
  protected readonly fileService!: FileService

  @inject(WorkbenchSessionServer)
  protected readonly workbenchSession!: WorkbenchSessionServer

  @inject(WorkbenchSessionClient)
  protected readonly workbenchSessionClient!: WorkbenchSessionClientImpl

  @inject(MessageService)
  protected readonly messages!: MessageService

  @inject(ProblemManager)
  protected readonly problemManager!: ProblemManager

  protected editorListeners = new DisposableCollection()
  protected snapshot = createWorkflowIdeSyncState()
  protected ideAdapter!: WorkflowIdeHostAdapter
  protected ideBridge!: WorkflowIdeBridge
  protected diagnosticUris = new Set<string>()
  protected sessionSnapshot: WorkbenchSessionSnapshot = {
    phase: 'idle',
    message: '正在连接 Workbench Backend…',
    configuredGraphPath: 'deployment/graphs/szlab-local-debug.json',
    identity: null,
    diagnostic: null,
    plcSimulator: emptyPlcSimulatorSnapshot()
  }
  protected sourceSaveHandler: SourceSaveHandler | null = null
  protected lastAutomaticSourceSync: string | null = null
  protected workflowPanelDirty = false
  protected lastReportedUnsavedChanges: boolean | null = null
  @postConstruct()
  protected init(): void {
    this.ideAdapter = createTheiaWorkflowIdeAdapter({
      revealSource: location => this.revealResolvedSource(location),
      replaceDiagnostics: diagnostics => this.replaceDiagnostics(diagnostics),
      reportError: message => { void this.messages.error(message) }
    })
    this.ideBridge = this.ideAdapter.bridge
    this.id = TheiaWorkflowPrototypeWidget.ID
    this.title.label = TheiaWorkflowPrototypeWidget.LABEL
    this.title.caption = 'UniLab Material and Workflow Authoring Workbench'
    this.title.closable = false
    this.title.iconClass = 'codicon codicon-type-hierarchy-sub'
    this.toDispose.push(Disposable.create(() => this.editorListeners.dispose()))
    this.toDispose.push(Disposable.create(() => {
      void this.ideAdapter.dispose()
    }))
    this.toDispose.push(Disposable.create(() => {
      publishDesktopUnsavedChanges(false)
    }))
    this.toDispose.push(this.editorManager.onCurrentEditorChanged(() => {
      this.observeCurrentEditor()
    }))
    this.toDispose.push(this.workbenchSessionClient.onSessionChanged(snapshot => {
      this.sessionSnapshot = snapshot
      this.ideAdapter.setPackageMounts(
        snapshot.identity?.packageMounts?.items ?? []
      )
      this.update()
    }))
    void this.refreshSessionSnapshot()
    this.observeCurrentEditor()
    this.update()
  }

  protected async refreshSessionSnapshot(): Promise<void> {
    try {
      this.sessionSnapshot = await this.workbenchSession.getSnapshot()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.sessionSnapshot = {
        phase: 'failed',
        message: 'Workbench Backend 连接失败',
        configuredGraphPath: 'deployment/graphs/szlab-local-debug.json',
        identity: null,
        diagnostic: {
          code: 'os_start_failed',
          message,
          recovery: '确认 Workbench Backend 正在运行后重新加载窗口'
        },
        plcSimulator: emptyPlcSimulatorSnapshot()
      }
    }
    this.ideAdapter.setPackageMounts(
      this.sessionSnapshot.identity?.packageMounts?.items ?? []
    )
    this.update()
  }

  protected readonly retrySession = async (): Promise<void> => {
    try {
      await this.workbenchSession.start()
    } catch {
      // The backend publishes the actionable failed snapshot before rejecting.
    }
    await this.refreshSessionSnapshot()
  }

  protected readonly stopSession = async (): Promise<void> => {
    await this.workbenchSession.stop()
    await this.refreshSessionSnapshot()
  }

  protected readonly restartSession = async (): Promise<void> => {
    try {
      await this.workbenchSession.restart()
    } catch {
      // The backend publishes the actionable failed snapshot before rejecting.
    }
    await this.refreshSessionSnapshot()
  }

  protected readonly readEnvironmentLog = async (
    kind: WorkbenchEnvironmentLogKind
  ): Promise<string> => this.workbenchSession.readEnvironmentLog(
    kind,
    32 * 1024
  )

  protected readonly configurePlcSimulator = async (
    projectPath: string
  ): Promise<void> => {
    try {
      await this.workbenchSession.configurePlcSimulator(projectPath)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      void this.messages.error(`PLC-Sim 配置失败：${message}`)
      throw error
    } finally {
      await this.refreshSessionSnapshot()
    }
  }

  protected readonly configureGraph = async (graphPath: string): Promise<void> => {
    try {
      await this.workbenchSession.configureGraph(graphPath)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      void this.messages.error(`设备图配置失败：${message}`)
      throw error
    } finally {
      await this.refreshSessionSnapshot()
    }
  }

  protected readonly startPlcSimulator = async (): Promise<void> => {
    try {
      await this.workbenchSession.startPlcSimulator()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      void this.messages.error(`PLC-Sim 启动失败：${message}`)
    } finally {
      await this.refreshSessionSnapshot()
    }
  }

  protected readonly stopPlcSimulator = async (): Promise<void> => {
    await this.workbenchSession.stopPlcSimulator()
    await this.refreshSessionSnapshot()
  }

  protected readonly setRuntimeMode = async (
    mode: WorkbenchRuntimeMode
  ): Promise<void> => {
    try {
      await this.workbenchSession.setRuntimeMode(mode)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      void this.messages.error(`OS 模式切换失败：${message}`)
      throw error
    } finally {
      await this.refreshSessionSnapshot()
    }
  }

  protected observeCurrentEditor(render = true): void {
    this.editorListeners.dispose()
    this.editorListeners = new DisposableCollection()
    const editorWidget = this.editorManager.currentEditor
    if (!editorWidget) {
      this.ideAdapter.acceptEditor({
        currentUri: null,
        dirty: false,
        cursor: null
      })
      this.snapshot = this.ideAdapter.snapshot.sync
      this.reportUnsavedChanges()
      if (render) this.update()
      return
    }
    const updateFromEditor = () => this.updateFromEditor(editorWidget)
    this.editorListeners.push(editorWidget.editor.onSelectionChanged(
      updateFromEditor
    ))
    this.editorListeners.push(editorWidget.editor.document.onDirtyChanged(
      updateFromEditor
    ))
    this.updateFromEditor(editorWidget, render)
  }

  protected updateFromEditor(editorWidget: EditorWidget, render = true): void {
    const previous = this.snapshot
    const currentUri = editorWidget.editor.uri.toString()
    const dirty = editorWidget.editor.document.dirty
    let cursor: { line: number; column: number } | null = null
    try {
      const editorCursor = editorWidget.editor.cursor
      cursor = {
        line: editorCursor.line + 1,
        column: editorCursor.character + 1
      }
    } catch {
      // Monaco can transiently have no position while its model is detaching.
    }
    this.ideAdapter.acceptEditor({
      currentUri,
      dirty,
      cursor
    })
    this.snapshot = this.ideAdapter.snapshot.sync
    this.reportUnsavedChanges()
    if (render) this.update()
    if (
      previous.currentUri === currentUri &&
      previous.dirty &&
      !dirty &&
      currentUri === previous.resolvedSourceUri &&
      this.sourceSaveHandler
    ) {
      const pythonSource = editorWidget.editor.document.getText()
      void this.sourceSaveHandler(pythonSource).catch(error => {
        const message = error instanceof Error ? error.message : String(error)
        void this.messages.error(`工作流源码同步失败：${message}`)
      })
    }
  }

  protected readonly registerSourceSaveHandler = (
    handler: SourceSaveHandler | null
  ): void => {
    this.sourceSaveHandler = handler
    if (handler) void this.synchronizeUnmappedSource()
  }

  /**
   * 接收嵌入式工作流面板的双表示 dirty 状态并上报聚合结果。
   *
   * @param hasUnsavedChanges 画布或源码是否还有未保存修改。
   * @returns 无返回值；相同状态不会重复发送 IPC。
   */
  protected readonly setWorkflowPanelDirty = (
    hasUnsavedChanges: boolean
  ): void => {
    this.workflowPanelDirty = hasUnsavedChanges
    this.reportUnsavedChanges()
  }

  /** 汇总全部 Theia 编辑器与工作流面板，并仅在状态变化时通知桌面主进程。 */
  protected reportUnsavedChanges(): void {
    const hasUnsavedChanges = hasWorkbenchUnsavedChanges(
      this.workflowPanelDirty,
      this.editorManager.all.map(widget => widget.editor.document.dirty)
    )
    if (this.lastReportedUnsavedChanges === hasUnsavedChanges) return
    this.lastReportedUnsavedChanges = hasUnsavedChanges
    publishDesktopUnsavedChanges(hasUnsavedChanges)
  }

  protected readonly setSourceProjection = (
    sourceProjection: WorkflowSourceProjection | null
  ): void => {
    // OS mount 到 Theia URI 是纯身份换算，必须和 projection 原子安装。
    // 中间态 update 会允许 React effect cleanup 把同一投影清空，形成竞态。
    const current = this.snapshot.sourceProjection
    if (
      current?.workflowUuid === sourceProjection?.workflowUuid &&
      current?.sourceVersion === sourceProjection?.sourceVersion &&
      current?.sourceUri === sourceProjection?.sourceUri &&
      current?.mappingAvailable === sourceProjection?.mappingAvailable
    ) return
    this.ideAdapter.acceptSourceProjection(sourceProjection)
    this.snapshot = this.ideAdapter.snapshot.sync
    // React effect 正在向宿主发布该投影；此处只更新宿主快照，不能同步要求
    // ReactWidget 重绘，否则 StrictMode/effect cleanup 会重入同一发布路径。
    this.observeCurrentEditor(false)
    void this.synchronizeUnmappedSource()
  }

  /**
   * 对已经落盘但尚无 source map 的源码执行一次同内容 CAS 编译。
   *
   * 文件字节由 Theia 文件服务读取；OS 会再次核对当前 draft hash，因此保存后
   * 发生的并发编辑不会被覆盖。同一源码版本只尝试一次，非法草稿不会形成循环。
   */
  protected async synchronizeUnmappedSource(): Promise<void> {
    const projection = this.snapshot.sourceProjection
    const resolvedSourceUri = this.snapshot.resolvedSourceUri
    const handler = this.sourceSaveHandler
    if (
      !projection || projection.mappingAvailable || !resolvedSourceUri ||
      !handler ||
      (
        this.snapshot.currentUri === resolvedSourceUri &&
        this.snapshot.dirty
      )
    ) return
    const attempt = `${projection.workflowUuid}:${projection.sourceVersion}`
    if (this.lastAutomaticSourceSync === attempt) return
    this.lastAutomaticSourceSync = attempt
    try {
      const source = await this.fileService.read(new URI(resolvedSourceUri))
      await handler(source.value)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      void this.messages.error(`工作流源码补编译失败：${message}`)
    }
  }

  protected readonly revealResolvedSource = async (
    location: WorkflowIdeResolvedLocation
  ): Promise<void> => {
    const uri = new URI(location.resolvedUri)
    const existing = this.editorManager.all.find(
      candidate => candidate.editor.uri.toString() === uri.toString()
    )
    const widget = existing ?? await this.editorManager.open(uri, {
      mode: 'activate',
      widgetOptions: { area: 'main', mode: 'split-right', ref: this }
    })
    if (location.readOnly) {
      const monacoEditor = widget.editor as typeof widget.editor & {
        editor?: { updateOptions(options: { readOnly: boolean }): void }
      }
      monacoEditor.editor?.updateOptions({ readOnly: true })
    }
    if (existing) await this.shell.activateWidget(existing.id)
    const start = {
      line: location.line - 1,
      character: location.column - 1
    }
    const end = {
      line: location.endLine - 1,
      character: location.endColumn - 1
    }
    widget.editor.selection = { start, end, direction: 'ltr' }
    widget.editor.cursor = start
    widget.editor.revealRange({ start, end })
  }

  protected readonly replaceDiagnostics = (
    diagnostics: readonly WorkflowIdeResolvedDiagnostic[]
  ): void => {
    const grouped = new Map<string, Diagnostic[]>()
    for (const diagnostic of diagnostics) {
      const markers = grouped.get(diagnostic.resolvedUri) ?? []
      markers.push({
        range: {
          start: {
            line: diagnostic.line - 1,
            character: diagnostic.column - 1
          },
          end: {
            line: diagnostic.endLine - 1,
            character: diagnostic.endColumn - 1
          }
        },
        severity: theiaDiagnosticSeverity(diagnostic.severity),
        code: diagnostic.code,
        source: diagnostic.source,
        message: diagnostic.message
      })
      grouped.set(diagnostic.resolvedUri, markers)
    }
    for (const uri of this.diagnosticUris) {
      if (!grouped.has(uri)) {
        this.problemManager.setMarkers(new URI(uri), 'unilab', [])
      }
    }
    for (const [uri, markers] of grouped) {
      this.problemManager.setMarkers(new URI(uri), 'unilab', markers)
    }
    this.diagnosticUris = new Set(grouped.keys())
  }

  protected override render(): React.ReactElement {
    if (
      this.sessionSnapshot.phase !== 'ready'
      || !this.sessionSnapshot.identity
    ) {
      return (
        <WorkbenchSessionGate
          snapshot={this.sessionSnapshot}
          onRetry={this.retrySession}
          onStop={this.stopSession}
          renderEnvironmentManager={onClose => (
            <EnvironmentManager
              session={this.sessionSnapshot}
              onClose={onClose}
              onRestartSession={this.restartSession}
              onReadEnvironmentLog={this.readEnvironmentLog}
              onConfigureGraph={this.configureGraph}
              onConfigurePlcSimulator={this.configurePlcSimulator}
              onStartPlcSimulator={this.startPlcSimulator}
              onStopPlcSimulator={this.stopPlcSimulator}
              onSetRuntimeMode={this.setRuntimeMode}
              onStopSession={this.stopSession}
            />
          )}
        />
      )
    }
    return (
      <WorkbenchSurface
        backendUrl={this.sessionSnapshot.identity.backendUrl}
        ideBridge={this.ideBridge}
        session={this.sessionSnapshot}
        onSourceSaveHandlerChange={this.registerSourceSaveHandler}
        onUnsavedChangesChange={this.setWorkflowPanelDirty}
        onRestartSession={this.restartSession}
        onReadEnvironmentLog={this.readEnvironmentLog}
        onConfigureGraph={this.configureGraph}
        onConfigurePlcSimulator={this.configurePlcSimulator}
        onStartPlcSimulator={this.startPlcSimulator}
        onStopPlcSimulator={this.stopPlcSimulator}
        onSetRuntimeMode={this.setRuntimeMode}
        onStopSession={this.stopSession}
      />
    )
  }

  protected override onActivateRequest(message: Message): void {
    super.onActivateRequest(message)
    this.node.querySelector<HTMLElement>('button, input')?.focus()
  }
}

function WorkbenchSurface({
  backendUrl,
  ideBridge,
  session,
  onSourceSaveHandlerChange,
  onUnsavedChangesChange,
  onRestartSession,
  onReadEnvironmentLog,
  onConfigureGraph,
  onConfigurePlcSimulator,
  onStartPlcSimulator,
  onStopPlcSimulator,
  onSetRuntimeMode,
  onStopSession
}: {
  backendUrl: string
  ideBridge: WorkflowIdeBridge
  session: WorkbenchSessionSnapshot
  onSourceSaveHandlerChange: (handler: SourceSaveHandler | null) => void
  onUnsavedChangesChange: (hasUnsavedChanges: boolean) => void
  onRestartSession: () => Promise<void>
  onReadEnvironmentLog: (kind: WorkbenchEnvironmentLogKind) => Promise<string>
  onConfigureGraph: (graphPath: string) => Promise<void>
  onConfigurePlcSimulator: (projectPath: string) => Promise<void>
  onStartPlcSimulator: () => Promise<void>
  onStopPlcSimulator: () => Promise<void>
  onSetRuntimeMode: (mode: WorkbenchRuntimeMode) => Promise<void>
  onStopSession: () => Promise<void>
}): React.JSX.Element {
  const [surface, setSurface] = useState<'workflow' | 'material'>('workflow')
  const [selectedWorkflowNode, setSelectedWorkflowNode] =
    useState<string | null>(null)
  const [runtimeProjection, setRuntimeProjection] =
    useState<WorkflowPanelRuntimeProjection | null>(null)
  const [selectedMaterialIds, setSelectedMaterialIds] =
    useState<readonly MaterialId[]>([])
  const [environmentOpen, setEnvironmentOpen] = useState(false)
  const query = new URLSearchParams(globalThis.location.search)
  const workflowUuid = query.get('workflowUuid') ?? undefined
  const services = useMemo(() => createPrototypeServices(backendUrl), [backendUrl])
  const queryClient = useMemo(() => new QueryClient(), [])
  const scope = useMemo(() => ({ kind: 'singleton' } as const), [])
  const materialStore = useMemo<MaterialStore>(() => createMaterialStore({
    scope,
    graph: services.materials,
    requireCapability: (capability) => {
      assertCapability(services.getCapabilityStatus(capability), capability)
    }
  }), [scope, services])

  useEffect(() => () => materialStore.getState().reset(), [materialStore])

  useEffect(() => () => {
    queryClient.clear()
    services.dispose()
  }, [queryClient, services])

  const synchronizeSavedSource = useCallback(async (pythonSource: string) => {
    if (!workflowUuid) return
    await synchronizeSavedWorkflowSource(
      services.workflow,
      workflowUuid,
      pythonSource
    )
  }, [services, workflowUuid])

  useEffect(() => {
    onSourceSaveHandlerChange(synchronizeSavedSource)
    return () => onSourceSaveHandlerChange(null)
  }, [onSourceSaveHandlerChange, synchronizeSavedSource])

  const highlightedMaterialIds = useMemo(() => {
    const route = runtimeProjection?.materialTransferRoutes.find(
      (candidate) => candidate.workflowNodeUuid === selectedWorkflowNode
    )
    return [
      route?.source.ownerMaterialId,
      route?.target.ownerMaterialId
    ].filter((value): value is string => Boolean(value))
  }, [runtimeProjection, selectedWorkflowNode])

  return (
    <QueryClientProvider client={queryClient}>
      <div
        className="unilab-theia-prototype"
        data-workspace-path={session.identity?.workspacePath ?? ''}
        data-package-mount-count={
          session.identity?.packageMounts?.items.length ?? 0
        }
        data-session-generation={session.identity?.generation ?? ''}
        data-session-mode={session.identity?.mode ?? ''}
        data-workspace-graph-fingerprint={session.identity?.graphFingerprint ?? ''}
        data-package-catalog-revision={
          session.identity?.packageMounts?.catalogRevision ?? ''
        }
      >
        <header className="unilab-theia-prototype__bar">
          <div>
            <strong>UniLab 调试工作台</strong>
            <span>
              OS PID {session.identity?.pid} · {session.identity?.mode} · {backendUrl}
            </span>
          </div>
          <nav aria-label="工作台视图">
            <button
              className={surface === 'workflow' ? 'is-active' : ''}
              onClick={() => setSurface('workflow')}
            >工作流</button>
            <button
              className={surface === 'material' ? 'is-active' : ''}
              onClick={() => setSurface('material')}
            >物料</button>
            <button
              className={environmentOpen ? 'is-active' : ''}
              aria-expanded={environmentOpen}
              onClick={() => setEnvironmentOpen(value => !value)}
            >
              <span
                className={`unilab-environment-trigger__status is-${session.phase}`}
                aria-hidden="true"
              />
              环境管理
            </button>
          </nav>
        </header>
        {environmentOpen ? (
          <EnvironmentManager
            session={session}
            onClose={() => setEnvironmentOpen(false)}
            onRestartSession={onRestartSession}
            onReadEnvironmentLog={onReadEnvironmentLog}
            onConfigureGraph={onConfigureGraph}
            onConfigurePlcSimulator={onConfigurePlcSimulator}
            onStartPlcSimulator={onStartPlcSimulator}
            onStopPlcSimulator={onStopPlcSimulator}
            onSetRuntimeMode={onSetRuntimeMode}
            onStopSession={onStopSession}
          />
        ) : null}
        {surface === 'workflow' ? (
          <section className="unilab-theia-prototype__surface">
            <WorkflowPanel
              runtime={services.workflow}
              active={surface === 'workflow'}
              workflowUuid={workflowUuid}
              hideEmbeddedCodeEditor
              ideBridge={ideBridge}
              onUnsavedChangesChange={onUnsavedChangesChange}
              onSelectedWorkflowStepChange={setSelectedWorkflowNode}
              onWorkflowRuntimeProjectionChange={setRuntimeProjection}
            />
          </section>
        ) : (
          <section className="unilab-theia-prototype__surface">
            <MaterialStoreProvider store={materialStore}>
              <MaterialWorkbench
                catalog={services.materials}
                profileId={`workbench:${backendUrl}`}
                scope={scope}
                capabilities={{
                  readTemplates: services.getCapabilityStatus(
                    'material.readTemplates'
                  ),
                  readGraph: services.getCapabilityStatus(
                    'material.readGraph'
                  ),
                  create: services.getCapabilityStatus('material.create'),
                  updateConfig: services.getCapabilityStatus(
                    'material.updateConfig'
                  ),
                  move: services.getCapabilityStatus('material.move')
                }}
                selectedMaterialIds={selectedMaterialIds}
                highlightedMaterialIds={highlightedMaterialIds}
                onSelectionChange={setSelectedMaterialIds}
                renderViewport={(viewportProps) => (
                  <WorkbenchMaterialViewport
                    {...viewportProps}
                    backendUrl={backendUrl}
                    runtimeProjection={runtimeProjection}
                    selectedWorkflowNode={selectedWorkflowNode}
                  />
                )}
              />
            </MaterialStoreProvider>
          </section>
        )}
      </div>
    </QueryClientProvider>
  )
}

/**
 * 通过可选 Electron 预加载桥发布聚合 dirty 状态；浏览器开发态保持无副作用。
 *
 * @param hasUnsavedChanges 工作台中任一可写表示是否未保存。
 */
function publishDesktopUnsavedChanges(hasUnsavedChanges: boolean): void {
  const desktopApi = (globalThis as typeof globalThis & {
    api?: { unsavedChanges?: { set(value: boolean): void } }
  }).api
  desktopApi?.unsavedChanges?.set(hasUnsavedChanges)
}

function createPrototypeServices(backendUrl: string): Services {
  const backend = getDefaultBackend('local-python')
  const url = backendUrl.replace(/\/$/, '')
  return createServices({
    backend: {
      ...backend,
      apiUrl: url,
      realtimeUrl: url.replace(/^http/, 'ws')
    }
  })
}

function theiaDiagnosticSeverity(
  severity: WorkflowIdeDiagnosticSeverity
): DiagnosticSeverity {
  switch (severity) {
    case 'error': return DiagnosticSeverity.Error
    case 'warning': return DiagnosticSeverity.Warning
    case 'information': return DiagnosticSeverity.Information
    case 'hint': return DiagnosticSeverity.Hint
  }
}

function emptyPlcSimulatorSnapshot(): WorkbenchSessionSnapshot['plcSimulator'] {
  return {
    phase: 'idle',
    message: '尚未连接环境管理器',
    projectPath: '',
    pid: null,
    guiUrl: '',
    opcUaUrl: '',
    logPath: '',
    diagnostic: null
  }
}
