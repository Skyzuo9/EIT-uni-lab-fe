import { afterEach, describe, expect, it, vi } from 'vitest'

import { getDefaultBackend } from './backends'
import type { HttpClient } from './http'
import { createWorkflowRuntime } from './workflow'

const WORKFLOW_UUID = '11111111-1111-4111-8111-111111111111'
const TASK_UUID = '22222222-2222-4222-8222-222222222222'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('shared Workflow SSE transport', () => {
  it('shares one physical event stream across Authoring and Runtime subscribers', async () => {
    const stream = controlledSseResponse()
    const fetcher = vi.fn().mockResolvedValue(stream.response)
    vi.stubGlobal('fetch', fetcher)
    const runtime = createWorkflowRuntime(
      inertHttpClient(),
      getDefaultBackend('local-python')
    )
    const authoringEventIds: string[] = []
    const runtimeEventIds: string[] = []
    const openedSubscribers: string[] = []

    const authoringSubscription = runtime.subscribeWorkflowAuthoring(
      WORKFLOW_UUID,
      (event) => authoringEventIds.push(event.id),
      { onOpen: () => openedSubscribers.push('authoring') }
    )
    const runtimeSubscription = runtime.subscribeWorkflowRuntime(
      (event) => runtimeEventIds.push(event.id),
      { onOpen: () => openedSubscribers.push('runtime') }
    )

    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce())
    await vi.waitFor(() => {
      expect(openedSubscribers.sort()).toEqual(['authoring', 'runtime'])
    })
    const [, init] = fetcher.mock.calls[0] as [string, RequestInit]
    stream.controller.enqueue(new TextEncoder().encode([
      'id: 1',
      'event: workflow.authoring.changed',
      `data: ${JSON.stringify({
        workflow_uuid: WORKFLOW_UUID,
        cause: 'draft_saved',
        workflow_revision: 1,
        draft_hash: null,
        candidate_hash: null
      })}`,
      '',
      'id: 2',
      'event: workflow.runtime.changed',
      `data: ${JSON.stringify({ workflow_task_uuid: TASK_UUID })}`,
      '',
      ''
    ].join('\n')))

    await vi.waitFor(() => {
      expect(authoringEventIds).toEqual(['1'])
      expect(runtimeEventIds).toEqual(['2'])
    })

    authoringSubscription.dispose()
    expect((init.signal as AbortSignal).aborted).toBe(false)
    runtimeSubscription.dispose()
    expect((init.signal as AbortSignal).aborted).toBe(true)
    runtime.dispose()
  })

  it('can subscribe again after a StrictMode-style Runtime dispose replay', async () => {
    const firstStream = controlledSseResponse()
    const secondStream = controlledSseResponse()
    const fetcher = vi.fn()
      .mockResolvedValueOnce(firstStream.response)
      .mockResolvedValueOnce(secondStream.response)
    vi.stubGlobal('fetch', fetcher)
    const runtime = createWorkflowRuntime(
      inertHttpClient(),
      getDefaultBackend('local-python')
    )
    const first = runtime.subscribeWorkflowRuntime(() => undefined)

    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce())
    const [, firstInit] = fetcher.mock.calls[0] as [string, RequestInit]
    runtime.dispose()
    expect((firstInit.signal as AbortSignal).aborted).toBe(true)

    const replayed = runtime.subscribeWorkflowRuntime(() => undefined)
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
    const [, secondInit] = fetcher.mock.calls[1] as [string, RequestInit]
    expect((secondInit.signal as AbortSignal).aborted).toBe(false)

    first.dispose()
    replayed.dispose()
    expect((secondInit.signal as AbortSignal).aborted).toBe(true)
  })
})

interface ControlledSseResponse {
  response: Response
  controller: ReadableStreamDefaultController<Uint8Array>
}

/** 创建保持打开且可由测试写入帧的 SSE 响应。 */
function controlledSseResponse(): ControlledSseResponse {
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined
  const stream = new ReadableStream<Uint8Array>({
    start(value) {
      controller = value
    }
  })
  if (!controller) throw new Error('SSE test controller was not installed')
  return {
    response: new Response(stream, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' }
    }),
    controller
  }
}

/** 返回本测试不会调用的 REST 端口。 */
function inertHttpClient(): HttpClient {
  return {
    request: async () => {
      throw new Error('REST should not be called by the SSE transport test')
    }
  }
}
