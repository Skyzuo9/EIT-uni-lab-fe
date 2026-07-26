import {
  expect,
  test,
  type APIRequestContext,
  type Page
} from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

interface ApiCall {
  method: string
  status: number
  url: string
  body?: unknown
}

interface DebugSnapshot {
  label: string
  run: {
    id: string
    status: string
    debug?: {
      status?: string
      breakpoints?: string[]
      pausedBeforeNodeId?: string | null
    }
  }
  nodes: Array<{
    nodeId: string
    state: string
  }>
  events: Array<{
    seq: number
    type: string
    nodeId?: string | null
    payload: Record<string, unknown>
  }>
}

test('marked start continues through breakpoint 1 and breakpoint 2', async ({
  page,
  request
}) => {
  const evidence = observePage(page)
  const osUrl = osBaseUrl()
  await openWorkflow(page, osUrl)

  await expect(page.locator('.wf-flow-node--breakpoint')).toHaveCount(1)
  const joinNode = page.locator('.react-flow__node-wfNode').filter({
    hasText: '分支汇合'
  })
  await joinNode.dblclick()
  await expect(page.locator('.wf-flow-node--breakpoint')).toHaveCount(2)

  const runId = await startDebug(page)
  const debugStatus = page.locator('.workflow-runtime__debug-status strong')
  await expect(debugStatus).toHaveText('paused')
  await expect(page.getByText(/暂停于 measure 之前/)).toBeVisible()
  const start = await snapshot(request, osUrl, runId, 'marked-start')
  expectPausedBefore(start, 'measure')
  expect(nodeStates(start)).toMatchObject({
    measure: 'pending',
    branch: 'pending',
    join: 'pending'
  })

  await page.getByRole('button', { name: /继续/ }).click()
  await expect(page.getByText(/暂停于 branch 之前/)).toBeVisible()
  const breakpoint1 = await snapshot(
    request,
    osUrl,
    runId,
    'breakpoint-1'
  )
  expectPausedBefore(breakpoint1, 'branch')
  expect(nodeStates(breakpoint1)).toMatchObject({
    measure: 'success',
    branch: 'pending',
    dose: 'pending',
    join: 'pending'
  })

  await page.getByRole('button', { name: /继续/ }).click()
  await expect(page.getByText(/暂停于 join 之前/)).toBeVisible()
  const breakpoint2 = await snapshot(
    request,
    osUrl,
    runId,
    'breakpoint-2'
  )
  expectPausedBefore(breakpoint2, 'join')
  expect(nodeStates(breakpoint2)).toMatchObject({
    measure: 'success',
    branch: 'success',
    dose: 'success',
    inspect: 'skipped',
    join: 'pending',
    heat: 'pending'
  })

  const artifactDir = artifactDirectory()
  const screenshot = resolve(
    artifactDir,
    'workflow-debug-two-breakpoints.png'
  )
  await page.screenshot({ path: screenshot, fullPage: false })

  await page.getByRole('button', { name: /继续/ }).click()
  await expect(page.locator('.workflow-runtime__run-state')).toHaveText(
    'completed'
  )
  await expect(debugStatus).toHaveText('completed')
  const completed = await snapshot(request, osUrl, runId, 'completed')
  expect(nodeStates(completed)).toMatchObject({
    measure: 'success',
    branch: 'success',
    dose: 'success',
    inspect: 'skipped',
    join: 'success',
    heat: 'success'
  })
  expectPausedEventPositions(completed, ['measure', 'branch', 'join'])

  const commandNames = debugCommandNames(evidence.apiCalls)
  expect(commandNames).toEqual(['continue', 'continue', 'continue'])
  expect(evidence.browserErrors).toEqual([])
  writeEvidence('workflow-debug-two-breakpoints-result.json', {
    outcome: 'passed',
    scenario: 'marked-start -> breakpoint-1 -> breakpoint-2 -> completed',
    runId,
    screenshot,
    checkpoints: [start, breakpoint1, breakpoint2, completed],
    commandNames,
    apiCalls: evidence.apiCalls,
    browserErrors: evidence.browserErrors
  })
})

