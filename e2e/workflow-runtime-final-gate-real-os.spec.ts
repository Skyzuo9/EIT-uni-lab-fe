import { expect, test, type Locator, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

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

test('production UI passes the retired-Run, idempotency and terminal-race gate', async ({
  page
}) => {
  test.setTimeout(180_000)
  const artifactDirectory = resolve(
    process.env.UNILAB_E2E_ARTIFACT_DIR ||
      resolve(process.cwd(), '../e2e-artifacts/ui1d-runtime-final-gate')
  )
  mkdirSync(artifactDirectory, { recursive: true })

  const browserErrors: string[] = []
  const pageErrors: string[] = []
  const websocketUrls: string[] = []
  const runtimeRequests: Array<{
    method: string
    path: string
    lastEventId: string
  }> = []
  const runtimeResponses: Array<{
    method: string
    path: string
    status: number
  }> = []
  const apiChecks: Array<Record<string, unknown>> = []
  const screenshots: string[] = []

  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('websocket', (socket) => websocketUrls.push(socket.url()))
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (!url.pathname.startsWith('/api/v1/')) return
    runtimeRequests.push({
      method: request.method(),
      path: `${url.pathname}${url.search}`,
      lastEventId: request.headers()['last-event-id'] || ''
    })
  })
  page.on('response', (response) => {
    const url = new URL(response.url())
    if (!url.pathname.startsWith('/api/v1/')) return
    runtimeResponses.push({
      method: response.request().method(),
      path: `${url.pathname}${url.search}`,
      status: response.status()
    })
  })

  await installWorkflowPanel(page, os.runtimeWorkflowUuid)
  await page.goto(
    `/?section=workflow&localOsUrl=${encodeURIComponent(os.url)}`
  )
  let panel = page.locator('[data-panel-instance-id="runtime-workflow"]')
  await prepareAppliedWorkflow(panel, page)
  await capture(page, artifactDirectory, screenshots,
    '01-applied-original-workbench.png')

  const raceTask = await postJson(
    `${os.upstreamUrl}/api/v1/workflow-tasks`,
    {
      workflow_uuid: os.runtimeWorkflowUuid,
      run_mode: 'normal',
      input: {},
      meta_data: { source: 'ui1d-terminal-race' }
    }
  )
  expect(raceTask.status).toBe(201)
  const raceTaskUuid = dataRecord(raceTask.payload).uuid as string
  expect(raceTaskUuid).toBeTruthy()

  const realtimeMetadata = panel.locator('.is-meta').filter({
    hasText: '实时同步'
  })
  await os.stopProcess()
  await expect(realtimeMetadata).toContainText('正在重连', {
    timeout: 15_000
  })
  await capture(page, artifactDirectory, screenshots,
    '02-terminal-race-sse-disconnected.png')

  const raceCommand = await os.createTerminalCommandRace(
    raceTaskUuid,
    'ui1d-terminal-race'
  )
  expect(raceCommand).toMatchObject({
    status: 'rejected',
    result: {
      outcome: 'rejected',
      error_code: 'invalid_transition'
    }
  })
  await os.restart()
  await expect(realtimeMetadata).toContainText('已连接', {
    timeout: 20_000
  })
  await expect(panel.locator('[data-run-status="canceled"]')).toBeVisible()
  await capture(page, artifactDirectory, screenshots,
    '03-terminal-race-restored.png')
  apiChecks.push({
    name: 'terminal-race',
    taskUuid: raceTaskUuid,
    command: raceCommand
  })

  // An OS restart can rematerialize the persisted source as a fresh Candidate.
  // Re-apply that server-owned Candidate before creating the next Task; the
  // production UI must remain fail-closed while Authoring is not Applied.
  const startButton = panel.getByRole('button', {
    name: '开始运行',
    exact: true
  })
  if (await startButton.isDisabled()) {
    await prepareAppliedWorkflow(panel, page)
  }

  await panel.getByRole('button', {
    name: '单步模式',
    exact: true
  }).click()
  const createResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return response.request().method() === 'POST' &&
      url.pathname === '/api/v1/workflow-tasks'
  })
  await startButton.click()
  const createResponse = await createResponsePromise
  expect(createResponse.status()).toBe(201)
  expect(createResponse.request().postDataJSON()).toMatchObject({
    workflow_uuid: os.runtimeWorkflowUuid,
    run_mode: 'step'
  })
  const createdEnvelope = await createResponse.json() as {
    data: { uuid: string }
  }
  const taskUuid = createdEnvelope.data.uuid
  await expect(panel.locator('[data-run-status="pending"]')).toBeVisible()
  await expect(panel.locator('[data-node-state="pending"]')).toHaveCount(2)
  await capture(page, artifactDirectory, screenshots,
    '04-step-task-and-jobs.png')

  const stepCommand = await submitUiCommand(panel, page, 'step')
  let replay = await postCommand(os.upstreamUrl, taskUuid, stepCommand.body)
  await expect.poll(async () => {
    replay = await postCommand(os.upstreamUrl, taskUuid, stepCommand.body)
    return dataRecord(replay.payload).status
  }, { timeout: 15_000 }).toBe('succeeded')
  expect(replay.status).toBe(201)
  expect(dataRecord(replay.payload).uuid).toBe(
    dataRecord(stepCommand.payload).uuid
  )

  const conflict = await postCommand(os.upstreamUrl, taskUuid, {
    ...stepCommand.body,
    type: 'pause'
  })
  expect(conflict.status).toBe(409)
  apiChecks.push({
    name: 'command-replay-and-conflict',
    accepted: stepCommand.payload,
    replay: replay.payload,
    conflictStatus: conflict.status
  })
  await expect(panel.locator('.is-meta').filter({
    hasText: '单步 · OS 已接受'
  })).toBeVisible()
  await capture(page, artifactDirectory, screenshots,
    '05-step-replay-and-conflict.png')

  await submitUiCommand(panel, page, 'resume')
  await expect(panel.getByText('控制可用', { exact: true })).toBeVisible()
  await capture(page, artifactDirectory, screenshots,
    '06-resume-accepted-and-applied.png')

  await submitUiCommand(panel, page, 'pause')
  await expect(panel.getByText('已暂停', { exact: true })).toBeVisible()
  await capture(page, artifactDirectory, screenshots,
    '07-pause-accepted-and-applied.png')

  await submitUiCommand(panel, page, 'cancel')
  await expect(panel.locator('[data-run-status="canceled"]')).toBeVisible()
  await expect(panel.locator('[data-node-state="canceled"]')).toHaveCount(2)
  await capture(page, artifactDirectory, screenshots,
    '08-cancel-terminal-state.png')

  await page.reload()
  panel = page.locator('[data-panel-instance-id="runtime-workflow"]')
  await expect(panel.locator('[data-run-status="canceled"]')).toBeVisible()
  await expect(panel.locator('[data-node-state="canceled"]')).toHaveCount(2)
  await capture(page, artifactDirectory, screenshots,
    '09-reload-restores-latest-task.png')

  const forbiddenRequests = runtimeRequests.filter(({ path }) =>
    path.startsWith('/api/v1/runtime/runs') ||
    path.startsWith('/api/v1/runtime/events') ||
    /\/api\/v1\/workflow-tasks\/[^/]+\/events/.test(path)
  )
  const expectedNetworkDiagnostics = browserErrors.filter((message) =>
    message.startsWith('Failed to load resource:') ||
    message.includes('ERR_INCOMPLETE_CHUNKED_ENCODING')
  )
  const applicationErrors = browserErrors.filter((message) =>
    !expectedNetworkDiagnostics.includes(message)
  )
  const pins = {
    fe: execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8'
    }).trim(),
    os: execFileSync(
      'git',
      ['-C', resolve(
        process.env.UNILAB_AUTHORING_OS_ROOT ||
          '/home/changjunhan/Uni-Lab-Core/.worktrees/uni-lab-os-runtime-integration'
      ), 'rev-parse', 'HEAD'],
      { encoding: 'utf8' }
    ).trim(),
    coreBaseline: '9a7467cd4d91a008bdd4b8f754d73fafbb3cacc8'
  }

  writeFileSync(
    join(artifactDirectory, 'network-ledger.json'),
    `${JSON.stringify({
      pins,
      runtimeRequests,
      runtimeResponses,
      websocketUrls,
      forbiddenRequests,
      apiChecks,
      expectedNetworkDiagnostics,
      applicationErrors,
      pageErrors,
      screenshots
    }, null, 2)}\n`,
    'utf8'
  )

  expect(forbiddenRequests).toEqual([])
  expect(websocketUrls).toEqual([])
  expect(applicationErrors).toEqual([])
  expect(pageErrors).toEqual([])
  expect(screenshots).toHaveLength(9)
})

