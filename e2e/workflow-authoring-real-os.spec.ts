import { expect, test } from '@playwright/test'

import {
  startPersistentAuthoringOs,
  type PersistentAuthoringOs
} from './helpers/persistent-authoring-os'

let os: PersistentAuthoringOs

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  os = await startPersistentAuthoringOs()
})

test.afterAll(async () => {
  await os?.stop()
})

test('real production OS completes persistent Authoring HTTP and SSE', async () => {
  const authoringUrl =
    `${os.url}/api/v1/workflows/${os.workflowUuid}/authoring`
  const initial = await readEnvelope<AuthoringAggregate>(authoringUrl)
  expect(initial.workflow_uuid).toBe(os.workflowUuid)
  expect(initial.draft).not.toBeNull()
  expect(initial.candidate).not.toBeNull()
  if (!initial.draft || !initial.candidate) {
    throw new Error('production fixture did not materialize Authoring')
  }

  const streamResponse = await fetch(`${os.url}/api/v1/events`, {
    headers: {
      Accept: 'text/event-stream',
      'Last-Event-ID': '0'
    }
  })
  expect(streamResponse.ok).toBe(true)
  const draftSavedEvent = readAuthoringEvent(
    streamResponse,
    os.workflowUuid,
    'draft_saved'
  )
  const draftBody = {
    python_source: initial.candidate.normalized_python_source,
    expected_draft_hash: initial.draft.draft_hash,
    expected_workflow_revision: initial.workflow_revision
  }
  const saved = await readEnvelope<AuthoringAggregate>(
    `${authoringUrl}/draft`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draftBody)
    }
  )
  expect(saved.candidate).not.toBeNull()
  expect(await draftSavedEvent).toMatchObject({
    event: 'workflow.authoring.changed',
    data: {
      workflow_uuid: os.workflowUuid,
      cause: 'draft_saved',
      draft_hash: saved.draft?.draft_hash,
      candidate_hash: saved.candidate?.candidate_hash
    }
  })

  const refreshed = await readEnvelope<AuthoringAggregate>(authoringUrl)
  expect(refreshed.draft?.draft_hash).toBe(saved.draft?.draft_hash)
  const applyBody = {
    candidate_hash: refreshed.candidate?.candidate_hash
  }
  expect(Object.keys(applyBody)).toEqual(['candidate_hash'])
  const applied = await readEnvelope<{
    apply_result: { kind: string; workflow_revision: number }
    authoring: AuthoringAggregate
  }>(`${authoringUrl}/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(applyBody)
  })
  expect(applied.apply_result.kind).toBe('graph')

  const finalState = await readEnvelope<AuthoringAggregate>(authoringUrl)
  expect(finalState).toEqual(applied.authoring)
  expect(finalState.state).toBe('applied')
})

interface AuthoringAggregate {
  workflow_uuid: string
  workflow_revision: number
  state: string
  draft: {
    python_source: string
    draft_hash: string
  } | null
  candidate: {
    candidate_hash: string
    normalized_python_source: string
  } | null
}

interface SseEvent {
  id: string
  event: string
  data: Record<string, unknown>
}

async function readEnvelope<Value>(
  url: string,
  init?: RequestInit
): Promise<Value> {
  const response = await fetch(url, init)
  const responseText = await response.text()
  expect(response.status, responseText).toBe(200)
  const envelope = JSON.parse(responseText) as {
    code: number
    data: Value
  }
  expect(envelope.code).toBe(0)
  return envelope.data
}

async function readAuthoringEvent(
  response: Response,
  workflowUuid: string,
  cause: string
): Promise<SseEvent> {
  if (!response.body) throw new Error('SSE response body is missing')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const deadline = Date.now() + 10_000
  try {
    while (Date.now() < deadline) {
      const chunk = await Promise.race([
        reader.read(),
        new Promise<never>((_resolve, reject) => {
          setTimeout(() => reject(new Error('SSE read timed out')), 10_000)
        })
      ])
      if (chunk.done) break
      buffer += decoder.decode(chunk.value, { stream: true })
      const frames = buffer.split(/\r?\n\r?\n/)
      buffer = frames.pop() || ''
      for (const frame of frames) {
        const event = parseSseFrame(frame)
        if (
          event.event === 'workflow.authoring.changed' &&
          event.data.workflow_uuid === workflowUuid &&
          event.data.cause === cause
        ) {
          return event
        }
      }
    }
    throw new Error(`missing ${cause} Authoring SSE event`)
  } finally {
    await reader.cancel()
  }
}

function parseSseFrame(frame: string): SseEvent {
  const fields = new Map<string, string>()
  for (const line of frame.split(/\r?\n/)) {
    const separator = line.indexOf(':')
    if (separator < 0) continue
    fields.set(
      line.slice(0, separator),
      line.slice(separator + 1).trimStart()
    )
  }
  return {
    id: fields.get('id') || '',
    event: fields.get('event') || 'message',
    data: JSON.parse(fields.get('data') || '{}') as Record<string, unknown>
  }
}
