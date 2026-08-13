import { describe, expect, it, vi } from 'vitest'

import { getDefaultBackend } from './backends'
import type { HttpClient } from './http'
import { createWorkflowRuntime } from './workflow'

const WORKFLOW_UUID = '11111111-1111-4111-8111-111111111111'

/**
 * 证明产品 Edge 的工作流身份拒绝会保留稳定错误码和可行动消息。
 *
 * @returns 无返回值；断言工作流源码（Workflow Source）保存只发送一次，且错误
 * 不会退化为无效响应。
 */
async function preservesProductWorkflowIdentityMismatch(): Promise<void> {
  // request 模拟产品 Edge 以 HTTP 200 返回的后端形态错误封装。
  const request = vi.fn().mockResolvedValue({
    code: 3003,
    error: {
      code: 'workflow_identity_mismatch',
      msg: '导入源码属于另一个工作流，请选择匹配的工作流'
    }
  })
  const runtime = createWorkflowRuntime(
    { request } as unknown as HttpClient,
    getDefaultBackend()
  )

  await expect(runtime.saveWorkflowAuthoringDraft(WORKFLOW_UUID, {
    python_source: '@workflow_definition(workflow_uuid="other")\ndef run(): pass\n',
    expected_draft_hash: null,
    expected_workflow_revision: 1
  })).rejects.toMatchObject({
    code: 'workflow_identity_mismatch',
    message: '导入源码属于另一个工作流，请选择匹配的工作流',
    status: 409,
    retryable: false
  })
  expect(request).toHaveBeenCalledTimes(1)
}

/**
 * 证明未携带窄错误码的产品 Edge 3003 仍按普通创作冲突处理。
 *
 * @returns 无返回值；断言兼容错误获得稳定通用冲突码，而不是伪造具体冲突类型。
 */
async function preservesGenericProductAuthoringConflict(): Promise<void> {
  const request = vi.fn().mockResolvedValue({
    code: 3003,
    error: { msg: '工作流已发生变化，请刷新后重试' }
  })
  const runtime = createWorkflowRuntime(
    { request } as unknown as HttpClient,
    getDefaultBackend()
  )

  await expect(runtime.saveWorkflowAuthoringDraft(WORKFLOW_UUID, {
    python_source: 'def run(): pass\n',
    expected_draft_hash: null,
    expected_workflow_revision: 1
  })).rejects.toMatchObject({
    code: 'conflict',
    message: '工作流已发生变化，请刷新后重试',
    status: 409
  })
}

describe('工作流创作错误封装', () => {
  it('保留产品 Edge 的工作流身份拒绝', preservesProductWorkflowIdentityMismatch)
  it('保留产品 Edge 的普通创作冲突', preservesGenericProductAuthoringConflict)
})
