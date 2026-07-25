import { describe, expect, it, vi } from 'vitest'

import { getDefaultBackend } from './backends'
import { resolveServerCapabilities } from './capabilities'
import { UnsupportedCapabilityError } from './errors'
import type { HttpClient } from './http'
import { createMaterialService } from './materials'

describe('material template adapter', () => {
  it('reads the Local Go template page without a fake laboratory ID', async () => {
    const { http, request } = mockHttp({
      data: {
        items: [
          {
            uuid: 'template-1',
            name: 'Bottle',
            resource_type: 'resource',
            tags: ['container']
          }
        ],
        total: 1,
        page: 2,
        page_size: 10
      }
    })
    const backend = getDefaultBackend('local-go')
    const service = createMaterialService(
      http,
      backend,
      resolveServerCapabilities(backend)
    )

    const result = await service.listTemplates(
      { kind: 'singleton' },
      {
        page: 2,
        pageSize: 10,
        name: 'Bottle',
        resourceType: 'resource'
      }
    )

    expect(request).toHaveBeenCalledWith(
      '/api/v1/resource-templates?page=2&page_size=10&name=Bottle&resource_type=resource',
      undefined
    )
    expect(result).toEqual({
      items: [
        {
          uuid: 'template-1',
          name: 'Bottle',
          resourceType: 'resource',
          tags: ['container'],
          icon: undefined,
          description: undefined
        }
      ],
      total: 1,
      page: 2,
      pageSize: 10
    })
  })

  it('maps the new Backend config_info field', async () => {
    const { http, request } = mockHttp({
      data: {
        uuid: 'template-1',
        name: 'Plate',
        resource_type: 'device',
        config_info: [{ type: 'well' }],
        model: { type: 'urdf' }
      }
    })
    const backend = getDefaultBackend('local-go')
    const service = createMaterialService(
      http,
      backend,
      resolveServerCapabilities(backend)
    )

    await expect(
      service.getTemplate({ kind: 'singleton' }, 'template-1')
    ).resolves.toMatchObject({
      uuid: 'template-1',
      configInfos: [{ type: 'well' }],
      model: { type: 'urdf' }
    })
    expect(request).toHaveBeenCalledWith(
      '/api/v1/resource-templates/template-1',
      undefined
    )
  })

  it('rejects unavailable profiles before making a request', async () => {
    const { http, request } = mockHttp(undefined)
    const backend = getDefaultBackend('local-python')
    const service = createMaterialService(
      http,
      backend,
      resolveServerCapabilities(backend)
    )

    await expect(
      service.listTemplates({ kind: 'singleton' })
    ).rejects.toBeInstanceOf(UnsupportedCapabilityError)
    expect(request).not.toHaveBeenCalled()
  })

  it('does not manufacture laboratory scope for the singleton adapter', async () => {
    const { http, request } = mockHttp(undefined)
    const backend = getDefaultBackend('local-go')
    const service = createMaterialService(
      http,
      backend,
      resolveServerCapabilities(backend)
    )

    await expect(
      service.listTemplates({
        kind: 'laboratory',
        laboratoryId: 'lab-1'
      })
    ).rejects.toMatchObject({
      code: 'UNSUPPORTED_MATERIAL_SCOPE'
    })
    expect(request).not.toHaveBeenCalled()
  })

  it('gates every target Material Graph operation before transport', async () => {
    const { http, request } = mockHttp(undefined)
    const backend = getDefaultBackend('local-go')
    const service = createMaterialService(
      http,
      backend,
      resolveServerCapabilities(backend)
    )

    await expect(
      service.getGraph({ kind: 'singleton' })
    ).rejects.toBeInstanceOf(UnsupportedCapabilityError)
    await expect(
      service.move({
        materialId: 'material-1',
        expectedRevision: 1,
        placement: { kind: 'unplaced' }
      })
    ).rejects.toBeInstanceOf(UnsupportedCapabilityError)
    await expect(
      service.updateSite({
        materialId: 'material-1',
        siteId: 'site-1',
        expectedRevision: 1,
        patch: { name: 'Deck' }
      })
    ).rejects.toBeInstanceOf(UnsupportedCapabilityError)
    await expect(
      service.getEdgeOperations({ kind: 'singleton' })
    ).rejects.toBeInstanceOf(UnsupportedCapabilityError)

    expect(request).not.toHaveBeenCalled()
  })

  it('maps the OS Material list into shared aggregates', async () => {
    const { http, request } = mockHttp({
      data: {
        items: [
          {
            uuid: 'material-root',
            resource_template_uuid: 'template-device',
            code: 'liquid_handler',
            name: 'Liquid Handler',
            create_time: '2026-07-26T00:00:00Z',
            update_time: '2026-07-26T00:00:00Z',
            config: {
              placement: {
                kind: 'world',
                pose: {
                  positionMm: [100, 200, 0],
                  rotationDegXYZ: [0, 0, 0]
                }
              },
              rendering: {
                kind: 'table',
                dimensionsMm: [1400, 180, 720]
              },
              sites: [
                {
                  id: 'site-a1',
                  ownerMaterialId: 'material-root',
                  key: 'A1',
                  name: 'A1',
                  anchor: { kind: 'root' },
                  poseInAnchor: {
                    positionMm: [10, 20, 30],
                    rotationDegXYZ: [0, 0, 0]
                  },
                  sizeMm: [9, 9, 1],
                  capacity: 1,
                  allowedTemplateIds: [],
                  occupiedMaterialIds: []
                }
              ]
            }
          }
        ],
        total: 1,
        page: 1,
        page_size: 100
      }
    })
    const backend = getDefaultBackend('local-python')
    const service = createMaterialService(
      http,
      backend,
      resolveServerCapabilities(backend)
    )

    await expect(
      service.getGraph({ kind: 'singleton' })
    ).resolves.toEqual([
      {
        material: {
          id: 'material-root',
          sourceTemplateId: 'template-device',
          code: 'liquid_handler',
          name: 'Liquid Handler',
          description: undefined,
          config: expect.objectContaining({
            rendering: expect.objectContaining({ kind: 'table' })
          }),
          createdAt: '2026-07-26T00:00:00Z',
          updatedAt: '2026-07-26T00:00:00Z'
        },
        placement: {
          kind: 'world',
          pose: {
            positionMm: [100, 200, 0],
            rotationDegXYZ: [0, 0, 0]
          }
        },
        sites: [
          expect.objectContaining({
            id: 'site-a1',
            ownerMaterialId: 'material-root',
            poseInAnchor: {
              positionMm: [10, 20, 30],
              rotationDegXYZ: [0, 0, 0]
            }
          })
        ],
        revision: 1
      }
    ])
    expect(request).toHaveBeenCalledWith(
      '/api/v1/materials?page=1&page_size=100',
      undefined
    )
  })

  it('rejects malformed OS Material placement data', async () => {
    const { http } = mockHttp({
      data: {
        items: [
          {
            uuid: 'material-bad',
            resource_template_uuid: 'template-device',
            code: 'bad',
            name: 'Bad material',
            create_time: '2026-07-26T00:00:00Z',
            update_time: '2026-07-26T00:00:00Z',
            config: {
              placement: {
                kind: 'world',
                pose: {
                  positionMm: [0, 0],
                  rotationDegXYZ: [0, 0, 0]
                }
              }
            }
          }
        ],
        total: 1
      }
    })
    const backend = getDefaultBackend('local-python')
    const service = createMaterialService(
      http,
      backend,
      resolveServerCapabilities(backend)
    )

    await expect(
      service.getGraph({ kind: 'singleton' })
    ).rejects.toMatchObject({
      code: 'INVALID_MATERIAL_GRAPH_RESPONSE'
    })
  })
})

function mockHttp(response: unknown): {
  http: HttpClient
  request: ReturnType<typeof vi.fn>
} {
  const request = vi.fn().mockResolvedValue(response)
  return {
    http: {
      request: async <ResponseValue>(
        path: string,
        init?: RequestInit
      ): Promise<ResponseValue> =>
        request(path, init) as Promise<ResponseValue>
    },
    request
  }
}
