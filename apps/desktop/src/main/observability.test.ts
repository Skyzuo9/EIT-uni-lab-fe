import { describe, expect, it, vi } from 'vitest'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

import {
  createElectronObservability,
  resolveElectronObservabilityOptions,
  type ElectronObservabilityOptions,
  type ElectronTraceAdapter
} from './observability'
import { DEFAULT_OBSERVABILITY_BASE_URL } from '../shared/observability'

interface RecordedSpan {
  name: string
  attributes: Record<string, string | number | boolean>
  error?: Error
}

class RecordingTraceAdapter implements ElectronTraceAdapter {
  readonly spans: RecordedSpan[] = []
  flushCount = 0
  shutdownCount = 0

  async run<T>(
    name: string,
    attributes: Record<string, string | number | boolean>,
    operation: (span: { markError(error: Error): void }) => Promise<T>
  ): Promise<T> {
    const recorded: RecordedSpan = { name, attributes }
    this.spans.push(recorded)
    return operation({
      markError: (error) => {
        recorded.error = error
      }
    })
  }

  record(
    name: string,
    attributes: Record<string, string | number | boolean>,
    error?: Error
  ): void {
    this.spans.push({ name, attributes, error })
  }

  async flush(): Promise<void> {
    this.flushCount += 1
  }

  async shutdown(): Promise<void> {
    this.shutdownCount += 1
  }
}

