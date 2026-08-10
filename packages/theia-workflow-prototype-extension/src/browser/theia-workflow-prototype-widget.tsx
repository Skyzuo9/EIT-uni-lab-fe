import { EditorManager, EditorWidget } from '@theia/editor/lib/browser'
import { FileService } from '@theia/filesystem/lib/browser/file-service'
import { ApplicationShell, Message } from '@theia/core/lib/browser'
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget'
import URI from '@theia/core/lib/common/uri'
import {
  Disposable,
  DisposableCollection
} from '@theia/core/lib/common/disposable'
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify'
import { WorkspaceService } from '@theia/workspace/lib/browser'
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
  reduceWorkflowIdeSync,
  synchronizeSavedWorkflowSource,
  workflowIdeMappingStatus,
  workflowPackageCandidatePaths,
  type WorkflowIdeBridge,
  type WorkflowIdeSyncState,
  type WorkflowSourceLocation,
  type WorkflowSourceProjection
} from '@unilab/workflow-ide-bridge'
import * as React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'

type SourceSaveHandler = (pythonSource: string) => Promise<void>

@injectable()
export class TheiaWorkflowPrototypeWidget extends ReactWidget {
  static readonly ID = 'unilab:theia-workflow-prototype'
  static readonly LABEL = 'Uni-Lab Workflow'

  @inject(EditorManager)
  protected readonly editorManager!: EditorManager

  @inject(ApplicationShell)
  protected readonly shell!: ApplicationShell

  @inject(FileService)
  protected readonly fileService!: FileService

  @inject(WorkspaceService)
  protected readonly workspaceService!: WorkspaceService

  protected editorListeners = new DisposableCollection()
  protected snapshot = createWorkflowIdeSyncState()
  protected sourceSaveHandler: SourceSaveHandler | null = null

  @postConstruct()
  protected init(): void {
    this.id = TheiaWorkflowPrototypeWidget.ID
    this.title.label = TheiaWorkflowPrototypeWidget.LABEL
    this.title.caption = 'Workflow / material integration prototype'
    this.title.closable = false
    this.title.iconClass = 'codicon codicon-type-hierarchy-sub'
    this.toDispose.push(Disposable.create(() => this.editorListeners.dispose()))
    this.toDispose.push(this.editorManager.onCurrentEditorChanged(() => {
      this.observeCurrentEditor()
    }))
    this.observeCurrentEditor()
    this.update()
  }

  protected observeCurrentEditor(): void {
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
      this.update()
      return
    }
    const updateFromEditor = () => this.updateFromEditor(editorWidget)
    this.editorListeners.push(editorWidget.editor.onSelectionChanged(
      updateFromEditor
    ))
    this.editorListeners.push(editorWidget.editor.document.onDirtyChanged(
      updateFromEditor
    ))
    updateFromEditor()
  }

  protected updateFromEditor(editorWidget: EditorWidget): void {
    const previous = this.snapshot
    const currentUri = editorWidget.editor.uri.toString()
    const dirty = editorWidget.editor.document.dirty
    const cursor = editorWidget.editor.cursor
    this.snapshot = reduceWorkflowIdeSync(this.snapshot, {
      type: 'editor-changed',
      currentUri,
      dirty,
      cursor: { line: cursor.line + 1, column: cursor.character + 1 }
    })
    this.update()
    if (
      previous.currentUri === currentUri &&
      previous.dirty &&
      !dirty &&
      currentUri === previous.resolvedSourceUri &&
      this.sourceSaveHandler
    ) {
      const pythonSource = editorWidget.editor.document.getText()
      void this.sourceSaveHandler(pythonSource).catch(() => undefined)
    }
  }

  protected readonly registerSourceSaveHandler = (
    handler: SourceSaveHandler | null
  ): void => {
    this.sourceSaveHandler = handler
  }

  protected readonly setSourceProjection = async (
    sourceProjection: WorkflowSourceProjection | null
  ): Promise<void> => {
    const resolved = sourceProjection
      ? await this.resolveSourceUri(sourceProjection.sourceUri)
      : null
    this.snapshot = reduceWorkflowIdeSync(this.snapshot, {
      type: 'source-projection-changed',
      projection: sourceProjection,
      resolvedSourceUri: resolved?.toString() ?? null
    })
    this.observeCurrentEditor()
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

  protected async resolveSourceUri(sourceUri: string): Promise<URI | null> {
    if (sourceUri.startsWith('file://')) return new URI(sourceUri)
    const candidatePaths = workflowPackageCandidatePaths(sourceUri)
    const roots = await this.workspaceService.roots
    for (const root of roots) {
      for (const candidatePath of candidatePaths) {
        const candidate = root.resource.resolve(candidatePath)
        if (await this.fileService.exists(candidate)) return candidate
      }
    }
    return roots[0]?.resource.resolve(candidatePaths[0] ?? '') ?? null
  }

  protected override render(): React.ReactElement {
    const ideBridge: WorkflowIdeBridge = {
      sourcePosition: this.snapshot.sourcePosition,
      onRevealSourceLocation: this.revealSourceLocation,
      onSourceProjectionChange: this.setSourceProjection
    }
    return (
      <PrototypeSurface
        ideBridge={ideBridge}
        snapshot={this.snapshot}
        onSourceSaveHandlerChange={this.registerSourceSaveHandler}
      />
    )
  }

  protected override onActivateRequest(message: Message): void {
    super.onActivateRequest(message)
    this.node.querySelector<HTMLElement>('button, input')?.focus()
  }
}

function PrototypeSurface({
  ideBridge,
  snapshot,
  onSourceSaveHandlerChange
}: {
  ideBridge: WorkflowIdeBridge
  snapshot: WorkflowIdeSyncState
  onSourceSaveHandlerChange: (handler: SourceSaveHandler | null) => void
}): React.JSX.Element {
  const [surface, setSurface] = useState<'workflow' | 'material'>('workflow')
  const [selectedWorkflowNode, setSelectedWorkflowNode] =
    useState<string | null>(null)
  const [runtimeProjection, setRuntimeProjection] =
    useState<WorkflowPanelRuntimeProjection | null>(null)
  const [selectedMaterialIds, setSelectedMaterialIds] =
    useState<readonly MaterialId[]>([])
  const [sourceSaveStatus, setSourceSaveStatus] = useState('idle')
  const query = new URLSearchParams(globalThis.location.search)
  const backendUrl = query.get('backend') ?? 'http://127.0.0.1:18003'
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

  useEffect(() => {
    void materialStore.getState().loadGraph().catch(() => undefined)
    return () => materialStore.getState().reset()
  }, [materialStore])

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
      <div className="unilab-theia-prototype">
        <header className="unilab-theia-prototype__bar">
          <div>
            <strong>Uni-Lab / Theia integration slice</strong>
            <span>OS {backendUrl}</span>
          </div>
          <nav aria-label="Prototype surface">
            <button
              className={surface === 'workflow' ? 'is-active' : ''}
              onClick={() => setSurface('workflow')}
            >Workflow</button>
            <button
              className={surface === 'material' ? 'is-active' : ''}
              onClick={() => setSurface('material')}
            >Material</button>
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
                profileId={`prototype:${backendUrl}`}
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
              />
            </MaterialStoreProvider>
          </section>
        )}
      </div>
    </QueryClientProvider>
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