async function submitUiCommand(
  panel: Locator,
  page: Page,
  command: 'step' | 'pause' | 'resume' | 'cancel'
): Promise<{
  body: Record<string, unknown>
  payload: unknown
}> {
  const responsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return response.request().method() === 'POST' &&
      url.pathname.endsWith('/commands')
  })
  await panel.locator(`[data-runtime-command="${command}"]`).click()
  const response = await responsePromise
  expect(response.status()).toBe(201)
  return {
    body: response.request().postDataJSON() as Record<string, unknown>,
    payload: await response.json()
  }
}

async function postCommand(
  baseUrl: string,
  taskUuid: string,
  body: Record<string, unknown>
): Promise<{ status: number; payload: unknown }> {
  return postJson(
    `${baseUrl}/api/v1/workflow-tasks/${taskUuid}/commands`,
    body
  )
}

async function postJson(
  url: string,
  body: Record<string, unknown>
): Promise<{ status: number; payload: unknown }> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  return { status: response.status, payload: await response.json() }
}

function dataRecord(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object') return {}
  const data = (payload as { data?: unknown }).data
  return data && typeof data === 'object'
    ? data as Record<string, unknown>
    : {}
}

async function capture(
  page: Page,
  artifactDirectory: string,
  screenshots: string[],
  name: string
): Promise<void> {
  const path = join(artifactDirectory, name)
  await page.screenshot({ path, fullPage: true, animations: 'disabled' })
  screenshots.push(path)
}

