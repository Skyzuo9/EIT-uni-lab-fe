import type {
  WorkflowAuthoringCandidate,
  WorkflowAuthoringDiagnostic,
  WorkflowAuthoringResult,
  WorkflowRevision,
  WorkflowRuntimePort
} from '@unilab/services'

import { parseCanonicalWorkflow } from './canonicalWorkflow'
import { migrateCloudWorkflowJson } from './parseWorkflowJson'

export async function projectWorkflowToPython(
  runtime: WorkflowRuntimePort,
  revision: WorkflowRevision
): Promise<{
  candidate: WorkflowAuthoringCandidate
  diagnostics: WorkflowAuthoringDiagnostic[]
}> {
  const baseRevisionId = revision.revision_id
  const generated = requireAuthoringCandidate(
    await runtime.generatePythonWorkflow(
      baseRevisionId,
      revision,
      workflowSourceUri(revision.workflow_id)
    ),
    '标准工作流转换为 Python 失败'
  )
  const validation = await runtime.validateAuthoringCandidate(
    baseRevisionId,
    generated
  )
  return {
    candidate: validation.candidate ?? generated,
    diagnostics: collectAuthoringDiagnostics(validation)
  }
}

export async function compilePythonRevision(
  runtime: WorkflowRuntimePort,
  revision: WorkflowRevision,
  source: string,
  sourceUri: string
): Promise<WorkflowAuthoringCandidate> {
  const compiled = requireAuthoringCandidate(
    await runtime.compilePythonWorkflow(
      revision.revision_id,
      source,
      sourceUri
    ),
    'Python 编译为标准工作流失败'
  )
  return requireAuthoringCandidate(
    await runtime.validateAuthoringCandidate(
      revision.revision_id,
      compiled
    ),
    'Python 工作流未通过编写校验'
  )
}

export function parseImportedWorkflow(
  content: string,
  fileName: string
): {
  revision: WorkflowRevision
  migrated: boolean
  warnings: string[]
  nodeCount: number
  edgeCount: number
} {
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
  const structure = parseCanonicalWorkflow(
    JSON.stringify(revision, null, 2)
  )
  if (!structure.revision) {
    throw new Error(
      `无法导入 ${fileName}：${
        structure.error || '转换后的 Canonical v2 无法解析'
      }`
    )
  }
  return {
    revision,
    migrated: Boolean(migrated),
    warnings: migrated?.warnings || [],
    nodeCount: structure.nodes.length,
    edgeCount: structure.links.length
  }
}

interface SaveWorkflowRevisionOptions {
  runtime: WorkflowRuntimePort
  revision: WorkflowRevision
  activeWorkflowStorageKey?: string
  saveFile: boolean
  sourceFileName: string | null
  sourceFileWriter: ((content: string) => Promise<void>) | null
  authoringMode: 'json' | 'python'
  editorValue: string
  pythonBaseline: string | null
  download: (content: string, fileName: string) => void
}

export async function saveWorkflowRevision({
  runtime,
  revision,
  activeWorkflowStorageKey,
  saveFile,
  sourceFileName,
  sourceFileWriter,
  authoringMode,
  editorValue,
  pythonBaseline,
  download
}: SaveWorkflowRevisionOptions): Promise<{
  canonical: string
  message: string
}> {
  const document = await runtime.saveWorkflow(
    revision.workflow_id,
    revision
  )
  const canonical = JSON.stringify(
    document.revision.canonical,
    null,
    2
  )
  persistActiveWorkflowId(
    activeWorkflowStorageKey,
    document.revision.canonical.workflow_id
  )
  let fileSaveMessage = ''
  if (saveFile && sourceFileName) {
    const sourceFileContent = isPythonWorkflowFile(sourceFileName)
      ? authoringMode === 'python'
        ? editorValue
        : pythonBaseline
      : canonical
    if (sourceFileContent === null) {
      throw new Error(
        `无法写回 ${sourceFileName}：缺少最近一次有效的 Python 源码`
      )
    }
    if (sourceFileWriter) {
      try {
        await sourceFileWriter(sourceFileContent)
      } catch (writeError) {
        throw new Error(
          `修订版本 ${document.revision.id} 已保存，但写回 ${
            sourceFileName
          } 失败：${
            writeError instanceof Error
              ? writeError.message
              : String(writeError)
          }`
        )
      }
      fileSaveMessage = ` · 已更新 ${sourceFileName}`
    } else {
      download(sourceFileContent, sourceFileName)
      fileSaveMessage = ` · 已下载 ${sourceFileName}`
    }
  }
  return {
    canonical,
    message:
      `已保存修订版本 ${document.revision.id}${fileSaveMessage}`
  }
}

export function readActiveWorkflowId(
  storageKey?: string
): string | null {
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

export function persistActiveWorkflowId(
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

export function formatAuthoringDiagnostics(
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

export function workflowSourceUri(workflowId: string): string {
  const safeName = workflowId
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'workflow'
  return `workflows/${safeName}.py`
}

export function isPythonWorkflowFile(fileName: string): boolean {
  return fileName.toLowerCase().endsWith('.py')
}

export function workflowFileSourceUri(fileName: string): string {
  return workflowSourceUri(fileName.replace(/\.py$/i, ''))
}

function collectAuthoringDiagnostics(
  result: WorkflowAuthoringResult
): WorkflowAuthoringDiagnostic[] {
  return [
    ...result.diagnostics,
    ...(result.candidate?.diagnostics || [])
  ]
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
