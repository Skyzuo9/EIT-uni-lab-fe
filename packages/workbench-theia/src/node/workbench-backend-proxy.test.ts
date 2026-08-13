import { describe, expect, it } from 'vitest'
import type { ServerResponse } from 'node:http'

import {
  WORKBENCH_BACKEND_PROXY_PREFIX,
  resolveWorkbenchBackendProxyTarget,
  serializeWorkbenchBackendRequestBody,
  writeWorkbenchBackendResponse,
  workbenchBackendUpstreamUrl
} from './workbench-backend-proxy'

describe('Workbench Backend same-origin proxy', () => {
  /** 证明代理只移除 Workbench 私有前缀，并完整保留公开 API 路径和查询串。 */
  it('rewrites a public Backend request without changing its contract', () => {
    expect(workbenchBackendUpstreamUrl(
      `${WORKBENCH_BACKEND_PROXY_PREFIX}/api/v1/workflows?page=2`,
      'http://127.0.0.1:8080'
    )).toBe('http://127.0.0.1:8080/api/v1/workflows?page=2')
  })

  /** 证明缺省目标是本地 Backend，且环境变量可以在启动时显式覆盖。 */
  it('resolves a configured Backend target at process startup', () => {
    expect(resolveWorkbenchBackendProxyTarget(undefined))
      .toBe('http://127.0.0.1:8080')
    expect(resolveWorkbenchBackendProxyTarget('http://localhost:9000/'))
      .toBe('http://localhost:9000')
  })

  /** 证明危险或含凭证的代理目标会在启动时失败关闭。 */
  it.each([
    'file:///tmp/backend.sock',
    'http://user:secret@127.0.0.1:8080',
    'not-a-url'
  ])('rejects an invalid proxy target %s', (target) => {
    expect(() => resolveWorkbenchBackendProxyTarget(target)).toThrow(
      'UNILAB_BACKEND_PROXY_TARGET'
    )
  })

  /** 证明代理写回响应时不会把 Backend 的 201 Created 降为 200 OK。 */
  it('preserves the upstream status, headers and body', async () => {
    const headers = new Map<string, string>()
    let body = ''
    let statusCode = 200
    const response = {
      setHeader(name: string, value: string | number | readonly string[]) {
        headers.set(name, String(value))
        return this
      },
      writeHead(value: number) {
        statusCode = value
        return this
      },
      end(value?: string | Buffer) {
        body = Buffer.isBuffer(value) ? value.toString() : String(value ?? '')
        return this
      }
    } as unknown as Pick<ServerResponse, 'setHeader' | 'writeHead' | 'end'>

    await writeWorkbenchBackendResponse(
      response,
      new Response('{"code":0}', {
        status: 201,
        headers: { 'content-type': 'application/json' }
      })
    )

    expect(statusCode).toBe(201)
    expect(headers.get('content-type')).toBe('application/json')
    expect(body).toBe('{"code":0}')
  })

  /** 证明 Theia 已解析的 JSON 会被重新编码，而不是作为空请求转发。 */
  it('serializes an Express-parsed JSON request body', () => {
    const body = serializeWorkbenchBackendRequestBody({
      workflow_uuid: 'workflow-1',
      inventory_bindings: []
    })

    expect(Buffer.from(body!).toString()).toBe(
      '{"workflow_uuid":"workflow-1","inventory_bindings":[]}'
    )
    expect(serializeWorkbenchBackendRequestBody(undefined)).toBeUndefined()
  })
})
