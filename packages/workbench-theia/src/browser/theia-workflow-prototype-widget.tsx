import { EditorManager, EditorWidget } from '@theia/editor/lib/browser'
import { FileService } from '@theia/filesystem/lib/browser/file-service'
import { ApplicationShell, Message } from '@theia/core/lib/browser'
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget'
import { MessageService } from '@theia/core/lib/common/message-service'
import { URI } from '@theia/core/lib/common/uri'
import {
  Disposable,
  DisposableCollection
} from '@theia/core/lib/common/disposable'
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  MaterialCapabilityNotice,
  MaterialStoreProvider,
  MaterialWorkbench,
  UnifiedMaterialViewport,
  createMaterialStore,
  useMaterialStore,
  useMaterialStoreApi,
  type MaterialId,
  type MaterialStore,
  type MaterialWorkbenchViewportProps
} from '@unilab/material'
import type {
  MaterialSceneMove,
  MaterialTransferSceneRoute
} from '@unilab/pascal-lab-plugin'
import { ensurePascalRendererDefaults } from '@unilab/pascal-host'
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
  packageSourceUriForResolvedUri,
  reduceWorkflowIdeSync,
  resolveWorkflowPackageSource,
  resolveWorkflowPackageSourceUri,
  synchronizeSavedWorkflowSource,
  workflowIdeMappingStatus,
  type WorkflowIdeBridge,
  type PackageSourceLocation,
  type WorkflowIdeSyncState,
  type WorkflowSourceLocation,
  type WorkflowSourceProjection
} from '@unilab/workflow-ide-bridge'
import type { WorkbenchSessionSnapshot } from '@unilab/workbench-session'
import * as React from 'react'
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState
} from 'react'

ensurePascalRendererDefaults()

const PascalLabWorkbench = React.lazy(async () => {
  const module = await import('@unilab/pascal-lab-plugin')
  return { default: module.PascalLabWorkbench }
})

