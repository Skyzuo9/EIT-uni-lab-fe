import { describe, expect, it, vi } from 'vitest'

import {
  createElectronObservability,
  parseHttpRequestTraceEvent,
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
  it('exports packaged telemetry to the local SigNoz collector by default', () => {
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
      otlpHttpEndpoint: 'http://127.0.0.1:4318',
      projectName: 'uni-lab-electron',
      environment: 'production',
      requestTimeoutMs: 5_000,
      shutdownTimeoutMs: 3_000
    })
  })

  it('exports development telemetry to the local SigNoz collector by default', () => {
    const options = resolveElectronObservabilityOptions({
      environment: {},
      appVersion: '1.2.3',
      isPackaged: false,
      homeDirectory: '/Users/lab',
      log: () => undefined
    })

    expect(options.otlpHttpEndpoint).toBe('http://127.0.0.1:4318')
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

  it('normalizes an explicit local OTLP HTTP endpoint', () => {
    const options = resolveElectronObservabilityOptions({
      environment: {
        UNILABOS_OTLP_HTTP_ENDPOINT: 'http://127.0.0.1:4318/'
      },
      appVersion: '1.2.3',
      isPackaged: false,
      homeDirectory: '/Users/lab',
      log: () => undefined
    })

    expect(options.baseUrl).toBe(DEFAULT_OBSERVABILITY_BASE_URL)
    expect(options.otlpHttpEndpoint).toBe('http://127.0.0.1:4318')
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

  it('runs the business operation once when the trace adapter fails', async () => {
    const failingAdapter: ElectronTraceAdapter = {
      run: async () => { throw new Error('trace unavailable') },
      record: () => { throw new Error('trace unavailable') },
      flush: async () => undefined,
      shutdown: async () => undefined
    }
    const operation = vi.fn(async () => 'ok')
    const observability = createElectronObservability(baseOptions(), {
      traceAdapter: failingAdapter,
      fetch: unexpectedFetch
    })

    await expect(observability.run('electron.fail-open', {}, operation)).resolves.toBe('ok')
    expect(operation).toHaveBeenCalledOnce()
    expect(() => observability.record('electron.fail-open')).not.toThrow()
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

  it('rejects malformed renderer HTTP trace events', () => {
    expect(() => parseHttpRequestTraceEvent({
      transport: 'http',
      method: 'GET',
      path: '/api/v1/health?token=secret',
      traceId: 'a'.repeat(32),
      spanId: 'b'.repeat(16),
      traceparent: `00-${'a'.repeat(32)}-${'b'.repeat(16)}-01`,
      startedAtUnixMs: Date.now(),
      durationMs: 1,
      outcome: 'ok'
    })).toThrow('path 不正确')
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

  it('exports traces and logs directly to an OTLP HTTP collector', async () => {
    const requests: Array<{
      body: string
      endpoint: string
    }> = []
    const observability = createElectronObservability(baseOptions({
      otlpHttpEndpoint: 'http://127.0.0.1:4318'
    }), {
      traceAdapter: new RecordingTraceAdapter(),
      otlpJsonTransport: async (endpoint, body) => {
        requests.push({ endpoint, body })
      }
    })

    observability.log('Electron OTLP log smoke', 'INFO', {
      'smoke.result': 'ok'
    })
    observability.recordHttpRequestTrace({
      transport: 'http',
      method: 'POST',
      path: '/api/v1/workflows',
      traceId: 'a'.repeat(32),
      spanId: 'b'.repeat(16),
      traceparent: `00-${'a'.repeat(32)}-${'b'.repeat(16)}-01`,
      startedAtUnixMs: Date.now() - 12,
      durationMs: 12,
      statusCode: 201,
      outcome: 'ok'
    })
    await observability.flush()
    await observability.shutdown()

    expect(requests).toHaveLength(2)
    const jsonTraceRequest = requests.find(
      (request) => request.endpoint === 'http://127.0.0.1:4318/v1/traces'
    )
    const requestSpan = JSON.parse(
      jsonTraceRequest?.body ?? '{}'
    ).resourceSpans[0].scopeSpans[0].spans[0]
    expect(requestSpan).toMatchObject({
      traceId: 'a'.repeat(32),
      spanId: 'b'.repeat(16),
      name: 'electron.http.client',
      kind: 3,
      status: { code: 1 }
    })
    expect(BigInt(requestSpan.endTimeUnixNano)).toBeGreaterThan(
      BigInt(requestSpan.startTimeUnixNano)
    )
    const logRequest = requests.find(
      (request) => request.endpoint === 'http://127.0.0.1:4318/v1/logs'
    )
    const logRecords = JSON.parse(
      logRequest?.body ?? '{}'
    ).resourceLogs[0].scopeLogs[0].logRecords
    expect(logRecords).toHaveLength(2)
    expect(logRecords.map((record: { body: { stringValue: string } }) => (
      record.body.stringValue
    ))).toEqual([
      'Electron OTLP log smoke',
      'electron.http.client'
    ])
    expect(logRecords[1]).toMatchObject({
      traceId: 'a'.repeat(32),
      spanId: 'b'.repeat(16),
      flags: 1
    })
  })
})

function baseOptions(
  overrides: Partial<ElectronObservabilityOptions> = {}
): ElectronObservabilityOptions {
  return {
    enabled: true,
    baseUrl: DEFAULT_OBSERVABILITY_BASE_URL,
    otlpHttpEndpoint: `${DEFAULT_OBSERVABILITY_BASE_URL}/otlp`,
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
