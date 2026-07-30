import { describe, expect, it, vi } from 'vitest'

import type { HttpClient } from './http'
import { createLaboratoryService } from './laboratory'

describe('laboratory service', () => {
  it('maps the unified Edge device and action catalog', async () => {
    const request = vi.fn().mockResolvedValue({
      schemaVersion: 'device-catalog/v1',
      source: 'edge',
      items: [
        {
          id: 'robot',
          deviceKey: '/cell/robot',
          namespace: '/cell',
          name: '六轴机械臂',
          online: true,
          actions: [
            {
              id: 'move',
              actionRef: 'robot.move',
              name: '移动',
              typeName: 'UniLabJsonCommand',
              inputSchema: {
                speed: {
                  type: 'integer',
                  default: 20,
                  minimum: 1
                }
              },
              outputSchema: {},
              busy: false
            }
          ]
        }
      ]
    })
    const service = createLaboratoryService(mockHttp(request))

    await expect(service.getOnlineDevices()).resolves.toEqual([
      {
        id: 'robot',
        deviceKey: '/cell/robot',
        namespace: '/cell',
        machineName: '六轴机械臂',
        online: true,
        actions: [
          {
            actionName: 'move',
            actionRef: 'robot.move',
            displayName: '移动',
            typeName: 'UniLabJsonCommand',
            isBusy: false,
            inputSchema: {
              speed: {
                type: 'integer',
                default: 20,
                minimum: 1
              }
            },
            outputSchema: {}
          }
        ]
      }
    ])
    expect(request).toHaveBeenCalledWith('/api/v1/devices', undefined)
  })

  it('also accepts an enveloped catalog response', async () => {
    const request = vi.fn().mockResolvedValue({
      code: 0,
      data: { items: [] }
    })
    const service = createLaboratoryService(mockHttp(request))

    await expect(service.getOnlineDevices()).resolves.toEqual([])
  })
})

function mockHttp(request: ReturnType<typeof vi.fn>): HttpClient {
  return {
    request: async <ResponseValue>(
      path: string,
      init?: RequestInit
    ): Promise<ResponseValue> =>
      request(path, init) as Promise<ResponseValue>
  }
}
