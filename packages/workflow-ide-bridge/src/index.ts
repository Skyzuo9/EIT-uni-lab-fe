/** OS source-map 的最小宿主无关合同。 */
export interface WorkflowSourceMapEntry {
  workflow_node_uuid: string
  start_line: number
  start_column: number
  end_line: number
  end_column: number
}

/** Monaco、VS Code 与 OS 都使用的一基、UTF-16 源码位置。 */
export interface WorkflowSourcePosition {
  line: number
  column: number
}

export interface WorkflowSourceLocation extends WorkflowSourcePosition {
  workflowUuid: string
  workflowNodeUuid: string
  sourceUri: string
  endLine: number
  endColumn: number
}

export interface WorkflowSourceProjection {
  workflowUuid: string
  sourceUri: string
  /** OS 已观测源码代；mappingAvailable 时也与 sourceMap 属于同一结果。 */
  sourceVersion: string
  /** false 表示只绑定了已保存文件，仍在等待 OS 签发 source map。 */
  mappingAvailable: boolean
  sourceMap: readonly WorkflowSourceMapEntry[]
}

/** Workflow React surface 与任意 IDE 宿主之间唯一需要实现的端口。 */
export interface WorkflowIdeBridge {
  /** 外部编辑器当前光标；宿主在文件 dirty 时应传 null。 */
  sourcePosition?: WorkflowSourcePosition | null
  onRevealSourceLocation?: (location: WorkflowSourceLocation) => void
  onSourceProjectionChange?: (
    projection: WorkflowSourceProjection | null
  ) => void
}

export interface WorkflowPackageSource {
  packageId: string
  relativePath: string
}

export interface WorkflowSavedSourceRuntime {
  getWorkflowAuthoring: (workflowUuid: string) => Promise<{
    workflow_revision: number
    draft: {
      python_source: string
      draft_hash: string
    } | null
  }>
  saveWorkflowAuthoringDraft: (
    workflowUuid: string,
    request: {
      python_source: string
      expected_draft_hash: string | null
      expected_workflow_revision: number
    }
  ) => Promise<{
    workflow_revision: number
    draft: {
      python_source: string
      draft_hash: string
    } | null
    candidate: {
      draft_hash: string
      normalized_python_source: string
    } | null
  }>
}

export type WorkflowSavedSourceSyncResult =
  | 'compiled'
  | 'normalized'
  | 'source-changed'
  | 'source-unavailable'

export type WorkflowIdeMappingStatus =
  | 'active'
  | 'paused: unsaved file'
  | 'paused: waiting for OS source map'

/** VS Code 与 Theia adapter 共用的编辑器同步状态。 */
export interface WorkflowIdeSyncState {
  currentUri: string | null
  dirty: boolean
  cursor: WorkflowSourcePosition | null
  sourcePosition: WorkflowSourcePosition | null
  sourceProjection: WorkflowSourceProjection | null
  resolvedSourceUri: string | null
  staleSourceVersion: string | null
}

export type WorkflowIdeSyncEvent =
  | {
    type: 'source-projection-changed'
    projection: WorkflowSourceProjection | null
    resolvedSourceUri: string | null
  }
  | {
    type: 'editor-changed'
    currentUri: string | null
    dirty: boolean
    cursor: WorkflowSourcePosition | null
  }

export function createWorkflowIdeSyncState(): WorkflowIdeSyncState {
  return deriveSourcePosition({
    currentUri: null,
    dirty: false,
    cursor: null,
    sourcePosition: null,
    sourceProjection: null,
    resolvedSourceUri: null,
    staleSourceVersion: null
  })
}

/**
 * 纯状态机：dirty 后暂停反向映射，保存后继续等待 OS 发布不同 sourceVersion。
 * 宿主 adapter 只负责把自身事件和 URI 解析结果送入这里。
 */
export function reduceWorkflowIdeSync(
  state: WorkflowIdeSyncState,
  event: WorkflowIdeSyncEvent
): WorkflowIdeSyncState {
  if (event.type === 'source-projection-changed') {
    const staleSourceVersion = event.projection && state.staleSourceVersion &&
      event.projection.sourceVersion !== state.staleSourceVersion
      ? null
      : state.staleSourceVersion
    return deriveSourcePosition({
      ...state,
      sourceProjection: event.projection,
      resolvedSourceUri: event.resolvedSourceUri,
      staleSourceVersion: event.projection ? staleSourceVersion : null
    })
  }

  const projectedSource = Boolean(
    event.currentUri && event.currentUri === state.resolvedSourceUri
  )
  const staleSourceVersion = projectedSource && event.dirty &&
    state.staleSourceVersion === null
    ? state.sourceProjection?.sourceVersion ?? 'unmapped'
    : state.staleSourceVersion
  return deriveSourcePosition({
    ...state,
    currentUri: event.currentUri,
    dirty: event.dirty,
    cursor: event.cursor,
    staleSourceVersion
  })
}

