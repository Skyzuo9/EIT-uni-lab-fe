import { describe, expect, it, vi } from 'vitest'

import { createManualExclusiveService } from './manualExclusive'
import type { HttpClient } from './http'

describe('手动独占（Exclusive）HTTP 适配器', () => {
  it('使用 exact GET/PUT/DELETE 路由', async () => {
    const calls: Array<[string, RequestInit | undefined]> = []
    const http: HttpClient = { request: async <ResponseValue>(
      _path: string,
      _init?: RequestInit
    ) => ({
      code: 0,
      data: {
        local_device_id: 'robot-01',
        state: 'exclusive',
        exclusive: true
      }
    }) as ResponseValue }
    const originalRequest = http.request
    http.request = async <ResponseValue>(path: string, init?: RequestInit) => {
      calls.push([path, init])
      return originalRequest<ResponseValue>(path, init)
    }
    const service = createManualExclusiveService(
      http,
      { available: true }
    )
    await service.read('robot-01')
    await service.acquire('robot-01')
    await service.release('robot-01')
    expect(calls.map(call => call[1]?.method))
      .toEqual(['GET', 'PUT', 'DELETE'])
    expect(calls[0]?.[0])
      .toBe('/api/v1/devices/robot-01/exclusive')
  })

  it('能力关闭时不发出 HTTP 请求', async () => {
    const request = vi.fn()
    const service = createManualExclusiveService(
      { request } as HttpClient,
      { available: false, reason: 'formal backend deferred' }
    )
    await expect(service.acquire('robot-01')).rejects.toMatchObject({
      code: 'UNSUPPORTED_CAPABILITY'
    })
    expect(request).not.toHaveBeenCalled()
  })

  it('拒绝字段漂移或互相矛盾的响应', async () => {
    const service = createManualExclusiveService({
      request: async <ResponseValue>() => ({
        code: 0,
        data: {
          local_device_id: 'robot-01',
          state: 'idle',
          exclusive: true
        }
      }) as ResponseValue
    }, { available: true })
    await expect(service.read('robot-01')).rejects.toMatchObject({
      code: 'INVALID_API_RESPONSE'
    })
  })
})
