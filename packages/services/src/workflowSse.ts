import type { WorkflowEventSubscription } from './workflowTaskContracts'
import {
  createHttpRequestTrace,
  finishHttpRequestTrace,
  reportHttpRequestTrace,
  type HttpRequestTraceReporter
} from './http'

export interface WorkflowSseFrame {
  id: string
  event: string
  data: string
}

interface WorkflowSseSubscriptionOptions<Event> {
  transport: WorkflowSseTransport
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

interface WorkflowSseTransportSubscriber {
  lastEventId?: string
  onOpen?: (state: {
    lastEventId: string
    reconnected: boolean
  }) => void
  onError?: (error: Error) => void
  onDisconnected?: () => void
  onFrame: (frame: WorkflowSseFrame) => void
}

interface WorkflowSseConnection {
  subscribe: (subscriber: WorkflowSseTransportSubscriber) => () => void
  dispose: () => void
}

/** 同一个 Workflow Runtime 内复用全局事件流的物理 HTTP 连接。 */
export interface WorkflowSseTransport {
  subscribe: (subscriber: WorkflowSseTransportSubscriber) => () => void
  dispose: () => void
}

const RECONNECT_DELAY_MS = 3000
const MAX_SEEN_EVENT_IDS = 512

/**
 * 创建工作流全局事件流传输层。
 *
 * 无显式游标的逻辑订阅共享一条物理 SSE；携带独立恢复游标的订阅保留专用连接，
 * 避免把两个不同的 Last-Event-ID 合并成不确定的恢复边界。
 */
export function createWorkflowSseTransport(
  url: string,
  traceRequest?: HttpRequestTraceReporter
): WorkflowSseTransport {
  const sharedConnection = createWorkflowSseConnection(url, traceRequest)
  const dedicatedConnections = new Set<WorkflowSseConnection>()
  let disposed = false

  return {
    subscribe: (subscriber) => {
      if (disposed) return () => undefined
      if (!subscriber.lastEventId) {
        return sharedConnection.subscribe(subscriber)
      }
      const connection = createWorkflowSseConnection(url, traceRequest)
      dedicatedConnections.add(connection)
      const unsubscribe = connection.subscribe(subscriber)
      return () => {
        unsubscribe()
        connection.dispose()
        dedicatedConnections.delete(connection)
      }
    },
    dispose: () => {
      if (disposed) return
      disposed = true
      sharedConnection.dispose()
      for (const connection of dedicatedConnections) connection.dispose()
      dedicatedConnections.clear()
    }
  }
}

/**
 * 建立可恢复的工作流服务端事件逻辑订阅。
 *
 * 多个逻辑订阅由同一个 transport 扇出；事件过滤、严格解析与 event ID 去重仍各自
 * 隔离，释放单个订阅不会中断仍有消费者的物理连接。
 */
export function createWorkflowSseSubscription<Event>(
  options: WorkflowSseSubscriptionOptions<Event>
): WorkflowEventSubscription {
  let disposed = false
  const seenEventIds = new Set<string>()
  const unsubscribe = options.transport.subscribe({
    lastEventId: options.lastEventId,
    onOpen: options.onOpen,
    onError: (error) => {
      options.onError?.(new Error(
        `${options.connectionErrorLabel}: ${error.message}`
      ))
    },
    onDisconnected: () => {
      if (options.disconnectedMessage) {
        options.onError?.(new Error(options.disconnectedMessage))
      }
    },
    onFrame: (frame) => {
      if (options.acceptFrame && !options.acceptFrame(frame)) return
      if (
        options.dedupeBeforeParse &&
        isDuplicateEvent(frame.id, seenEventIds)
      ) return
      try {
        const event = options.parseFrame(frame)
        if (event === null) return
        if (
          !options.dedupeBeforeParse &&
          isDuplicateEvent(frame.id, seenEventIds)
        ) return
        options.onEvent(event)
      } catch (error) {
        options.onError?.(asError(error))
      }
    }
  })

  const subscription: WorkflowEventSubscription = {
    dispose: () => {
      if (disposed) return
      disposed = true
      unsubscribe()
      options.subscriptions.delete(subscription)
    }
  }
  options.subscriptions.add(subscription)
  return subscription
}

/** 创建一条可由多个逻辑消费者共享、在最后一个消费者离开时关闭的 SSE 连接。 */
function createWorkflowSseConnection(
  url: string,
  traceRequest?: HttpRequestTraceReporter
): WorkflowSseConnection {
  const subscribers = new Set<WorkflowSseTransportSubscriber>()
  let controller: AbortController | null = null
  let reconnectTimer: ReturnType<typeof globalThis.setTimeout> | null = null
  let cursor = ''
  let openedConnections = 0
  let connected = false
  let onlineListenerInstalled = false
  let disposed = false

  /** 安排唯一一次延迟重连，避免并发断线触发重连风暴。 */
  const scheduleReconnect = (): void => {
    if (disposed || subscribers.size === 0 || reconnectTimer !== null) return
    reconnectTimer = globalThis.setTimeout(() => {
      reconnectTimer = null
      void connect()
    }, RECONNECT_DELAY_MS)
  }

  /** 向当前所有逻辑订阅扇出一帧，单个解析失败不会击穿共享连接。 */
  const dispatchFrame = (frame: WorkflowSseFrame): void => {
    if (frame.id) cursor = frame.id
    for (const subscriber of [...subscribers]) {
      try {
        subscriber.onFrame(frame)
      } catch (error) {
        subscriber.onError?.(asError(error))
      }
    }
  }

  /** 读取一次物理 SSE，并在自然断开或失败后进入重连。 */
  const connect = async (): Promise<void> => {
    if (disposed || subscribers.size === 0 || controller !== null) return
    const activeController = new AbortController()
    controller = activeController
    const headers = new Headers({ Accept: 'text/event-stream' })
    if (cursor) headers.set('Last-Event-ID', cursor)
    const requestTrace = createHttpRequestTrace(url, 'GET', 'sse')
    headers.set('traceparent', requestTrace.traceparent)
    let traceReported = false
    try {
      const response = await globalThis.fetch(url, {
        headers,
        signal: activeController.signal
      })
      if (!response.ok || !response.body) {
        throw new Error(`${response.status} ${response.statusText}`)
      }
      reportHttpRequestTrace(traceRequest, finishHttpRequestTrace(
        requestTrace,
        'open',
        response.status
      ))
      traceReported = true
      connected = true
      const openState = {
        lastEventId: cursor,
        reconnected: openedConnections > 0
      }
      openedConnections += 1
      for (const subscriber of [...subscribers]) {
        subscriber.onOpen?.(openState)
      }
      await readSseStream(response.body, dispatchFrame, activeController.signal)
      if (
        !disposed &&
        subscribers.size > 0 &&
        !activeController.signal.aborted
      ) {
        for (const subscriber of [...subscribers]) {
          subscriber.onDisconnected?.()
        }
      }
    } catch (error) {
      if (!traceReported) {
        reportHttpRequestTrace(traceRequest, finishHttpRequestTrace(
          requestTrace,
          activeController.signal.aborted ? 'cancelled' : 'error'
        ))
        traceReported = true
      }
      if (
        !disposed &&
        subscribers.size > 0 &&
        !activeController.signal.aborted
      ) {
        for (const subscriber of [...subscribers]) {
          subscriber.onError?.(asError(error))
        }
      }
    } finally {
      if (controller === activeController) controller = null
      connected = false
    }
    if (!activeController.signal.aborted) scheduleReconnect()
  }

  /** 浏览器恢复在线时只重建这一条共享物理连接。 */
  const reconnectWhenOnline = (): void => {
    if (disposed || subscribers.size === 0) return
    if (reconnectTimer !== null) {
      globalThis.clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    const previous = controller
    controller = null
    connected = false
    previous?.abort()
    void connect()
  }

  /** 安装浏览器在线监听器；没有消费者时不占用全局生命周期。 */
  const installOnlineListener = (): void => {
    if (onlineListenerInstalled) return
    globalThis.addEventListener?.('online', reconnectWhenOnline)
    onlineListenerInstalled = true
  }

  /** 在最后一个消费者离开后释放物理连接与在线监听器。 */
  const stopWhenUnused = (): void => {
    if (subscribers.size > 0) return
    if (reconnectTimer !== null) {
      globalThis.clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    const previous = controller
    controller = null
    connected = false
    previous?.abort()
    if (onlineListenerInstalled) {
      globalThis.removeEventListener?.('online', reconnectWhenOnline)
      onlineListenerInstalled = false
    }
    cursor = ''
    openedConnections = 0
  }

  return {
    subscribe: (subscriber) => {
      if (disposed) return () => undefined
      if (subscribers.size === 0 && subscriber.lastEventId) {
        cursor = subscriber.lastEventId
      }
      subscribers.add(subscriber)
      installOnlineListener()
      if (connected) {
        subscriber.onOpen?.({ lastEventId: cursor, reconnected: false })
      } else {
        void connect()
      }
      return () => {
        subscribers.delete(subscriber)
        stopWhenUnused()
      }
    },
    dispose: () => {
      if (disposed) return
      disposed = true
      subscribers.clear()
      stopWhenUnused()
    }
  }
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
