import { describe, expect, it, vi } from 'vitest'

import type { HttpClient } from './http'
import {
  loadBackendMaterialTemplateCatalog,
  loadBackendMaterialTemplateDetail
} from './backendMaterialCatalog'

describe('Backend 资源模板目录 adapter', () => {
  it('沿 UUID 游标读取完整目录并保持物料创建关闭', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({
        code: 0,
        data: {
          items: [{
            uuid: 'template-device',
            name: 'community.devices.pump',
            display_name: 'Pump',
            resource_type: 'device',
            tags: ['liquid']
          }],
          has_more: true,
          next_cursor_uuid: 'template-device'
        }
      })
      .mockResolvedValueOnce({
        code: 0,
        data: {
          items: [{
            uuid: 'template-plate',
            name: 'community.resources.plate',
            display_name: '96 孔板',
            resource_type: 'resource',
            tags: ['plate']
          }],
          has_more: false,
          next_cursor_uuid: null
        }
      })

    await expect(
      loadBackendMaterialTemplateCatalog(mockHttp(request))
    ).resolves.toMatchObject({
      revision: expect.stringMatching(/^backend:/),
      stale: false,
      items: [
        {
          uuid: 'template-device',
          kind: 'device',
          sourceNamespace: 'backend',
          creation: { available: false }
        },
        {
          uuid: 'template-plate',
          kind: 'resource',
          creation: { available: false }
        }
      ]
    })
    expect(request).toHaveBeenNthCalledWith(
      2,
      '/api/v1/resource-templates?limit=100&cursor_uuid=template-device',
      undefined
    )
  })

  it('把 Backend config_schema 与 ui_overlay 映射为只读配置详情', async () => {
    const request = vi.fn().mockResolvedValue({
      code: 0,
      data: {
        uuid: 'template-device',
        name: 'community.devices.pump',
        display_name: 'Pump',
        resource_type: 'device',
        tags: [],
        description: '注射泵',
        config_schema: { type: 'object' },
        ui_overlay: { speed: { widget: 'number' } },
        handles: []
      }
    })

    await expect(
      loadBackendMaterialTemplateDetail(
        mockHttp(request),
        'template-device'
      )
    ).resolves.toMatchObject({
      uuid: 'template-device',
      description: '注射泵',
      configuration: {
        schema: { type: 'object' },
        uiSchema: { speed: { widget: 'number' } }
      },
      compatibility: {},
      assets: {}
    })
  })

  it('拒绝没有推进的 Backend 游标，避免无限分页', async () => {
    const request = vi.fn().mockResolvedValue({
      code: 0,
      data: {
        items: [],
        has_more: true,
        next_cursor_uuid: null
      }
    })

    await expect(
      loadBackendMaterialTemplateCatalog(mockHttp(request))
    ).rejects.toMatchObject({
      code: 'INVALID_BACKEND_RESOURCE_TEMPLATE'
    })
  })
})

/**
 * 创建只实现 request 的 HTTP 测试替身。
 *
 * @param request Vitest 请求桩。
 * @returns 满足 adapter 所需边界的 HttpClient。
 */
function mockHttp(request: ReturnType<typeof vi.fn>): HttpClient {
  return {
    request
  }
}
