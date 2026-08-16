import { afterEach, describe, expect, it, vi } from 'vitest'

import type { HttpRequestTraceEvent } from './http'
import { connectDeviceTelemetry } from './realtime'
import { createWorkflowSseTransport } from './workflowSse'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Edge streaming transport tracing', () => {
  it('injects traceparent into the workflow SSE request', async () => {
    const events: HttpRequestTraceEvent[] = []
    let transport: ReturnType<typeof createWorkflowSseTransport>
    const opened = new Promise<void>((resolve) => {
      vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
        expect(new Headers(init?.headers).get('traceparent')).toMatch(
          /^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/
        )
        return new Response(new ReadableStream({ start: (controller) => controller.close() }))
      }))
      transport = createWorkflowSseTransport(
        'http://127.0.0.1:18003/api/v1/events',
        (event) => { events.push(event) }
      )
      transport.subscribe({
        onOpen: () => {
          transport.dispose()
          resolve()
        },
        onFrame: () => undefined
      })
    })

    await opened

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      transport: 'sse',
      path: '/api/v1/events',
      outcome: 'open',
      statusCode: 200
    })
  })

  it('passes SSE trace context in the device telemetry query', async () => {
    const events: HttpRequestTraceEvent[] = []
    const urls: string[] = []

    class FakeEventSource extends EventTarget {
      static readonly CLOSED = 2
      readonly readyState = 1

      constructor(url: string | URL) {
        super()
        urls.push(String(url))
        queueMicrotask(() => this.dispatchEvent(new Event('open')))
      }

      close(): void {}
    }

    vi.stubGlobal('EventSource', FakeEventSource)
    const opened = new Promise<void>((resolve) => {
      const close = connectDeviceTelemetry(
        'http://127.0.0.1:18003',
        {
          onSnapshot: () => undefined,
          onChanged: () => undefined,
          onOpen: resolve
        },
        (event: HttpRequestTraceEvent) => { events.push(event) }
      )
      void close
    })

    await opened

    const traceparent = new URL(urls[0] ?? '').searchParams.get('traceparent')
    expect(traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/)
    expect(events[0]).toMatchObject({
      transport: 'sse',
      path: '/api/v1/device-telemetry/events',
      outcome: 'open',
      statusCode: 200,
      traceparent
    })
  })
})
