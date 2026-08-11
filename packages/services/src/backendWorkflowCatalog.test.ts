import { describe, expect, it, vi } from 'vitest'

import type { HttpClient } from './http'
import { loadBackendWorkflowPage } from './backendWorkflowCatalog'
import { getDefaultBackend } from './backends'
import { createWorkflowRuntime } from './workflow'

describe('Backend 工作流目录 adapter', () => {
  it('遍历 UUID 游标后投影为前端编号分页', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({
        code: 0,
        data: {
          items: [rawWorkflow('workflow-1', '配液')],
          has_more: true,
          next_cursor_uuid: 'workflow-1'
        }
      })
      .mockResolvedValueOnce({
        code: 0,
        data: {
          items: [rawWorkflow('workflow-2', '清洗')],
          has_more: false,
          next_cursor_uuid: null
        }
      })

    await expect(loadBackendWorkflowPage(
      mockHttp(request),
      { page: 2, page_size: 1 }
    )).resolves.toEqual({
      items: [{
        uuid: 'workflow-2',
        create_time: '2026-08-01T00:00:00Z',
        update_time: '2026-08-02T00:00:00Z',
        meta_data: {},
        name: '清洗',
        tags: ['S02'],
        revision: 3
      }],
      total: 2,
      page: 2,
      page_size: 1
    })
    expect(request).toHaveBeenNthCalledWith(
      2,
      '/api/v1/workflows?limit=100&cursor_uuid=workflow-1',
      undefined
    )
  })

  it('拒绝未推进的 Backend 工作流游标', async () => {
    const request = vi.fn().mockResolvedValue({
      code: 0,
      data: {
        items: [],
        has_more: true,
        next_cursor_uuid: null
      }
    })

    await expect(
      loadBackendWorkflowPage(mockHttp(request))
    ).rejects.toMatchObject({
      code: 'INVALID_BACKEND_WORKFLOW_CATALOG'
    })
  })

  it('在 Backend 目录可读时仍阻止未对齐的创作与任务运行接口', async () => {
    const request = vi.fn()
    const runtime = createWorkflowRuntime(
      mockHttp(request),
      getDefaultBackend('local-go')
    )

    await expect(runtime.getWorkflowAuthoring(
      '10000000-0000-4000-8000-000000000001'
    )).rejects.toMatchObject({
      code: 'UNSUPPORTED_CAPABILITY',
      capability: 'workflow.authoring'
    })
    await expect(runtime.createWorkflowTask({
      workflow_uuid: '10000000-0000-4000-8000-000000000001'
    })).rejects.toMatchObject({
      code: 'UNSUPPORTED_CAPABILITY',
      capability: 'workflow.runTasks'
    })
    expect(request).not.toHaveBeenCalled()
    runtime.dispose()
  })
})

/** 返回一条 Backend Workflow 摘要测试记录。 */
function rawWorkflow(uuid: string, name: string): Record<string, unknown> {
  return {
    uuid,
    create_time: '2026-08-01T00:00:00Z',
    update_time: '2026-08-02T00:00:00Z',
    meta_data: {},
    name,
    tags: ['S02'],
    revision: 3
  }
}

/** 创建只实现 request 的 Backend 工作流 HTTP 测试替身。 */
function mockHttp(request: ReturnType<typeof vi.fn>): HttpClient {
  return { request }
}
