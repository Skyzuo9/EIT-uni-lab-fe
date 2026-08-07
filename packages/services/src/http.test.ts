import { describe, expect, it, vi } from 'vitest'

import { getDefaultBackend } from './backends'
import { createHttpClient, type HttpRequestTraceEvent } from './http'

describe('createHttpClient tracing', () => {
  it('injects W3C context into every Edge request and reports completion', async () => {
    const events: HttpRequestTraceEvent[] = []
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const traceparent = new Headers(init?.headers).get('traceparent')
      expect(traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/)
      return Response.json({ ok: true }, { status: 201 })
    }) as typeof fetch
    const client = createHttpClient({
      backend: getDefaultBackend('local-python'),
      fetcher,
      traceRequest: (event) => { events.push(event) }
    })

    await expect(client.request('/api/v1/workflows?limit=20', {
      method: 'POST'
    })).resolves.toEqual({ ok: true })

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      transport: 'http',
      method: 'POST',
      path: '/api/v1/workflows',
      statusCode: 201,
      outcome: 'ok'
    })
    expect(events[0]?.traceparent).toBe(
      `00-${events[0]?.traceId}-${events[0]?.spanId}-01`
    )
  })

  it('reports failed Edge requests without allowing the reporter to break requests', async () => {
    const traceRequest = vi.fn(() => { throw new Error('ipc unavailable') })
    const client = createHttpClient({
      backend: getDefaultBackend('local-python'),
      fetcher: vi.fn(async () => new Response('bad gateway', { status: 502 })),
      traceRequest
    })

    await expect(client.request('/api/v1/materials')).rejects.toMatchObject({
      code: 'HTTP_REQUEST_FAILED',
      status: 502
    })
    expect(traceRequest).toHaveBeenCalledWith(expect.objectContaining({
      outcome: 'error',
      statusCode: 502
    }))
  })

  it('does not add Edge trace headers to non-OS backends', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).has('traceparent')).toBe(false)
      return Response.json({ ok: true })
    }) as typeof fetch
    const traceRequest = vi.fn()
    const client = createHttpClient({
      backend: getDefaultBackend('local-go'),
      fetcher,
      traceRequest
    })

    await client.request('/api/v1/health')

    expect(traceRequest).not.toHaveBeenCalled()
  })
})
