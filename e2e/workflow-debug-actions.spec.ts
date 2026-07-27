import {
  expect,
  test,
  type APIRequestContext,
  type Page
} from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  startOfflineLocalBridge,
  type OfflineLocalBridge
} from './helpers/offline-local-bridge'

interface CommandCall {
  command: string
  status: number
}

interface RuntimeSnapshot {
  run: {
    id: string
    status: string
    debug?: {
      status?: string
      pausedBeforeNodeId?: string | null
      stopReason?: string | null
    }
  }
  nodes: Array<{ nodeId: string; state: string }>
  events: Array<{
    seq: number
    type: string
    nodeId?: string | null
    payload: Record<string, unknown>
  }>
}

test.describe.serial('seven workflow debugger actions', () => {
  let bridge: OfflineLocalBridge

  test.beforeAll(async () => {
    bridge = await startOfflineLocalBridge(1.5)
  })

  test.afterAll(async () => {
    await bridge.stop()
  })

  test('pause drains the running node and continue resumes from the next admission', async ({
    page,
    request
  }) => {
    const observation = observeCommands(page)
    await openWorkflow(page, bridge.url)
    await clearDefaultBreakpoint(page)
    const runId = await startDebug(page)
    await expectPausedBefore(page, 'measure')

    await page.getByRole('button', { name: '继续', exact: true }).click()
    await expect(nodeRow(page, 'measure')).toContainText('running')
    await expect(
      page.getByRole('button', { name: '暂停', exact: true })
    ).toBeEnabled()
    await page.getByRole('button', { name: '暂停', exact: true }).click()

    await expect(page.locator('.workflow-runtime__debug-status strong'))
      .toHaveText(/pause_pending|paused/)
    await expectPausedBefore(page, 'branch')
    const paused = await snapshot(request, bridge.url, runId)
    expect(states(paused)).toMatchObject({
      measure: 'success',
      branch: 'pending'
    })
    expect(
      paused.events.some((event) => event.type === 'debug.pause_pending')
    ).toBe(true)
    await saveEvidence(page, 'pause-checkpoint', {
      runId,
      paused,
      commands: observation.commands
    })

    await page.getByRole('button', { name: '继续', exact: true }).click()
    await expect(page.locator('.workflow-runtime__run-state'))
      .toHaveText('completed', { timeout: 15_000 })
    expect(observation.commands).toEqual([
      { command: 'continue', status: 200 },
      { command: 'pause', status: 200 },
      { command: 'continue', status: 200 }
    ])
    expect(observation.browserErrors).toEqual([])
    await saveEvidence(page, 'pause-continue', {
      runId,
      paused,
      commands: observation.commands
    })
  })

  test('step, step over and step into each admit exactly one logical node', async ({
    page,
    request
  }) => {
    const observation = observeCommands(page)
    await openWorkflow(page, bridge.url)
    const runId = await startDebug(page)
    await expectPausedBefore(page, 'measure')

    await clickAndExpectPause(page, '单步', 'branch')
    expect(await currentStates(request, bridge.url, runId)).toMatchObject({
      measure: 'success',
      branch: 'pending'
    })

    await clickAndExpectPause(page, '步过', 'dose')
    expect(await currentStates(request, bridge.url, runId)).toMatchObject({
      branch: 'success',
      dose: 'pending',
      inspect: 'skipped'
    })

    await clickAndExpectPause(page, '步入', 'join')
    const afterStepInto = await snapshot(request, bridge.url, runId)
    expect(states(afterStepInto)).toMatchObject({
      dose: 'success',
      join: 'pending'
    })
    expect(
      afterStepInto.events.filter((event) => event.type === 'debug.stepping')
    ).toHaveLength(3)
    await saveEvidence(page, 'step-variants-paused', {
      runId,
      afterStepInto,
      commands: observation.commands
    })

    await page.getByRole('button', { name: '继续', exact: true }).click()
    await expect(page.locator('.workflow-runtime__run-state'))
      .toHaveText('completed', { timeout: 10_000 })
    expect(observation.commands.map((call) => call.command)).toEqual([
      'step',
      'step_over',
      'step_into',
      'continue'
    ])
    expect(observation.browserErrors).toEqual([])
    await saveEvidence(page, 'step-variants', {
      runId,
      afterStepInto,
      commands: observation.commands
    })
  })

  test('terminate cancels a paused run and records its explicit reason', async ({
    page,
    request
  }) => {
    const observation = observeCommands(page)
    await openWorkflow(page, bridge.url)
    const runId = await startDebug(page)
    await expectPausedBefore(page, 'measure')

    await page.getByRole('button', { name: '终止', exact: true }).click()
    await expect(page.locator('.workflow-runtime__run-state'))
      .toHaveText('cancelled')
    const stopped = await snapshot(request, bridge.url, runId)
    expect(stopped.run.debug?.stopReason).toBe('terminate')
    expect(states(stopped)).toEqual({
      measure: 'cancelled',
      branch: 'cancelled',
      dose: 'cancelled',
      inspect: 'cancelled',
      join: 'cancelled',
      heat: 'cancelled'
    })
    expect(
      stopped.events.some(
        (event) => event.type === 'debug.terminate_requested'
      )
    ).toBe(true)
    await expectAllActionsDisabled(page)
    expect(observation.commands).toEqual([
      { command: 'terminate', status: 200 }
    ])
    expect(observation.browserErrors).toEqual([])
    await saveEvidence(page, 'terminate', {
      runId,
      stopped,
      commands: observation.commands
    })
  })

  test('emergency stop interrupts running work through the run-scoped cleanup path', async ({
    page,
    request
  }) => {
    const observation = observeCommands(page)
    await openWorkflow(page, bridge.url)
    await clearDefaultBreakpoint(page)
    const runId = await startDebug(page)
    await expectPausedBefore(page, 'measure')

    await page.getByRole('button', { name: '继续', exact: true }).click()
    await expect(nodeRow(page, 'measure')).toContainText('running')
    const emergency = page.getByRole('button', {
      name: '急停',
      exact: true
    })
    await expect(emergency).toHaveAttribute(
      'title',
      /当前 run.*非全站硬件急停/
    )
    await emergency.click()

    await expect(page.locator('.workflow-runtime__run-state'))
      .toHaveText('cancelled')
    const stopped = await snapshot(request, bridge.url, runId)
    expect(stopped.run.debug?.stopReason).toBe('emergency_stop')
    expect(states(stopped).measure).toBe('cancelled')
    expect(
      stopped.events.some(
        (event) => event.type === 'debug.emergency_stop_requested'
      )
    ).toBe(true)
    expect(
      stopped.events.some(
        (event) =>
          event.type === 'debug.cancelled' &&
          event.payload.stopReason === 'emergency_stop'
      )
    ).toBe(true)
    await expectAllActionsDisabled(page)
    expect(observation.commands.map((call) => call.command)).toEqual([
      'continue',
      'emergency_stop'
    ])
    expect(observation.browserErrors).toEqual([])
    await saveEvidence(page, 'emergency-stop', {
      runId,
      stopped,
      commands: observation.commands
    })
  })
})

