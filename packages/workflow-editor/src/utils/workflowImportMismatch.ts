import type {
  WorkflowRuntimePort,
  WorkflowSummary
} from '@unilab/services'

const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi
const PYTHON_WORKFLOW_UUID_PATTERN = /\bworkflow_uuid\s*=\s*(["'])([^"']+)\1/i

/** 判断服务错误是否表示导入源码关联了另一个工作流（Workflow）。 */
export function isWorkflowImportMismatch(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  return String((error as { code?: unknown }).code || '') ===
    'workflow_identity_mismatch'
}

/**
 * 从操作系统（OS）拒绝结果中提取导入源码关联的工作流编号。
 * Python 装饰器只作为展示回退，真正的写入判断仍以 OS 为准。
 */
export function importedWorkflowUuid(
  error: unknown,
  currentWorkflowUuid: string,
  pythonSource: string
): string | null {
  if (!isWorkflowImportMismatch(error)) return null
  const sourceMatch = PYTHON_WORKFLOW_UUID_PATTERN.exec(pythonSource)?.[2]
  if (sourceMatch && isUuid(sourceMatch)) return sourceMatch

  const message = error instanceof Error
    ? error.message
    : String((error as { message?: unknown }).message || '')
  return message.match(UUID_PATTERN)?.find(
    (uuid) => uuid.toLowerCase() !== currentWorkflowUuid.toLowerCase()
  ) ?? null
}

/**
 * 分页读取工作流（Workflow）目录，为归属提示补充易读名称与可跳转状态。
 */
export async function findWorkflowSummaries(
  runtime: WorkflowRuntimePort,
  workflowUuids: readonly string[]
): Promise<Map<string, WorkflowSummary>> {
  const pending = new Set(workflowUuids.map((uuid) => uuid.toLowerCase()))
  const matches = new Map<string, WorkflowSummary>()
  let pageNumber = 1

  while (pending.size > 0 && pageNumber <= 100) {
    const page = await runtime.listWorkflows({
      page: pageNumber,
      page_size: 100
    })
    for (const workflow of page.items) {
      const normalizedUuid = workflow.uuid.toLowerCase()
      if (!pending.has(normalizedUuid)) continue
      matches.set(normalizedUuid, workflow)
      pending.delete(normalizedUuid)
    }
    const pageSize = Math.max(1, page.page_size)
    if (
      page.items.length === 0 ||
      page.page * pageSize >= page.total
    ) break
    pageNumber = page.page + 1
  }

  return matches
}

/** 校验文本是否为标准工作流 UUID。 */
function isUuid(value: string): boolean {
  UUID_PATTERN.lastIndex = 0
  return UUID_PATTERN.test(value)
}