describe('ElectronObservability', () => {
  it('uses the loopback Uni-Lab-OS observability endpoint by default', () => {
    const options = resolveElectronObservabilityOptions({
      environment: {},
      appVersion: '1.2.3',
      isPackaged: true,
      platform: 'darwin',
      electronVersion: '33.4.11',
      nodeVersion: '20.18.3',
      homeDirectory: '/Users/lab',
      log: () => undefined
    })

    expect(options).toMatchObject({
      enabled: true,
      baseUrl: DEFAULT_OBSERVABILITY_BASE_URL,
      projectName: 'uni-lab-electron',
      environment: 'production',
      requestTimeoutMs: 5_000,
      shutdownTimeoutMs: 3_000
    })
  })

  it('rejects non-loopback endpoints before constructing the exporter', () => {
    expect(() => resolveElectronObservabilityOptions({
      environment: {
        UNILABOS_OBSERVABILITY_URL: 'https://trace.example.com/api'
      },
      appVersion: '1.2.3',
      isPackaged: false,
      homeDirectory: '/Users/lab',
      log: () => undefined
    })).toThrow('本机 HTTP 地址')

    expect(() => resolveElectronObservabilityOptions({
      environment: {
        UNILABOS_OBSERVABILITY_URL: 'http://192.168.1.10:18003/api'
      },
      appVersion: '1.2.3',
      isPackaged: false,
      homeDirectory: '/Users/lab',
      log: () => undefined
    })).toThrow('仅允许本机访问')
  })

  it('sanitizes sensitive values and records failures without changing behavior', async () => {
    const adapter = new RecordingTraceAdapter()
    const observability = createElectronObservability(baseOptions(), {
      traceAdapter: adapter,
      fetch: unexpectedFetch
    })

    await expect(observability.run(
      'electron.runtime.start',
      {
        'auth.token': 'secret-token',
        'renderer.url': 'http://user:password@127.0.0.1/path?token=secret',
        'runtime.path': '/Users/lab/projects/Uni-Lab-OS',
        'log.message': '连接失败 token=secret-value password: another-value'
      },
      async () => {
        throw new Error('无法读取 /Users/lab/projects/secret.json')
      }
    )).rejects.toThrow('无法读取')

    expect(adapter.spans).toHaveLength(1)
    expect(adapter.spans[0]?.attributes).toMatchObject({
      'auth.token': '[REDACTED]',
      'renderer.url': 'http://127.0.0.1/path',
      'runtime.path': '$HOME/projects/Uni-Lab-OS',
      'log.message': '连接失败 token=[REDACTED] password: [REDACTED]',
      'service.name': 'uni-lab-electron',
      'service.version': '1.2.3'
    })
    expect(adapter.spans[0]?.error?.message).toBe(
      '无法读取 $HOME/projects/secret.json'
    )
    expect(adapter.spans[0]?.error?.stack).toBeUndefined()
  })

  it('queries trace lists through the Uni-Lab-OS interface', async () => {
    const adapter = new RecordingTraceAdapter()
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input))
      expect(url.pathname).toBe('/api/v1/observability/traces')
      expect(url.searchParams.get('limit')).toBe('25')
      expect(url.searchParams.get('include_spans')).toBe('true')
      expect(url.searchParams.getAll('session_identifier')).toEqual([
        'session-a',
        'session-b'
      ])
      return Response.json({
        code: 0,
        data: {
          project_name: 'uni-lab-electron',
          traces: [{ trace_id: 'a'.repeat(32) }],
          next_cursor: 'next-page'
        }
      })
    }) as typeof fetch
    const observability = createElectronObservability(baseOptions(), {
      traceAdapter: adapter,
      fetch: fetchMock
    })

    await expect(observability.listTraces({
      limit: 25,
      includeSpans: true,
      sessionIdentifiers: ['session-a', 'session-b']
    })).resolves.toEqual({
      project_name: 'uni-lab-electron',
      traces: [{ trace_id: 'a'.repeat(32) }],
      next_cursor: 'next-page'
    })
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('validates detail trace ids before issuing a request', async () => {
    const fetchMock = vi.fn(unexpectedFetch)
    const observability = createElectronObservability(baseOptions(), {
      traceAdapter: new RecordingTraceAdapter(),
      fetch: fetchMock
    })

    await expect(observability.getTrace('../status')).rejects.toThrow(
      'trace_id 格式不正确'
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('flushes and shuts down the adapter once', async () => {
    const adapter = new RecordingTraceAdapter()
    const observability = createElectronObservability(baseOptions(), {
      traceAdapter: adapter,
      fetch: unexpectedFetch
    })

    await observability.flush()
    await observability.shutdown()
    await observability.shutdown()

    expect(adapter.flushCount).toBe(1)
    expect(adapter.shutdownCount).toBe(1)
  })

  it('exports OTLP protobuf to the Uni-Lab-OS proxy path', async () => {
    const requests: Array<{
      body: Buffer
      contentType: string | undefined
      url: string | undefined
    }> = []
    const server = createServer((request, response) => {
      const chunks: Buffer[] = []
      request.on('data', (chunk: Buffer) => chunks.push(chunk))
      request.on('end', () => {
        requests.push({
          body: Buffer.concat(chunks),
          contentType: request.headers['content-type'],
          url: request.url
        })
        response.writeHead(200, { 'content-type': 'application/x-protobuf' })
        response.end()
      })
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address() as AddressInfo
    const observability = createElectronObservability(baseOptions({
      baseUrl: `http://127.0.0.1:${address.port}/api/v1/observability`,
      shutdownTimeoutMs: 5_000
    }))

    try {
      observability.record('electron.integration.smoke', {
        'smoke.result': 'ok'
      })
      await observability.flush()
      await observability.shutdown()
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => {
        if (error) reject(error)
        else resolve()
      }))
    }

    expect(requests).toHaveLength(1)
    expect(requests[0]?.url).toBe(
      '/api/v1/observability/otlp/v1/traces'
    )
    expect(requests[0]?.contentType).toBe('application/x-protobuf')
    expect(requests[0]?.body.byteLength).toBeGreaterThan(0)
  })
})

function baseOptions(
  overrides: Partial<ElectronObservabilityOptions> = {}
): ElectronObservabilityOptions {
  return {
    enabled: true,
    baseUrl: DEFAULT_OBSERVABILITY_BASE_URL,
    projectName: 'uni-lab-electron',
    appVersion: '1.2.3',
    environment: 'development',
    platform: 'darwin',
    electronVersion: '33.4.11',
    nodeVersion: '20.18.3',
    homeDirectory: '/Users/lab',
    requestTimeoutMs: 1_000,
    shutdownTimeoutMs: 1_000,
    log: () => undefined,
    ...overrides
  }
}

async function unexpectedFetch(): Promise<Response> {
  throw new Error('不应调用 fetch')
}