async function openWorkflow(page: Page, osUrl: string): Promise<void> {
  await page.goto(`/?localOsUrl=${encodeURIComponent(osUrl)}`)
  await page.getByText('工作流', { exact: true }).first().click()
  await expect(page.getByText('完整控制流 DAG')).toBeVisible()
  await expect(page.locator('.react-flow__node-wfNode')).toHaveCount(6)
}

async function clearDefaultBreakpoint(page: Page): Promise<void> {
  await page.locator('button[aria-label="取消断点 branch"]').click()
  await expect(page.locator('.wf-flow-node--breakpoint')).toHaveCount(0)
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
  return payload.id
}

async function expectPausedBefore(page: Page, nodeId: string): Promise<void> {
  await expect(page.locator('.workflow-runtime__debug-status strong'))
    .toHaveText('paused', { timeout: 10_000 })
  await expect(page.getByText(`暂停于 ${nodeId} 之前`)).toBeVisible()
}

async function clickAndExpectPause(
  page: Page,
  label: string,
  nodeId: string
): Promise<void> {
  await page.getByRole('button', { name: label, exact: true }).click()
  await expectPausedBefore(page, nodeId)
}

function nodeRow(page: Page, nodeId: string) {
  return page.locator('.workflow-runtime__node-list button', {
    hasText: nodeId
  })
}

async function snapshot(
  request: APIRequestContext,
  osUrl: string,
  runId: string
): Promise<RuntimeSnapshot> {
  const [runResponse, nodesResponse, eventsResponse] = await Promise.all([
    request.get(`${osUrl}/api/v1/runtime/runs/${runId}`),
    request.get(`${osUrl}/api/v1/runtime/runs/${runId}/nodes`),
    request.get(`${osUrl}/api/v1/runtime/runs/${runId}/events?after_seq=0`)
  ])
  expect(runResponse.ok()).toBe(true)
  expect(nodesResponse.ok()).toBe(true)
  expect(eventsResponse.ok()).toBe(true)
  const nodes = await nodesResponse.json() as {
    items: RuntimeSnapshot['nodes']
  }
  const events = await eventsResponse.json() as {
    events: RuntimeSnapshot['events']
  }
  return {
    run: await runResponse.json() as RuntimeSnapshot['run'],
    nodes: nodes.items,
    events: events.events
  }
}

function states(value: RuntimeSnapshot): Record<string, string> {
  return Object.fromEntries(
    value.nodes.map((node) => [node.nodeId, node.state])
  )
}

async function currentStates(
  request: APIRequestContext,
  osUrl: string,
  runId: string
): Promise<Record<string, string>> {
  return states(await snapshot(request, osUrl, runId))
}

function observeCommands(page: Page): {
  commands: CommandCall[]
  browserErrors: string[]
} {
  const commands: CommandCall[] = []
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('pageerror', (error) => browserErrors.push(error.message))
  page.on('response', (response) => {
    if (
      response.request().method() !== 'POST' ||
      !response.url().endsWith('/commands')
    ) return
    const body = response.request().postDataJSON() as {
      command?: unknown
    }
    commands.push({
      command: String(body.command || ''),
      status: response.status()
    })
  })
  return { commands, browserErrors }
}

async function expectAllActionsDisabled(page: Page): Promise<void> {
  for (const label of [
    '暂停',
    '单步',
    '步过',
    '步入',
    '继续',
    '终止',
    '急停'
  ]) {
    await expect(page.getByRole('button', { name: label, exact: true }))
      .toBeDisabled()
  }
}

async function saveEvidence(
  page: Page,
  name: string,
  value: unknown
): Promise<void> {
  const directory = resolve(process.cwd(), '../e2e-artifacts')
  mkdirSync(directory, { recursive: true })
  const screenshot = resolve(directory, `workflow-debug-${name}.png`)
  await page.locator('.workflow-runtime__stage').screenshot({
    path: screenshot
  })
  writeFileSync(
    resolve(directory, `workflow-debug-${name}.json`),
    JSON.stringify({ screenshot, ...value as object }, null, 2)
  )
}
