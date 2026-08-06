import type {
  WorkflowPage,
  WorkflowRuntimePort,
  WorkflowSummary
} from '@unilab/services'
import { ServiceError } from '@unilab/services'
import { describe, expect, it, vi } from 'vitest'

import {
  findWorkflowSummaries,
  importedWorkflowUuid,
  isWorkflowImportMismatch
} from './workflowImportMismatch'

const CURRENT_UUID = '10000000-0000-4000-8000-000000000001'
const IMPORTED_UUID = '20000000-0000-4000-8000-000000000002'

describe('workflow import mismatch presentation', () => {
  it('recognizes the stable OS refusal code without treating 3003 as UI state', () => {
    expect(isWorkflowImportMismatch(new ServiceError({
      code: 'workflow_identity_mismatch',
      message: '拒绝保存'
    }))).toBe(true)
    expect(isWorkflowImportMismatch(new ServiceError({
      code: 'conflict',
      message: '3003'
    }))).toBe(false)
  })

  it('reads the related workflow UUID from imported Python first', () => {
    const error = new ServiceError({
      code: 'workflow_identity_mismatch',
      message: `当前 ${CURRENT_UUID}，导入 ${IMPORTED_UUID}`
    })
    const source = `@workflow_definition(workflow_uuid="${IMPORTED_UUID}")`

    expect(importedWorkflowUuid(error, CURRENT_UUID, source))
      .toBe(IMPORTED_UUID)
  })

  it('falls back to the OS message when Python formatting is unfamiliar', () => {
    const error = new ServiceError({
      code: 'workflow_identity_mismatch',
      message: `导入的 Python 声明工作流 ${IMPORTED_UUID}，当前编辑的是 ${CURRENT_UUID}`
    })

    expect(importedWorkflowUuid(error, CURRENT_UUID, '# generated source'))
      .toBe(IMPORTED_UUID)
  })

  it('paginates the workflow catalog until both readable names are found', async () => {
    const listWorkflows = vi.fn(async ({ page = 1 } = {}) => page === 1
      ? workflowPage(1, [workflowSummary(CURRENT_UUID, '当前配液流程')], 2)
      : workflowPage(2, [workflowSummary(IMPORTED_UUID, '历史加液流程')], 2))
    const runtime = { listWorkflows } as unknown as WorkflowRuntimePort

    const summaries = await findWorkflowSummaries(
      runtime,
      [CURRENT_UUID, IMPORTED_UUID]
    )

    expect(listWorkflows).toHaveBeenCalledTimes(2)
    expect(summaries.get(CURRENT_UUID)?.name).toBe('当前配液流程')
    expect(summaries.get(IMPORTED_UUID)?.name).toBe('历史加液流程')
  })
})

/** 构造工作流（Workflow）目录分页测试数据。 */
function workflowPage(
  page: number,
  items: WorkflowSummary[],
  total: number
): WorkflowPage {
  return { page, page_size: 1, items, total }
}

/** 构造工作流（Workflow）目录摘要测试数据。 */
function workflowSummary(uuid: string, name: string): WorkflowSummary {
  return {
    uuid,
    name,
    revision: 1,
    tags: [],
    meta_data: {},
    create_time: '2026-08-06T00:00:00Z',
    update_time: '2026-08-06T00:00:00Z'
  }
}