export function workflowIdeMappingStatus(
  state: WorkflowIdeSyncState
): WorkflowIdeMappingStatus {
  if (state.dirty && state.currentUri === state.resolvedSourceUri) {
    return 'paused: unsaved file'
  }
  if (state.staleSourceVersion !== null) {
    return 'paused: waiting for OS source map'
  }
  if (state.sourceProjection?.mappingAvailable === false) {
    return 'paused: waiting for OS source map'
  }
  return 'active'
}

/** 只解释身份与相对路径；文件系统解析由 VS Code/Theia adapter 各自完成。 */
export function parseWorkflowPackageSource(
  sourceUri: string
): WorkflowPackageSource | null {
  const match = /^package:\/\/([^/]+)\/(.+)$/.exec(sourceUri)
  if (!match) return null
  const packageId = match[1] ?? ''
  const segments = (match[2] ?? '').split('/')
  if (
    !packageId ||
    segments.some((segment) => !segment || segment === '.' || segment === '..')
  ) return null
  return { packageId, relativePath: segments.join('/') }
}

/** 同时兼容“工作区根包含包目录”和“工作区根就是包目录”两种 IDE 布局。 */
export function workflowPackageCandidatePaths(sourceUri: string): string[] {
  const source = parseWorkflowPackageSource(sourceUri)
  if (!source) return [sourceUri.replace(/^\/+/, '')]
  return [
    `${source.packageId}/${source.relativePath}`,
    source.relativePath
  ]
}

/**
 * IDE 文件保存后，用 OS 刚观测到的哈希做一次同内容 CAS，以签发新候选和
 * source map。若保存后又有外部编辑发生，绝不覆盖更新内容。
 */
export async function synchronizeSavedWorkflowSource(
  runtime: WorkflowSavedSourceRuntime,
  workflowUuid: string,
  pythonSource: string
): Promise<WorkflowSavedSourceSyncResult> {
  const current = await runtime.getWorkflowAuthoring(workflowUuid)
  if (!current.draft) return 'source-unavailable'
  if (current.draft.python_source !== pythonSource) return 'source-changed'
  const compiled = await runtime.saveWorkflowAuthoringDraft(workflowUuid, {
    python_source: pythonSource,
    expected_draft_hash: current.draft.draft_hash,
    expected_workflow_revision: current.workflow_revision
  })
  const normalizedSource = compiled.candidate?.normalized_python_source
  if (
    !compiled.draft ||
    !compiled.candidate ||
    compiled.candidate.draft_hash !== compiled.draft.draft_hash ||
    !normalizedSource ||
    normalizedSource === pythonSource
  ) return 'compiled'
  await runtime.saveWorkflowAuthoringDraft(workflowUuid, {
    python_source: normalizedSource,
    expected_draft_hash: compiled.draft.draft_hash,
    expected_workflow_revision: compiled.workflow_revision
  })
  return 'normalized'
}

/** 把画布节点身份解析为 OS 签发的精确源码范围。 */
export function workflowSourceLocationForNode(
  projection: WorkflowSourceProjection,
  workflowNodeUuid: string
): WorkflowSourceLocation | null {
  const entry = projection.sourceMap.find(
    (candidate) => candidate.workflow_node_uuid === workflowNodeUuid
  )
  if (!entry) return null
  return {
    workflowUuid: projection.workflowUuid,
    workflowNodeUuid,
    sourceUri: projection.sourceUri,
    line: entry.start_line,
    column: entry.start_column,
    endLine: entry.end_line,
    endColumn: entry.end_column
  }
}

/** 把外部 IDE 光标反查为最内层工作流节点。 */
export function workflowNodeAtSourcePosition(
  sourceMap: readonly WorkflowSourceMapEntry[],
  position: WorkflowSourcePosition
): string | null {
  const matches = sourceMap.filter((entry) =>
    comparePosition(position.line, position.column, entry.start_line,
      entry.start_column) >= 0 &&
    comparePosition(position.line, position.column, entry.end_line,
      entry.end_column) <= 0
  )
  if (matches.length === 0) return null
  matches.sort((left, right) => sourceSpan(left) - sourceSpan(right))
  return matches[0]?.workflow_node_uuid ?? null
}

function deriveSourcePosition(
  state: WorkflowIdeSyncState
): WorkflowIdeSyncState {
  const mapped = Boolean(
    state.currentUri && state.currentUri === state.resolvedSourceUri &&
    !state.dirty && state.staleSourceVersion === null &&
    state.sourceProjection?.mappingAvailable !== false
  )
  return {
    ...state,
    sourcePosition: mapped ? state.cursor : null
  }
}

function comparePosition(
  leftLine: number,
  leftColumn: number,
  rightLine: number,
  rightColumn: number
): number {
  return leftLine === rightLine
    ? leftColumn - rightColumn
    : leftLine - rightLine
}

function sourceSpan(entry: WorkflowSourceMapEntry): number {
  return (entry.end_line - entry.start_line) * 1_000_000 +
    entry.end_column - entry.start_column
}
