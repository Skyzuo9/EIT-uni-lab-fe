import {
  WORKFLOW_IDE_BRIDGE_COMPATIBILITY,
  WorkflowIdeHostAdapter,
  workflowIdeMappingStatus,
  workflowNodeAtSourcePosition,
  type PackageSourceLocation,
  type WorkflowIdeDiagnostic,
  type WorkflowIdeEditorSnapshot,
  type WorkflowIdeHostAdapterSnapshot,
  type WorkflowIdeHostPort,
  type WorkflowIdeResolvedDiagnostic,
  type WorkflowIdeResolvedLocation,
  type WorkflowPackageMount,
  type WorkflowSourceLocation,
  type WorkflowSourceProjection
} from '@unilab/workflow-ide-bridge'

export type UniLabIdeCompatibility =
  typeof WORKFLOW_IDE_BRIDGE_COMPATIBILITY

export interface UniLabIdePublishedSnapshot {
  compatibility: UniLabIdeCompatibility
  packageMounts: readonly WorkflowPackageMount[]
  sourceProjection: WorkflowSourceProjection | null
  diagnostics: readonly WorkflowIdeDiagnostic[]
}

export interface UniLabEditorContext {
  activeSourceUri: string | null
  sourcePosition: { line: number; column: number } | null
  workflowUuid: string | null
  workflowNodeUuid: string | null
  mappingStatus: ReturnType<typeof workflowIdeMappingStatus>
}

export interface DisposableLike {
  dispose(): void
}

/** Native VS Code calls live behind this narrow testable port. */
export interface VscodeIdeHostFacade {
  activeEditorSnapshot(): WorkflowIdeEditorSnapshot
  onDidChangeEditor(listener: () => void): DisposableLike
  revealSource(location: WorkflowIdeResolvedLocation): Promise<void>
  replaceDiagnostics(
    diagnostics: readonly WorkflowIdeResolvedDiagnostic[]
  ): void | Promise<void>
  setStatus(context: UniLabEditorContext): void
  reportError(message: string): void
}

export interface UniLabIdeExtensionApi {
  readonly compatibility: UniLabIdeCompatibility
  publishSnapshot(snapshot: UniLabIdePublishedSnapshot): Promise<void>
  clearSnapshot(): Promise<void>
  openWorkflowSource(location: WorkflowSourceLocation): Promise<void>
  openPackageSource(location: PackageSourceLocation): Promise<void>
  readonly editorContext: UniLabEditorContext
  onDidChangeEditorContext(
    listener: (context: UniLabEditorContext) => void
  ): DisposableLike
}

export class VscodeWorkflowIdeAdapter
implements UniLabIdeExtensionApi, DisposableLike {
  readonly compatibility = WORKFLOW_IDE_BRIDGE_COMPATIBILITY

  private readonly core: WorkflowIdeHostAdapter
  private readonly editorSubscription: DisposableLike
  private readonly listeners = new Set<(context: UniLabEditorContext) => void>()
  private currentContext: UniLabEditorContext = {
    activeSourceUri: null,
    sourcePosition: null,
    workflowUuid: null,
    workflowNodeUuid: null,
    mappingStatus: 'active'
  }

  constructor(private readonly host: VscodeIdeHostFacade) {
    this.core = createVscodeWorkflowIdeAdapterCore({
      revealSource: location => host.revealSource(location),
      replaceDiagnostics: diagnostics => host.replaceDiagnostics(diagnostics),
      reportError: message => host.reportError(message)
    }, () => this.publishEditorContext())
    this.editorSubscription = host.onDidChangeEditor(() => {
      this.core.acceptEditor(host.activeEditorSnapshot())
    })
    this.core.acceptEditor(host.activeEditorSnapshot())
  }

  get editorContext(): UniLabEditorContext {
    return this.currentContext
  }

  async publishSnapshot(snapshot: UniLabIdePublishedSnapshot): Promise<void> {
    assertCompatibility(snapshot.compatibility)
    this.core.setPackageMounts(snapshot.packageMounts)
    this.core.acceptSourceProjection(snapshot.sourceProjection)
    await this.core.acceptDiagnostics(snapshot.diagnostics)
  }

  async clearSnapshot(): Promise<void> {
    this.core.acceptSourceProjection(null)
    this.core.setPackageMounts([])
    await this.core.acceptDiagnostics([])
  }

  openWorkflowSource(location: WorkflowSourceLocation): Promise<void> {
    return this.core.revealSource(location)
  }

  openPackageSource(location: PackageSourceLocation): Promise<void> {
    return this.core.revealSource(location)
  }

  onDidChangeEditorContext(
    listener: (context: UniLabEditorContext) => void
  ): DisposableLike {
    this.listeners.add(listener)
    return { dispose: () => this.listeners.delete(listener) }
  }

  dispose(): void {
    this.editorSubscription.dispose()
    this.listeners.clear()
    void this.core.dispose()
  }

  private publishEditorContext(): void {
    const snapshot = this.core.snapshot
    const projection = snapshot.sync.sourceProjection
    const sourcePosition = snapshot.sync.sourcePosition
    this.currentContext = {
      activeSourceUri: snapshot.activeSourceUri,
      sourcePosition,
      workflowUuid: projection?.workflowUuid ?? null,
      workflowNodeUuid: projection && sourcePosition
        ? workflowNodeAtSourcePosition(projection.sourceMap, sourcePosition)
        : null,
      mappingStatus: workflowIdeMappingStatus(snapshot.sync)
    }
    this.host.setStatus(this.currentContext)
    for (const listener of this.listeners) listener(this.currentContext)
  }
}

/** VS Code's real native adapter entrypoint for the shared host-neutral core. */
export function createVscodeWorkflowIdeAdapterCore(
  host: WorkflowIdeHostPort,
  onSnapshotChange?: (snapshot: WorkflowIdeHostAdapterSnapshot) => void
): WorkflowIdeHostAdapter {
  return new WorkflowIdeHostAdapter(host, onSnapshotChange)
}

export function assertCompatibility(
  actual: UniLabIdeCompatibility
): void {
  for (const [key, expected] of Object.entries(
    WORKFLOW_IDE_BRIDGE_COMPATIBILITY
  )) {
    if (actual?.[key as keyof UniLabIdeCompatibility] !== expected) {
      throw new Error(
        `UniLab IDE bridge compatibility mismatch: ${key} must be ${expected}`
      )
    }
  }
}