async function prepareAppliedWorkflow(
  panel: Locator,
  page: Page
): Promise<void> {
  await expect(panel.getByText('完整控制流 DAG')).toBeVisible()
  await panel.getByRole('button', {
    name: '画布模式',
    exact: true
  }).click()
  await panel.getByRole('button', {
    name: '保存草稿',
    exact: true
  }).click()
  const normalizedDiff = page.getByRole('dialog', {
    name: '完整 Python 差异'
  })
  await expect(normalizedDiff).toBeVisible()
  await normalizedDiff.getByRole('button', {
    name: '接受完整差异并保存',
    exact: true
  }).click()
  await panel.getByRole('button', {
    name: '应用工作流',
    exact: true
  }).click()
  await expect(panel.getByText(/(?:工作流|源码)已应用/)).toBeVisible()
  await expect(panel.getByRole('button', {
    name: '开始运行',
    exact: true
  })).toBeEnabled()
}

async function installWorkflowPanel(
  page: Page,
  workflowUuid: string
): Promise<void> {
  await page.addInitScript((configuredWorkflowUuid) => {
    localStorage.setItem(
      'unilab.panel-layout.workflow.v1',
      JSON.stringify({
        version: 1,
        layout: {
          id: 'runtime-root',
          type: 'group',
          panels: [{
            id: 'runtime-workflow',
            panelType: 'workflow-dag',
            title: 'Workflow Runtime',
            config: { workflow_uuid: configuredWorkflowUuid }
          }],
          activePanelId: 'runtime-workflow'
        }
      })
    )
  }, workflowUuid)
}
