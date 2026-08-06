import type { WorkflowEventSubscription } from './workflowTaskContracts'

export interface WorkflowSseFrame {
  id: string
  event: string
  data: string
}

interface WorkflowSseSubscriptionOptions<Event> {
  url: string
  lastEventId?: string
  connectionErrorLabel: string
  disconnectedMessage?: string
  subscriptions: Set<WorkflowEventSubscription>
  onOpen?: (state: {
    lastEventId: string
    reconnected: boolean
  }) => void
  onError?: (error: Error) => void
  acceptFrame?: (frame: WorkflowSseFrame) => boolean
  dedupeBeforeParse?: boolean
  parseFrame: (frame: WorkflowSseFrame) => Event | null
  onEvent: (event: Event) => void
}

const RECONNECT_DELAY_MS = 3000
const MAX_SEEN_EVENT_IDS = 512

/**
 * 建立可恢复的工作流服务端事件流（SSE）订阅。
 *
 * @param options 地址、游标、错误回调及事件处理器。
 * @returns 可幂等释放的订阅句柄。
 */
export function createWorkflowSseSubscription<Event>(
  options: WorkflowSseSubscriptionOptions<Event>
): WorkflowEventSubscription {
  let disposed = false
  let controller: AbortController | null = null
  let reconnectTimer: ReturnType<typeof globalThis.setTimeout> | null = null
  let cursor = options.lastEventId || ''
  let openedConnections = 0
  const seenEventIds = new Set<string>()

  /** 安排唯一一次延迟重连，避免并发断线触发重连风暴。 */
  const scheduleReconnect = (): void => {
    if (disposed || reconnectTimer !== null) return
    reconnectTimer = globalThis.setTimeout(() => {
      reconnectTimer = null
      void connect()
    }, RECONNECT_DELAY_MS)
  }

  /** 读取一次 SSE 连接，并在自然断开或失败后进入重连。 */
  const connect = async (): Promise<void> => {
    if (disposed) return
    controller = new AbortController()
    const activeController = controller
    const headers = new Headers({ Accept: 'text/event-stream' })
    if (cursor) headers.set('Last-Event-ID', cursor)
    try {
      const response = await globalThis.fetch(options.url, {
        headers,
        signal: activeController.signal
      })
      if (!response.ok || !response.body) {
        throw new Error(
          `${options.connectionErrorLabel}: ${response.status} ${
            response.statusText
          }`
        )
      }
      options.onOpen?.({
        lastEventId: cursor,
        reconnected: openedConnections > 0
      })
      openedConnections += 1
      await readSseStream(response.body, (frame) => {
        if (frame.id) cursor = frame.id
        if (options.acceptFrame && !options.acceptFrame(frame)) return
        if (
          options.dedupeBeforeParse &&
          isDuplicateEvent(frame.id, seenEventIds)
        ) return
        const event = options.parseFrame(frame)
        if (event === null) return
        if (
          !options.dedupeBeforeParse &&
          isDuplicateEvent(frame.id, seenEventIds)
        ) return
        options.onEvent(event)
      }, activeController.signal)
      if (
        options.disconnectedMessage &&
        !disposed &&
        !activeController.signal.aborted
      ) {
        options.onError?.(new Error(options.disconnectedMessage))
      }
      scheduleReconnect()
    } catch (error) {
      if (disposed || activeController.signal.aborted) return
      options.onError?.(asError(error))
      scheduleReconnect()
    }
  }

  /**
   * 浏览器恢复在线时立即重建 SSE，并沿用已经确认的持久事件游标（Cursor）。
   *
   * @returns 无返回值；释放后的订阅忽略在线事件。
   */
  const reconnectWhenOnline = (): void => {
    if (disposed) return
    if (reconnectTimer !== null) {
      globalThis.clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    controller?.abort()
    void connect()
  }

  globalThis.addEventListener?.('online', reconnectWhenOnline)

  const subscription: WorkflowEventSubscription = {
    dispose: () => {
      if (disposed) return
      disposed = true
      controller?.abort()
      globalThis.removeEventListener?.('online', reconnectWhenOnline)
      if (reconnectTimer !== null) {
        globalThis.clearTimeout(reconnectTimer)
      }
      options.subscriptions.delete(subscription)
    }
  }
  options.subscriptions.add(subscription)
  void connect()
  return subscription
}

/** 记录事件标识并判断该帧是否已经交付过。 */
function isDuplicateEvent(
  eventId: string,
  seenEventIds: Set<string>
): boolean {
  if (!eventId) return false
  if (seenEventIds.has(eventId)) return true
  seenEventIds.add(eventId)
  if (seenEventIds.size > MAX_SEEN_EVENT_IDS) {
    const oldest = seenEventIds.values().next().value
    if (oldest !== undefined) seenEventIds.delete(oldest)
  }
  return false
}

/** 按 SSE 空行边界增量读取字节流。 */
async function readSseStream(
  stream: ReadableStream<Uint8Array>,
  onFrame: (frame: WorkflowSseFrame) => void,
  signal: AbortSignal
): Promise<void> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (!signal.aborted) {
      const chunk = await reader.read()
      if (chunk.done) break
      buffer += decoder.decode(chunk.value, { stream: true })
      const frames = buffer.split(/\r?\n\r?\n/)
      buffer = frames.pop() || ''
      for (const value of frames) {
        const parsed = parseSseFrame(value)
        if (parsed) onFrame(parsed)
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
}

/** 将一段 SSE 文本解析为事件帧。 */
function parseSseFrame(value: string): WorkflowSseFrame | null {
  let id = ''
  let event = 'message'
  const data: string[] = []
  for (const line of value.split(/\r?\n/)) {
    if (!line || line.startsWith(':')) continue
    const separator = line.indexOf(':')
    const field = separator < 0 ? line : line.slice(0, separator)
    const raw = separator < 0 ? '' : line.slice(separator + 1)
    const fieldValue = raw.startsWith(' ') ? raw.slice(1) : raw
    if (field === 'id') id = fieldValue
    else if (field === 'event') event = fieldValue
    else if (field === 'data') data.push(fieldValue)
  }
  if (data.length === 0 && id === '') return null
  return { id, event, data: data.join('\n') }
}

/** 把未知异常规范化为 Error，供连接层统一上报。 */
function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}
