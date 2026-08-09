export interface RendererConsoleLogLimiterOptions {
  limit: number
  windowMs: number
}

export interface RendererConsoleLogDecision {
  log: boolean
  reportSuppressed: boolean
}

interface RendererConsoleEntry {
  level: number
  message: string
  line: number
  sourceId: string
}

interface RendererConsoleTraceSink {
  record(name: string, attributes?: Record<string, unknown>): void
}

/** Bounds renderer error storms so a broken plugin transport cannot fill disk. */
export class RendererConsoleLogLimiter {
  private readonly limit: number
  private readonly windowMs: number
  private windowStartedAt = Number.NEGATIVE_INFINITY
  private count = 0
  private suppressionReported = false

  constructor(options: RendererConsoleLogLimiterOptions) {
    this.limit = options.limit
    this.windowMs = options.windowMs
  }

  accept(now: number): RendererConsoleLogDecision {
    if (now - this.windowStartedAt >= this.windowMs) {
      this.windowStartedAt = now
      this.count = 0
      this.suppressionReported = false
    }
    this.count += 1
    if (this.count <= this.limit) {
      return { log: true, reportSuppressed: false }
    }
    if (!this.suppressionReported) {
      this.suppressionReported = true
      return { log: false, reportSuppressed: true }
    }
    return { log: false, reportSuppressed: false }
  }

  record(
    entry: RendererConsoleEntry,
    log: (message: string) => void,
    trace: RendererConsoleTraceSink
  ): void {
    const decision = this.accept(Date.now())
    if (decision.log) {
      log(`renderer console: ${entry.message} (${entry.sourceId}:${entry.line})`)
      trace.record('electron.renderer.console', {
        'log.severity_number': entry.level,
        'log.message': entry.message,
        'code.filepath': entry.sourceId,
        'code.lineno': entry.line
      })
    } else if (decision.reportSuppressed) {
      const windowSeconds = this.windowMs / 1_000
      log(
        `renderer console: 高频错误已限流（${windowSeconds} 秒窗口最多记录 ${this.limit} 条）`
      )
      trace.record('electron.renderer.console_limited')
    }
  }
}