test('breakpoint 1 then steps exactly two logical nodes', async ({
  page,
  request
}) => {
  const evidence = observePage(page)
  const osUrl = osBaseUrl()
  await openWorkflow(page, osUrl)

  await expect(page.locator('.wf-flow-node--breakpoint')).toHaveCount(1)
  const runId = await startDebug(page)
  const debugStatus = page.locator('.workflow-runtime__debug-status strong')
  await expect(debugStatus).toHaveText('paused')
  await expect(page.getByText(/暂停于 measure 之前/)).toBeVisible()
  const start = await snapshot(request, osUrl, runId, 'marked-start')
  expectPausedBefore(start, 'measure')

  await page.getByRole('button', { name: /继续/ }).click()
  await expect(page.getByText(/暂停于 branch 之前/)).toBeVisible()
  const breakpoint1 = await snapshot(
    request,
    osUrl,
    runId,
    'breakpoint-1'
  )
  expectPausedBefore(breakpoint1, 'branch')

  await page.getByRole('button', { name: /单步/ }).click()
  await expect(page.getByText(/暂停于 dose 之前/)).toBeVisible()
  const afterStep1 = await snapshot(request, osUrl, runId, 'after-step-1')
  expectPausedBefore(afterStep1, 'dose')
  expect(nodeStates(afterStep1)).toMatchObject({
    measure: 'success',
    branch: 'success',
    dose: 'pending',
    inspect: 'skipped',
    join: 'pending',
    heat: 'pending'
  })

  await page.getByRole('button', { name: /单步/ }).click()
  await expect(page.getByText(/暂停于 join 之前/)).toBeVisible()
  const afterStep2 = await snapshot(request, osUrl, runId, 'after-step-2')
  expectPausedBefore(afterStep2, 'join')
  expect(nodeStates(afterStep2)).toMatchObject({
    measure: 'success',
    branch: 'success',
    dose: 'success',
    inspect: 'skipped',
    join: 'pending',
    heat: 'pending'
  })

  const artifactDir = artifactDirectory()
  const screenshot = resolve(
    artifactDir,
    'workflow-debug-step-twice.png'
  )
  await page.screenshot({ path: screenshot, fullPage: false })

  await page.getByRole('button', { name: /继续/ }).click()
  await expect(page.locator('.workflow-runtime__run-state')).toHaveText(
    'completed'
  )
  await expect(debugStatus).toHaveText('completed')
  const completed = await snapshot(request, osUrl, runId, 'completed')
  expectPausedEventPositions(
    completed,
    ['measure', 'branch', 'dose', 'join']
  )
  expect(
    completed.events.filter((event) => event.type === 'debug.stepping')
  ).toHaveLength(2)

  const commandNames = debugCommandNames(evidence.apiCalls)
  expect(commandNames).toEqual(['continue', 'step', 'step', 'continue'])
  expect(evidence.browserErrors).toEqual([])
  writeEvidence('workflow-debug-step-twice-result.json', {
    outcome: 'passed',
    scenario: 'marked-start -> breakpoint-1 -> step -> step -> completed',
    runId,
    screenshot,
    checkpoints: [
      start,
      breakpoint1,
      afterStep1,
      afterStep2,
      completed
    ],
    commandNames,
    apiCalls: evidence.apiCalls,
    browserErrors: evidence.browserErrors
  })
})