import {
  WorkbenchSessionClient,
  WorkbenchSessionServer
} from '../common/workbench-session-protocol'
import { WorkbenchSessionClientImpl } from './workbench-session-client'

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

  protected editorListeners = new DisposableCollection()
  protected snapshot = createWorkflowIdeSyncState()
  protected sessionSnapshot: WorkbenchSessionSnapshot = {
    phase: 'idle',
    message: '正在连接 Workbench Backend…',
    identity: null,
    diagnostic: null
  }
  protected sourceSaveHandler: SourceSaveHandler | null = null
  protected lastAutomaticSourceSync: string | null = null
  /** React 重绘之间保持同一宿主端口身份，避免投影 effect 被当作换宿主清理。 */
  protected readonly ideBridge: WorkflowIdeBridge = {
    onRevealSourceLocation: location => {
      void this.revealSourceLocation(location)
    },
    onRevealPackageSource: location => {
      void this.revealPackageSource(location)
    },
    onSourceProjectionChange: projection => {
      this.setSourceProjection(projection)
    }
  }

  @postConstruct()
  protected init(): void {
    this.id = TheiaWorkflowPrototypeWidget.ID
    this.title.label = TheiaWorkflowPrototypeWidget.LABEL
    this.title.caption = 'UniLab Material and Workflow Authoring Workbench'
    this.title.closable = false
    this.title.iconClass = 'codicon codicon-type-hierarchy-sub'
    this.toDispose.push(Disposable.create(() => this.editorListeners.dispose()))
    this.toDispose.push(this.editorManager.onCurrentEditorChanged(() => {
      this.observeCurrentEditor()
    }))
    this.toDispose.push(this.workbenchSessionClient.onSessionChanged(snapshot => {
      this.sessionSnapshot = snapshot
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
        identity: null,
        diagnostic: {
          code: 'os_start_failed',
          message,
          recovery: '确认 Workbench Backend 正在运行后重新加载窗口'
        }
      }
    }
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

  protected readonly readSessionLogTail = async (): Promise<string> => (
    this.workbenchSession.readLogTail(32 * 1024)
  )

  protected observeCurrentEditor(render = true): void {
    this.editorListeners.dispose()
    this.editorListeners = new DisposableCollection()
    const editorWidget = this.editorManager.currentEditor
    if (!editorWidget) {
      this.snapshot = reduceWorkflowIdeSync(this.snapshot, {
        type: 'editor-changed',
        currentUri: null,
        dirty: false,
        cursor: null
      })
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
    this.snapshot = reduceWorkflowIdeSync(this.snapshot, {
      type: 'editor-changed',
      currentUri,
      dirty,
      cursor
    })
    this.ideBridge.sourcePosition = this.snapshot.sourcePosition
    this.ideBridge.activeSourceUri = packageSourceUriForResolvedUri(
      currentUri,
      this.sessionSnapshot.identity?.packageMounts?.items ?? []
    )
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

  protected readonly setSourceProjection = (
    sourceProjection: WorkflowSourceProjection | null
  ): void => {
    // OS mount 到 Theia URI 是纯身份换算，必须和 projection 原子安装。
    // 中间态 update 会允许 React effect cleanup 把同一投影清空，形成竞态。
    const resolved = sourceProjection
      ? this.resolveSourceUri(sourceProjection.sourceUri)
      : null
    const current = this.snapshot.sourceProjection
    if (
      current?.workflowUuid === sourceProjection?.workflowUuid &&
      current?.sourceVersion === sourceProjection?.sourceVersion &&
      current?.sourceUri === sourceProjection?.sourceUri &&
      current?.mappingAvailable === sourceProjection?.mappingAvailable &&
      this.snapshot.resolvedSourceUri === (resolved?.toString() ?? null)
    ) return
    this.snapshot = reduceWorkflowIdeSync(this.snapshot, {
      type: 'source-projection-changed',
      projection: sourceProjection,
      resolvedSourceUri: resolved?.toString() ?? null
    })
    // React effect 正在向宿主发布该投影；此处只更新宿主快照，不能同步要求
    // ReactWidget 重绘，否则 StrictMode/effect cleanup 会重入同一发布路径。
    this.observeCurrentEditor(false)
    this.ideBridge.sourcePosition = this.snapshot.sourcePosition
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

  protected readonly revealSourceLocation = async (
    location: WorkflowSourceLocation
  ): Promise<void> => {
    const uri = await this.resolveSourceUri(location.sourceUri)
    if (!uri) return
    const existing = this.editorManager.all.find(
      candidate => candidate.editor.uri.toString() === uri.toString()
    )
    const widget = existing ?? await this.editorManager.open(uri, {
      mode: 'activate',
      widgetOptions: {
        area: 'main',
        mode: 'split-right',
        ref: this
      }
    })
    const packageMounts = this.sessionSnapshot.identity?.packageMounts?.items ?? []
    const packageSource = resolveWorkflowPackageSource(
      location.sourceUri,
      packageMounts
    )
    if (packageSource?.mount.readOnly) {
      const monacoEditor = widget.editor as typeof widget.editor & {
        editor?: { updateOptions(options: { readOnly: boolean }): void }
      }
      monacoEditor.editor?.updateOptions({ readOnly: true })
    }
    if (existing) await this.shell.activateWidget(existing.id)
    const start = {
      line: Math.max(0, location.line - 1),
      character: Math.max(0, location.column - 1)
    }
    const end = {
      line: Math.max(0, location.endLine - 1),
      character: Math.max(0, location.endColumn - 1)
    }
    widget.editor.selection = { start, end, direction: 'ltr' }
    widget.editor.cursor = start
    widget.editor.revealRange({ start, end })
  }

  protected readonly revealPackageSource = async (
    location: PackageSourceLocation
  ): Promise<void> => {
    const uri = this.resolveSourceUri(location.sourceUri)
    if (!uri) return
    const existing = this.editorManager.all.find(
      candidate => candidate.editor.uri.toString() === uri.toString()
    )
    const widget = existing ?? await this.editorManager.open(uri, {
      mode: 'activate',
      widgetOptions: { area: 'main', mode: 'split-right', ref: this }
    })
    if (existing) await this.shell.activateWidget(existing.id)
    const start = {
      line: Math.max(0, (location.line ?? 1) - 1),
      character: Math.max(0, (location.column ?? 1) - 1)
    }
    const end = {
      line: Math.max(0, (location.endLine ?? location.line ?? 1) - 1),
      character: Math.max(0, (location.endColumn ?? location.column ?? 1) - 1)
    }
    widget.editor.selection = { start, end, direction: 'ltr' }
    widget.editor.cursor = start
    widget.editor.revealRange({ start, end })
  }

  protected resolveSourceUri(sourceUri: string): URI | null {
    if (sourceUri.startsWith('file://')) return new URI(sourceUri)
    const packageMounts = this.sessionSnapshot.identity?.packageMounts?.items ?? []
    const resolved = resolveWorkflowPackageSourceUri(sourceUri, packageMounts)
    if (!resolved) {
      void this.messages.error(`OS 未发布源码软件包挂载：${sourceUri}`)
      return null
    }
    const uri = new URI(resolved)
    // package mount 是 OS 同代签发的身份合同；不要在投影阶段用异步 exists
    // 再造一个文件权威。实际打开/读取失败由对应操作报告完整 FileService 诊断。
    return uri
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
        />
      )
    }
    this.ideBridge.sourcePosition = this.snapshot.sourcePosition
    return (
      <WorkbenchSurface
        backendUrl={this.sessionSnapshot.identity.backendUrl}
        ideBridge={this.ideBridge}
        session={this.sessionSnapshot}
        snapshot={this.snapshot}
        onSourceSaveHandlerChange={this.registerSourceSaveHandler}
        onRestartSession={this.restartSession}
        onReadSessionLogTail={this.readSessionLogTail}
        onStopSession={this.stopSession}
      />
    )
  }

  protected override onActivateRequest(message: Message): void {
    super.onActivateRequest(message)
    this.node.querySelector<HTMLElement>('button, input')?.focus()
  }
}

function WorkbenchSessionGate({
  snapshot,
  onRetry,
  onStop
}: {
  snapshot: WorkbenchSessionSnapshot
  onRetry: () => Promise<void>
  onStop: () => Promise<void>
}): React.JSX.Element {
  return (
    <div className="unilab-theia-prototype unilab-workbench-session-gate">
      <section className="unilab-workbench-session-card" aria-live="polite">
        <span className={`unilab-workbench-session-phase is-${snapshot.phase}`}>
          {snapshot.phase}
        </span>
        <h2>UniLab Authoring Workbench</h2>
        <p>{snapshot.message}</p>
        {snapshot.identity ? (
          <dl>
            <dt>Workspace</dt>
            <dd>{snapshot.identity.workspacePath}</dd>
            <dt>OS PID</dt>
            <dd>{snapshot.identity.pid || '—'}</dd>
            <dt>Generation</dt>
            <dd>{snapshot.identity.generation}</dd>
            <dt>Backend</dt>
            <dd>{snapshot.identity.backendUrl}</dd>
            <dt>Log</dt>
            <dd>{snapshot.identity.logPath}</dd>
          </dl>
        ) : null}
        {snapshot.diagnostic ? (
          <div className="unilab-workbench-session-diagnostic" role="alert">
            <strong>{snapshot.diagnostic.code}</strong>
            <p>{snapshot.diagnostic.message}</p>
            <p>{snapshot.diagnostic.recovery}</p>
          </div>
        ) : null}
        {snapshot.phase === 'idle' || snapshot.phase === 'failed' ? (
          <button onClick={() => void onRetry()}>校验并启动</button>
        ) : null}
        {snapshot.phase === 'starting' || snapshot.phase === 'waiting' ? (
          <button onClick={() => void onStop()}>停止</button>
        ) : null}
      </section>
    </div>
  )
}

function WorkbenchSurface({
  backendUrl,
  ideBridge,
  session,
  snapshot,
  onSourceSaveHandlerChange,
  onRestartSession,
  onReadSessionLogTail,
  onStopSession
}: {
  backendUrl: string
  ideBridge: WorkflowIdeBridge
  session: WorkbenchSessionSnapshot
  snapshot: WorkflowIdeSyncState
  onSourceSaveHandlerChange: (handler: SourceSaveHandler | null) => void
  onRestartSession: () => Promise<void>
  onReadSessionLogTail: () => Promise<string>
  onStopSession: () => Promise<void>
}): React.JSX.Element {
  const [surface, setSurface] = useState<'workflow' | 'material'>('workflow')
  const [selectedWorkflowNode, setSelectedWorkflowNode] =
    useState<string | null>(null)
  const [runtimeProjection, setRuntimeProjection] =
    useState<WorkflowPanelRuntimeProjection | null>(null)
  const [selectedMaterialIds, setSelectedMaterialIds] =
    useState<readonly MaterialId[]>([])
  const [sourceSaveStatus, setSourceSaveStatus] = useState('idle')
  const [sessionLogTail, setSessionLogTail] = useState<string | null>(null)
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
    setSourceSaveStatus('syncing')
    try {
      const outcome = await synchronizeSavedWorkflowSource(
        services.workflow,
        workflowUuid,
        pythonSource
      )
      setSourceSaveStatus(outcome)
    } catch (error) {
      setSourceSaveStatus(error instanceof Error ? error.message : 'failed')
      throw error
    }
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
            <strong>UniLab Authoring Workbench</strong>
            <span>
              OS PID {session.identity?.pid} · {session.identity?.mode} · {backendUrl}
            </span>
          </div>
          <nav aria-label="Authoring surface">
            <button
              className={surface === 'workflow' ? 'is-active' : ''}
              onClick={() => setSurface('workflow')}
            >Workflow</button>
            <button
              className={surface === 'material' ? 'is-active' : ''}
              onClick={() => setSurface('material')}
            >Material</button>
            <button onClick={() => void onRestartSession()}>重启 OS</button>
            <button onClick={() => {
              void onReadSessionLogTail().then(setSessionLogTail)
            }}>查看 OS 日志</button>
            <button onClick={() => void onStopSession()}>停止 OS</button>
          </nav>
        </header>
        <details className="unilab-theia-prototype__debug">
          <summary>同步状态</summary>
          <dl>
            <dt>source URI</dt>
            <dd data-testid="sync-source-uri">{snapshot.sourceProjection?.sourceUri ?? '—'}</dd>
            <dt>resolved file</dt>
            <dd data-testid="sync-resolved-file">{snapshot.resolvedSourceUri ?? '—'}</dd>
            <dt>Monaco</dt>
            <dd data-testid="sync-monaco-uri">{snapshot.currentUri ?? '—'}</dd>
            <dt>mapping</dt>
            <dd data-testid="sync-mapping">{workflowIdeMappingStatus(snapshot)}</dd>
            <dt>cursor</dt>
            <dd data-testid="sync-cursor">{snapshot.sourcePosition
              ? `${snapshot.sourcePosition.line}:${snapshot.sourcePosition.column}`
              : '—'}</dd>
            <dt>node</dt>
            <dd data-testid="sync-node">{selectedWorkflowNode ?? '—'}</dd>
            <dt>saved source</dt>
            <dd data-testid="sync-save-status">{sourceSaveStatus}</dd>
          </dl>
        </details>
        {sessionLogTail !== null ? (
          <details open className="unilab-theia-prototype__debug">
            <summary>OS 日志尾部</summary>
            <pre data-testid="session-log-tail">{sessionLogTail || '暂无日志'}</pre>
          </details>
        ) : null}
        {surface === 'workflow' ? (
          <section className="unilab-theia-prototype__surface">
            <WorkflowPanel
              runtime={services.workflow}
              active={surface === 'workflow'}
              workflowUuid={workflowUuid}
              hideEmbeddedCodeEditor
              ideBridge={ideBridge}
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

function WorkbenchMaterialViewport({
  backendUrl,
  runtimeProjection,
  selectedWorkflowNode,
  readStatus,
  moveStatus,
  selectedMaterialIds,
  highlightedMaterialIds,
  onSelectionChange
}: MaterialWorkbenchViewportProps & {
  backendUrl: string
  runtimeProjection: WorkflowPanelRuntimeProjection | null
  selectedWorkflowNode: string | null
}): React.JSX.Element {
  const store = useMaterialStoreApi()
  const aggregatesById = useMaterialStore((state) => state.aggregatesById)
  const shapeLibrary = useMaterialStore((state) => state.shapeLibrary)
  const loadState = useMaterialStore((state) => state.loadState)
  const aggregates = useMemo(
    () => Object.values(aggregatesById),
    [aggregatesById]
  )
  const materialTransferRoutes = useMemo<MaterialTransferSceneRoute[]>(
    () => (runtimeProjection?.materialTransferRoutes ?? []).map((route) => ({
      ...route,
      selected: route.workflowNodeUuid === selectedWorkflowNode
    })),
    [runtimeProjection, selectedWorkflowNode]
  )
  const modelRuntime = useMemo(() => ({
    resolveUrl: (model: { path: string }) => {
      if (!model.path || /^https?:\/\//u.test(model.path)) return model.path
      return new URL(
        model.path,
        `${backendUrl.replace(/\/+$/u, '')}/`
      ).toString()
    }
  }), [backendUrl])

  useEffect(() => {
    if (!readStatus.available || loadState !== 'idle') return
    void store.getState().loadGraph().catch(() => undefined)
  }, [loadState, readStatus.available, store])

  const applyMoves = useCallback(async (
    moves: readonly MaterialSceneMove[]
  ): Promise<void> => {
    for (const move of moves) {
      await store.getState().move(move.materialId, move.placement)
    }
  }, [store])

  if (!readStatus.available) {
    return (
      <MaterialCapabilityNotice
        title="物料场景不可用"
        status={readStatus}
      />
    )
  }

  if (loadState === 'idle' || loadState === 'loading') {
    return <div className="unilab-workbench-material-loading">正在加载物料场景…</div>
  }

  return (
    <UnifiedMaterialViewport
      renderView={(viewMode, { showSites, showMaterialTransfers }) => (
        <Suspense
          fallback={(
            <div className="unilab-workbench-material-loading">
              正在加载 {viewMode === '3d' || viewMode === 'split'
                ? '3D'
                : viewMode} 物料视图…
            </div>
          )}
        >
          <PascalLabWorkbench
            aggregates={aggregates}
            shapes={shapeLibrary}
            showSites={showSites}
            showMaterialTransfers={showMaterialTransfers}
            materialTransferRoutes={materialTransferRoutes}
            materialTransferProjectionError={null}
            viewMode={viewMode}
            projectId={`unilab-workbench-${new URL(backendUrl).port}`}
            editable={moveStatus.available}
            selectedMaterialIds={selectedMaterialIds}
            highlightedMaterialIds={highlightedMaterialIds}
            modelRuntime={modelRuntime}
            onMaterialMoves={(moves) => void applyMoves(moves)}
            onSelectionChange={(materialIds) => {
              onSelectionChange?.(materialIds)
            }}
          />
        </Suspense>
      )}
    />
  )
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
