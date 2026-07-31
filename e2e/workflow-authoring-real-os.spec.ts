import { expect, test } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'

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

test('kernel-web uses D-117 single edit authority through the real OS', async ({
  page
}) => {
  test.setTimeout(90_000)
  const browserErrors: string[] = []
  const authoringRequests: Array<{
    method: string
    url: string
    body: unknown
  }> = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('pageerror', (error) => browserErrors.push(error.message))
  page.on('request', (request) => {
    if (!request.url().startsWith(`${os.url}/api/v1/`)) return
    let body: unknown = null
    try {
      body = request.postDataJSON()
    } catch {
      body = request.postData()
    }
    authoringRequests.push({
      method: request.method(),
      url: request.url(),
      body
    })
  })

  const activeWorkflowStorageKey = `unilab.workflow.active.${
    encodeURIComponent(`local-python:${os.url}`)
  }.v1`
  await page.addInitScript(
    ({ storageKey, workflowUuid }) => {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ version: 1, workflowId: workflowUuid })
      )
    },
    {
      storageKey: activeWorkflowStorageKey,
      workflowUuid: os.workflowUuid
    }
  )

  await page.goto(`/?localOsUrl=${encodeURIComponent(os.url)}`)
  await page.getByText('工作流', { exact: true }).first().click()
  await expect(page.getByText('完整控制流 DAG')).toBeVisible()

  const codeMode = page.getByRole('button', {
    name: '代码模式',
    exact: true
  })
  const canvasMode = page.getByRole('button', {
    name: '画布模式',
    exact: true
  })
  await expect(codeMode).toBeVisible()
  await expect(canvasMode).toBeVisible()
  await expect(codeMode).toHaveAttribute('aria-pressed', 'true')
  await expect(canvasMode).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByText(/画布.*只读.*投影/)).toBeVisible()

  await expect.poll(() => countRequests(
    authoringRequests,
    'GET',
    `/workflows/${os.workflowUuid}/authoring`
  )).toBeGreaterThanOrEqual(1)
  await expect.poll(() => countRequests(
    authoringRequests,
    'GET',
    '/events'
  )).toBeGreaterThanOrEqual(1)

  const editor = page.locator('.cm-content:visible')
  await expect(editor).toHaveAttribute('contenteditable', 'true')
  const projectedNode = page.locator('.react-flow__node-wfNode').first()
  await expect(projectedNode).toBeVisible()
  const projectedPosition = await projectedNode.getAttribute('style')
  await dragNode(page, projectedNode, 80, 40)
  expect(await projectedNode.getAttribute('style')).toBe(projectedPosition)

  await editor.click()
  await page.keyboard.press('Control+f')
  await page.keyboard.insertText('= 3')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Escape')
  await page.keyboard.insertText('= 4')

  await canvasMode.click()
  const dirtyGuard = page.getByRole('dialog', { name: /未保存.*切换/ })
  await expect(dirtyGuard).toBeVisible()
  await dirtyGuard.getByRole('button', { name: /取消/ }).click()
  await expect(codeMode).toHaveAttribute('aria-pressed', 'true')
  await expect(editor).toContainText('= 4')

  const draftPutBeforeCodeSave = countRequests(
    authoringRequests,
    'PUT',
    `/workflows/${os.workflowUuid}/authoring/draft`
  )
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect.poll(() => countRequests(
    authoringRequests,
    'PUT',
    `/workflows/${os.workflowUuid}/authoring/draft`
  )).toBe(draftPutBeforeCodeSave + 1)
  const codeDraftRequest = lastRequest(
    authoringRequests,
    'PUT',
    `/workflows/${os.workflowUuid}/authoring/draft`
  )
  expect(Object.keys(codeDraftRequest.body as Record<string, unknown>).sort())
    .toEqual([
      'expected_draft_hash',
      'expected_workflow_revision',
      'python_source'
    ])

  const aggregateGetsBeforeExternalEdit = countRequests(
    authoringRequests,
    'GET',
    `/workflows/${os.workflowUuid}/authoring`
  )
  const sourceBeforeExternalEdit = readFileSync(os.sourcePath, 'utf8')
  const externallyEditedSource = sourceBeforeExternalEdit.includes('= 4,')
    ? sourceBeforeExternalEdit.replace('= 4,', '= 5,')
    : sourceBeforeExternalEdit.replace('= 3,', '= 4,')
  expect(externallyEditedSource).not.toBe(sourceBeforeExternalEdit)
  writeFileSync(os.sourcePath, externallyEditedSource, 'utf8')
  await expect.poll(() => countRequests(
    authoringRequests,
    'GET',
    `/workflows/${os.workflowUuid}/authoring`
  ), { timeout: 15_000 }).toBeGreaterThan(aggregateGetsBeforeExternalEdit)
  await expect(page.getByText(/已同步外部修改/)).toBeVisible()

  await canvasMode.click()
  await expect(canvasMode).toHaveAttribute('aria-pressed', 'true')
  await expect(editor).toHaveAttribute('contenteditable', 'false')
  await expect(page.getByText(/Python.*只读.*投影/)).toBeVisible()
  const canvasPosition = await projectedNode.getAttribute('style')
  await dragNode(page, projectedNode, 100, 50)
  expect(await projectedNode.getAttribute('style')).not.toBe(canvasPosition)

  const draftPutBeforeDiffAcceptance = countRequests(
    authoringRequests,
    'PUT',
    `/workflows/${os.workflowUuid}/authoring/draft`
  )
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  const fullDiff = page.getByRole('dialog', { name: /完整 Python 差异/ })
  await expect(fullDiff).toBeVisible()
  await expect(fullDiff.getByText('当前 Python', { exact: true })).toBeVisible()
  await expect(
    fullDiff.getByText('生成的完整 Python', { exact: true })
  ).toBeVisible()
  expect(countRequests(
    authoringRequests,
    'PUT',
    `/workflows/${os.workflowUuid}/authoring/draft`
  )).toBe(draftPutBeforeDiffAcceptance)
  await fullDiff.getByRole('button', {
    name: /接受完整差异并保存/
  }).click()
  await expect.poll(() => countRequests(
    authoringRequests,
    'PUT',
    `/workflows/${os.workflowUuid}/authoring/draft`
  )).toBe(draftPutBeforeDiffAcceptance + 1)

  await page.getByRole('button', {
    name: '应用工作流',
    exact: true
  }).click()
  await expect.poll(() => countRequests(
    authoringRequests,
    'POST',
    `/workflows/${os.workflowUuid}/authoring/apply`
  )).toBeGreaterThanOrEqual(1)
  const applyRequest = lastRequest(
    authoringRequests,
    'POST',
    `/workflows/${os.workflowUuid}/authoring/apply`
  )
  expect(Object.keys(applyRequest.body as Record<string, unknown>)).toEqual([
    'candidate_hash'
  ])
  expect(browserErrors).toEqual([])
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

function countRequests(
  requests: Array<{ method: string; url: string }>,
  method: string,
  pathSuffix: string
): number {
  return requests.filter(
    (request) =>
      request.method === method && new URL(request.url).pathname.endsWith(pathSuffix)
  ).length
}

function lastRequest(
  requests: Array<{ method: string; url: string; body: unknown }>,
  method: string,
  pathSuffix: string
): { method: string; url: string; body: unknown } {
  const found = [...requests].reverse().find(
    (request) =>
      request.method === method && new URL(request.url).pathname.endsWith(pathSuffix)
  )
  if (!found) throw new Error(`missing ${method} ${pathSuffix}`)
  return found
}

async function dragNode(
  page: import('@playwright/test').Page,
  node: import('@playwright/test').Locator,
  deltaX: number,
  deltaY: number
): Promise<void> {
  const box = await node.boundingBox()
  if (!box) throw new Error('workflow node has no bounding box')
  const startX = box.x + box.width / 2
  const startY = box.y + box.height / 2
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX + deltaX, startY + deltaY, { steps: 5 })
  await page.mouse.up()
}