test('start, breakpoint and runtime colors stay synchronized in code and DAG', async ({
  page,
  request
}) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 1920, height: 1200 })
  const evidence = observePage(page)
  const osUrl = osBaseUrl()
  await openWorkflow(page, osUrl)

  const branchNode = page.locator('.react-flow__node-wfNode').filter({
    hasText: '质量是否合格'
  })
  await branchNode.getByRole('button', {
    name: '设为起始点 branch'
  }).click()
  const joinNode = page.locator('.react-flow__node-wfNode').filter({
    hasText: '分支汇合'
  })
  await joinNode.getByRole('button', {
    name: '设置断点 join'
  }).click()

  await expect(page.locator('.wf-flow-node--start')).toHaveCount(1)
  await expect(page.locator('.wf-flow-node--breakpoint')).toHaveCount(2)
  await expect(page.locator('.wf-flow-node--before-start')).toHaveCount(1)
  await expect(page.locator('.cm-workflow-marker--start')).toHaveCount(1)
  await expect(page.locator('.cm-workflow-marker--breakpoint')).toHaveCount(2)
  await expect(page.locator('.cm-workflow-marker--before-start')).toHaveCount(1)

  const pythonMode = page.getByRole('button', { name: 'Python', exact: true })
  await pythonMode.click()
  await expect(pythonMode).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.cm-workflow-marker--start')).toHaveCount(1)
  await expect(page.locator('.cm-workflow-marker--breakpoint')).toHaveCount(2)
  await expect(page.locator('.cm-workflow-marker--before-start')).toHaveCount(1)
  await expect(page.locator('.cm-content')).toContainText('# join: join')

  const runId = await startDebug(page)
  await expect(page.getByText(/暂停于 branch 之前/)).toBeVisible()
  const markedStart = await snapshot(
    request,
    osUrl,
    runId,
    'branch-start'
  )
  expectPausedBefore(markedStart, 'branch')
  expect(nodeStates(markedStart)).toMatchObject({
    measure: 'skipped',
    branch: 'pending',
    dose: 'pending',
    join: 'pending'
  })

  const createCall = evidence.apiCalls.find(
    (call) =>
      call.method === 'POST' &&
      call.url.endsWith('/api/v1/runtime/runs')
  )
  expect(createCall?.body).toMatchObject({
    debug: {
      pause_on_start: true,
      start_node_id: 'branch',
      breakpoints: ['branch', 'join']
    }
  })

  await page.getByRole('button', { name: /继续/ }).click()
  await expect(page.getByText(/暂停于 join 之前/)).toBeVisible()
  const breakpoint2 = await snapshot(
    request,
    osUrl,
    runId,
    'join-breakpoint'
  )
  expectPausedBefore(breakpoint2, 'join')
  expect(nodeStates(breakpoint2)).toMatchObject({
    measure: 'skipped',
    branch: 'success',
    dose: 'success',
    inspect: 'skipped',
    join: 'pending',
    heat: 'pending'
  })

  await expect(page.locator('.wf-flow-node--before-start')).toHaveCount(1)
  await expect(page.locator('.wf-flow-node--success')).toHaveCount(2)
  await expect(page.locator('.wf-flow-node--paused-before')).toHaveCount(1)
  await expect(page.locator('.cm-workflow-marker--success')).toHaveCount(2)
  await expect(page.locator('.cm-workflow-marker--paused')).toHaveCount(1)
  await expect(page.getByLabel('节点颜色图例')).toContainText(
    '橙色 · 正在运行'
  )

  const artifactDir = artifactDirectory()
  const fullScreenshot = resolve(
    artifactDir,
    'workflow-debug-markers-detail.png'
  )
  const dagScreenshot = resolve(
    artifactDir,
    'workflow-debug-dag-markers-detail.png'
  )
  const codeScreenshot = resolve(
    artifactDir,
    'workflow-debug-python-markers-detail.png'
  )
  await page.locator('.workflow-runtime').screenshot({
    path: fullScreenshot
  })
  await page.locator('.workflow-runtime__stage').screenshot({
    path: dagScreenshot
  })
  await page.locator('.cm-editor').screenshot({
    path: codeScreenshot
  })

  await page.getByRole('button', { name: /继续/ }).click()
  await expect(page.locator('.workflow-runtime__run-state')).toHaveText(
    'completed'
  )
  expect(evidence.browserErrors).toEqual([])
  writeEvidence('workflow-debug-markers-detail-result.json', {
    outcome: 'passed',
    scenario: 'marked branch start + synchronized Python/DAG markers',
    runId,
    screenshots: {
      full: fullScreenshot,
      dag: dagScreenshot,
      code: codeScreenshot
    },
    checkpoints: [markedStart, breakpoint2],
    apiCalls: evidence.apiCalls,
    browserErrors: evidence.browserErrors
  })
})

