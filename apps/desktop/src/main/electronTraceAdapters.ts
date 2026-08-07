import {
  register,
  SpanStatusCode,
  type NodeTracerProvider,
  type Tracer
} from '@arizeai/phoenix-otel'

import type {
  ElectronObservabilityOptions,
  ElectronTraceAdapter,
  TraceAttributeValue,
  TraceSpanSink
} from './observability'

/** 创建向本机 Phoenix OTLP 端点写入的 Trace 适配器。 */
export function createPhoenixTraceAdapter(
  options: ElectronObservabilityOptions
): ElectronTraceAdapter {
  return new PhoenixTraceAdapter(options)
}

/** 创建禁用可观测性时使用的无操作 Trace 适配器。 */
export function createNoopTraceAdapter(): ElectronTraceAdapter {
  return new NoopTraceAdapter()
}

class PhoenixTraceAdapter implements ElectronTraceAdapter {
  private readonly provider: NodeTracerProvider
  private readonly tracer: Tracer

  constructor(options: ElectronObservabilityOptions) {
    this.provider = register({
      projectName: options.projectName,
      url: `${options.baseUrl}/otlp`,
      batch: true
    })
    this.tracer = this.provider.getTracer(
      'uni-lab-electron',
      options.appVersion
    )
  }

  run<T>(
    name: string,
    attributes: Record<string, TraceAttributeValue>,
    operation: (span: TraceSpanSink) => Promise<T>
  ): Promise<T> {
    return this.tracer.startActiveSpan(name, { attributes }, async (span) => {
      try {
        return await operation({
          markError: (error) => {
            span.recordException({ name: error.name, message: error.message })
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: error.message
            })
          }
        })
      } finally {
        span.end()
      }
    })
  }

  record(
    name: string,
    attributes: Record<string, TraceAttributeValue>,
    error?: Error
  ): void {
    this.tracer.startActiveSpan(name, { attributes }, (span) => {
      if (error) {
        span.recordException({ name: error.name, message: error.message })
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message })
      }
      span.end()
    })
  }

  flush(): Promise<void> {
    return this.provider.forceFlush()
  }

  shutdown(): Promise<void> {
    return this.provider.shutdown()
  }
}

class NoopTraceAdapter implements ElectronTraceAdapter {
  run<T>(
    _name: string,
    _attributes: Record<string, TraceAttributeValue>,
    operation: (span: TraceSpanSink) => Promise<T>
  ): Promise<T> {
    return operation({ markError: () => undefined })
  }

  record(): void {}

  flush(): Promise<void> {
    return Promise.resolve()
  }

  shutdown(): Promise<void> {
    return Promise.resolve()
  }
}