function observePage(page: Page): {
  apiCalls: ApiCall[]
  browserErrors: string[]
} {
  const apiCalls: ApiCall[] = []
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('pageerror', (error) => browserErrors.push(error.message))
  page.on('response', (response) => {
    if (!response.url().includes('/api/v1/')) return
    let body: unknown
    try {
      body = response.request().postDataJSON()
    } catch {
      body = undefined
    }
    apiCalls.push({
      method: response.request().method(),
      status: response.status(),
      url: response.url(),
      ...(body === undefined ? {} : { body })
    })
  })
  return { apiCalls, browserErrors }
}

async function openWorkflow(page: Page, osUrl: string): Promise<void> {
  await page.goto(`/?localOsUrl=${encodeURIComponent(osUrl)}`)
  await page.getByText('工作流', { exact: true }).first().click()
  await expect(page.getByText('完整控制流 DAG')).toBeVisible()
  await expect(page.locator('.react-flow__node-wfNode')).toHaveCount(6)
}

async function startDebug(page: Page): Promise<string> {
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().endsWith('/api/v1/runtime/runs')
  )
  await page.getByRole('button', { name: /调试启动/ }).click()
  const response = await responsePromise
  expect(response.status()).toBe(200)
  const payload = await response.json() as { id: string }
  expect(payload.id).toBeTruthy()
  return payload.id
}

async function snapshot(
  request: APIRequestContext,
  osUrl: string,
  runId: string,
  label: string
): Promise<DebugSnapshot> {
  const [runResponse, nodesResponse, eventsResponse] = await Promise.all([
    request.get(`${osUrl}/api/v1/runtime/runs/${runId}`),
    request.get(`${osUrl}/api/v1/runtime/runs/${runId}/nodes`),
    request.get(`${osUrl}/api/v1/runtime/runs/${runId}/events?after_seq=0`)
  ])
  expect(runResponse.ok()).toBe(true)
  expect(nodesResponse.ok()).toBe(true)
  expect(eventsResponse.ok()).toBe(true)
  const run = await runResponse.json() as DebugSnapshot['run']
  const nodesPayload = await nodesResponse.json() as {
    items: DebugSnapshot['nodes']
  }
  const eventsPayload = await eventsResponse.json() as {
    events: DebugSnapshot['events']
  }
  return {
    label,
    run,
    nodes: nodesPayload.items,
    events: eventsPayload.events
  }
}

function expectPausedBefore(
  snapshotValue: DebugSnapshot,
  nodeId: string
): void {
  expect(snapshotValue.run.debug?.status).toBe('paused')
  expect(snapshotValue.run.debug?.pausedBeforeNodeId).toBe(nodeId)
}

function nodeStates(
  snapshotValue: DebugSnapshot
): Record<string, string> {
  return Object.fromEntries(
    snapshotValue.nodes.map((node) => [node.nodeId, node.state])
  )
}

function expectPausedEventPositions(
  snapshotValue: DebugSnapshot,
  expectedPositions: string[]
): void {
  const positions = snapshotValue.events
    .filter((event) => event.type === 'debug.paused')
    .map((event) => event.payload.pausedBeforeNodeId)
    .filter((value): value is string => typeof value === 'string')
  expect(positions).toEqual(expect.arrayContaining(expectedPositions))
  const sequences = snapshotValue.events.map((event) => event.seq)
  expect(sequences).toEqual([...sequences].sort((left, right) => left - right))
  expect(new Set(sequences).size).toBe(sequences.length)
}

function debugCommandNames(apiCalls: ApiCall[]): string[] {
  return apiCalls
    .filter(
      (call) =>
        call.method === 'POST' &&
        call.status === 200 &&
        call.url.endsWith('/commands')
    )
    .map((call) => {
      const body = call.body as { command?: unknown } | undefined
      return String(body?.command || '')
    })
}

function osBaseUrl(): string {
  return process.env.UNILAB_OS_E2E_URL || 'http://127.0.0.1:8014'
}

function artifactDirectory(): string {
  const directory = resolve(process.cwd(), '../e2e-artifacts')
  mkdirSync(directory, { recursive: true })
  return directory
}

function writeEvidence(fileName: string, evidence: unknown): void {
  writeFileSync(
    resolve(artifactDirectory(), fileName),
    JSON.stringify(evidence, null, 2)
  )
}
