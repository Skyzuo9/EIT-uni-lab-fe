import { expect, test } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'

import {
  startPersistentAuthoringOs,
  type MaterialAuthorityRaceState,
  type PersistentAuthoringOs
} from './helpers/persistent-authoring-os'
import {
  allNodeInputBindings,
  chooseExplicitValue,
  clickNodeOutsideMiniMap,
  compareUuid,
  countRequests,
  dragNode,
  ensureAppliedWorkflow as ensureAppliedWorkflowWithOs,
  graphAuthoringSemantics,
  lastRequest,
  nodeInputBindings,
  pickFields,
  readAuthoringEvent,
  readWorkflowEnvelope,
  requireHandleUuid,
  workflowIo,
  workflowTaskCount as workflowTaskCountWithOs,
  type AuthoringAggregate,
  type AuthoringTransform
} from './helpers/workflow-authoring-assertions'
import {
  applyWorkflowCandidateWithoutTask,
  saveWorkflowDraftOnly
} from './helpers/workflow-runtime-ui'

let os: PersistentAuthoringOs

const PREPARE_NODE_UUID = '20000000-0000-4000-8000-000000000001'
const ANALYZE_NODE_UUID = '20000000-0000-4000-8000-000000000002'

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  os = await startPersistentAuthoringOs()
})

test.afterAll(async () => {
  await os?.stop()
})

/**
 * 读取当前真实操作系统（OS）的统一响应封装。
 *
 * @param url HTTP 资源地址。
 * @param init 可选请求参数。
 * @returns 响应中的权威 data。
 */
async function readEnvelope<Value>(
  url: string,
  init?: RequestInit
): Promise<Value> {
  return readWorkflowEnvelope<Value>(os, url, init)
}
/**
 * 统计当前真实操作系统（OS）中指定工作流（Workflow）的任务数量。
 *
 * @param workflowUuid 工作流稳定 UUID。
 * @returns 工作流任务（WorkflowTask）总数。
 */
async function workflowTaskCount(workflowUuid: string): Promise<number> {
  return workflowTaskCountWithOs(os, workflowUuid)
}

/**
 * 确保指定工作流（Workflow）拥有已应用工作流图（Applied Workflow Graph）。
 *
 * @param workflowUuid 工作流稳定 UUID。
 * @returns 已应用后的创作权威聚合。
 */
async function ensureAppliedWorkflow(
  workflowUuid: string
): Promise<AuthoringAggregate> {
  return ensureAppliedWorkflowWithOs(os, workflowUuid)
}

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

test('real production OS emits SSE for an external Draft edit', async () => {
  const before = await readEnvelope<AuthoringAggregate>(
    `${os.url}/api/v1/workflows/${os.workflowUuid}/authoring`
  )
  expect(before.draft).not.toBeNull()
  const streamResponse = await fetch(`${os.url}/api/v1/events`, {
    headers: {
      Accept: 'text/event-stream',
      'Last-Event-ID': '0'
    }
  })
  expect(streamResponse.ok).toBe(true)
  const externallyChangedEvent = readAuthoringEvent(
    streamResponse,
    os.workflowUuid,
    'external_draft_changed',
    (event) => event.data.draft_hash !== before.draft?.draft_hash
  )
  const source = readFileSync(os.sourcePath, 'utf8')
  writeFileSync(os.sourcePath, `${source}\n# external SSE regression\n`, 'utf8')

  const event = await externallyChangedEvent
  expect(event).toMatchObject({
    event: 'workflow.authoring.changed',
    data: {
      workflow_uuid: os.workflowUuid,
      cause: 'external_draft_changed'
    }
  })
  const synchronized = await readEnvelope<AuthoringAggregate>(
    `${os.url}/api/v1/workflows/${os.workflowUuid}/authoring`
  )
  expect(synchronized.draft?.draft_hash).toBe(event.data.draft_hash)
  expect(synchronized.draft?.python_source).toContain(
    '# external SSE regression'
  )
})

test('real production OS regenerates its persisted Candidate graph', async () => {
  const aggregate = await readEnvelope<AuthoringAggregate>(
    `${os.url}/api/v1/workflows/${os.workflowUuid}/authoring`
  )
  expect(aggregate.draft).not.toBeNull()
  expect(aggregate.candidate).not.toBeNull()
  if (!aggregate.draft || !aggregate.candidate) {
    throw new Error('production fixture did not materialize Authoring')
  }

  const generated = await readEnvelope<{
    graph: Record<string, unknown>
    normalized_python_source: string
  }>(`${os.url}/api/v1/authoring/generate-python`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      workflow_uuid: os.workflowUuid,
      revision: aggregate.workflow_revision,
      source_uri: aggregate.draft.source_uri,
      graph: aggregate.candidate.graph
    })
  })

  expect(generated.graph).toEqual(aggregate.candidate.graph)
  expect(generated.normalized_python_source.length).toBeGreaterThan(0)
})

test('Applied scalar Task form preserves explicit falsy/null and leaves OS default omitted', async ({
  page
}) => {
  test.setTimeout(120_000)
  const browserErrors: string[] = []
  const applicationErrors: string[] = []
  const webSockets: string[] = []
  const requests: Array<{ method: string; path: string }> = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('pageerror', (error) => browserErrors.push(error.message))
  page.on('websocket', (webSocket) => webSockets.push(webSocket.url()))
  page.on('request', (request) => {
    requests.push({
      method: request.method(),
      path: new URL(request.url()).pathname
    })
  })
  page.on('response', (response) => {
    if (
      response.url().startsWith(`${os.url}/api/v1/`) &&
      response.status() >= 400
    ) {
      applicationErrors.push(
        `${response.request().method()} ${new URL(response.url()).pathname} ` +
        `${response.status()}`
      )
    }
  })

  const applied = await ensureAppliedWorkflow(os.scalarInputWorkflowUuid)
  const storageKey = `unilab.workflow.active.${
    encodeURIComponent(`local-python:${os.url}`)
  }.v1`
  await page.addInitScript(({ key, workflowUuid }) => {
    localStorage.setItem(
      key,
      JSON.stringify({ version: 1, workflowId: workflowUuid })
    )
  }, { key: storageKey, workflowUuid: os.scalarInputWorkflowUuid })

  await page.goto(
    `/?section=workflow&localOsUrl=${encodeURIComponent(os.url)}`
  )
  await expect(page.getByText('完整控制流 DAG')).toBeVisible()
  const start = page.getByRole('button', { name: '开始运行', exact: true })
  await expect(start).toBeEnabled()
  await start.click()

  const form = page.getByRole('region', {
    name: '工作流运行输入表单'
  })
  await expect(form).toBeVisible()
  await expect(form).toContainText(
    `使用已应用版本 ${applied.workflow_revision}`
  )
  await expect(form.locator(
    '[data-workflow-task-input-name="attempts"]'
  )).toContainText(/默认值[^0-9]*3/i)

  await chooseExplicitValue(form, 'label')
  await form.getByRole('textbox', { name: 'label 明确值' }).fill('')

  await chooseExplicitValue(form, 'count')
  await form.getByRole('spinbutton', { name: 'count 明确值' }).fill('0')

  await chooseExplicitValue(form, 'enabled')
  await form.getByRole('combobox', { name: 'enabled 明确值' })
    .selectOption('false')

  await chooseExplicitValue(form, 'tags')
  const tags = form.getByRole('textbox', { name: 'tags 明确值 JSON' })
  await tags.fill('[]')
  await tags.press('Tab')

  await chooseExplicitValue(form, 'config')
  const config = form.getByRole('textbox', { name: 'config 明确值 JSON' })
  await config.fill('{}')
  await config.press('Tab')

  await form.getByRole('combobox', { name: 'note 输入状态' })
    .selectOption('explicit_null')
  await expect(form.getByRole('combobox', { name: 'attempts 输入状态' }))
    .toHaveValue('untouched')

  const createdResponse = page.waitForResponse((response) =>
    response.request().method() === 'POST' &&
    new URL(response.url()).pathname === '/api/v1/workflow-tasks'
  )
  await form.getByRole('button', {
    name: '使用以上参数运行',
    exact: true
  }).click()
  const created = await createdResponse
  expect(created.status()).toBe(201)

  const requestBody = created.request().postDataJSON() as Record<
    string,
    unknown
  >
  expect(requestBody).toEqual({
    workflow_uuid: os.scalarInputWorkflowUuid,
    run_mode: 'normal',
    input: {
      label: '',
      count: 0,
      enabled: false,
      tags: [],
      config: {},
      note: null
    }
  })
  expect(requestBody.input).not.toHaveProperty('attempts')
  for (const forbiddenKey of [
    'target_node_uuid',
    'start_node_id',
    'breakpoints',
    'workflow_revision',
    'expected_workflow_revision'
  ]) expect(requestBody).not.toHaveProperty(forbiddenKey)

  const responseEnvelope = await created.json() as {
    code: number
    data: {
      input: Record<string, unknown>
      workflow_snapshot: {
        workflow: { revision: number }
      }
    }
  }
  expect(responseEnvelope.code).toBe(0)
  expect(responseEnvelope.data.input).toEqual({
    label: '',
    count: 0,
    enabled: false,
    tags: [],
    config: {},
    note: null,
    attempts: 3
  })
  expect(responseEnvelope.data.workflow_snapshot.workflow.revision)
    .toBe(applied.workflow_revision)

  const forbiddenRequests = requests.filter(({ path }) =>
    path === '/api/run' ||
    path.startsWith('/api/runtime/local/') ||
    path.startsWith('/api/v1/runtime/runs') ||
    path.startsWith('/ws/workflow/')
  )
  expect(forbiddenRequests).toEqual([])
  expect(webSockets.filter((url) =>
    new URL(url).pathname !== '/api/v1/ws/device_status'
  )).toEqual([])
  expect(applicationErrors).toEqual([])
  expect(browserErrors).toEqual([])
})

test('Applied ResourceSlot Task form selects a real Material and OS freezes its canonical identity', async ({
  page
}) => {
  test.setTimeout(120_000)
  const browserErrors: string[] = []
  const applicationErrors: string[] = []
  const webSockets: string[] = []
  const requests: Array<{ method: string; path: string }> = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('pageerror', (error) => browserErrors.push(error.message))
  page.on('websocket', (webSocket) => webSockets.push(webSocket.url()))
  page.on('request', (request) => {
    requests.push({
      method: request.method(),
      path: new URL(request.url()).pathname
    })
  })
  page.on('response', (response) => {
    if (
      response.url().startsWith(`${os.url}/api/v1/`) &&
      response.status() >= 400
    ) {
      applicationErrors.push(
        `${response.request().method()} ${new URL(response.url()).pathname} ` +
        `${response.status()}`
      )
    }
  })

  const applied = await ensureAppliedWorkflow(
    os.resourceSlotInputWorkflowUuid
  )
  const materialGraph = await readEnvelope<{
    nodes: Array<{
      material: {
        uuid: string
        resource_template_uuid: string
        name: string
      }
    }>
  }>(`${os.url}/api/v1/materials/graph`)
  const fixtureMaterial = materialGraph.nodes.find(({ material }) =>
    material.uuid === os.resourceSlotMaterialUuid
  )?.material
  expect(fixtureMaterial).toEqual({
    uuid: os.resourceSlotMaterialUuid,
    resource_template_uuid: '31000000-0000-4000-8000-000000000001',
    name: 'I1 ResourceSlot sample',
    barcode: 'I1-RESOURCE-SLOT-005',
    class: 'lab.resources:plate_96',
    config: {},
    create_time: expect.any(String),
    data: {},
    meta_data: {},
    update_time: expect.any(String)
  })

  const storageKey = `unilab.workflow.active.${
    encodeURIComponent(`local-python:${os.url}`)
  }.v1`
  await page.addInitScript(({ key, workflowUuid }) => {
    localStorage.setItem(
      key,
      JSON.stringify({ version: 1, workflowId: workflowUuid })
    )
  }, { key: storageKey, workflowUuid: os.resourceSlotInputWorkflowUuid })

  await page.goto(
    `/?section=workflow&localOsUrl=${encodeURIComponent(os.url)}`
  )
  await expect(page.getByText('完整控制流 DAG')).toBeVisible()
  await page.getByRole('button', { name: '开始运行', exact: true }).click()

  const form = page.getByRole('region', {
    name: '工作流运行输入表单'
  })
  await expect(form).toBeVisible()
  await expect(form).toContainText(
    `使用已应用版本 ${applied.workflow_revision}`
  )
  const inputState = form.getByRole('combobox', {
    name: 'sample 输入状态'
  })
  await expect(inputState).toBeEnabled({ timeout: 10_000 })
  await inputState.selectOption('value')
  const materialSelector = form.getByRole('combobox', {
    name: 'sample 资源位'
  })
  await expect(materialSelector).toContainText('I1 ResourceSlot sample')
  await materialSelector.selectOption(os.resourceSlotMaterialUuid)

  const createdResponse = page.waitForResponse((response) =>
    response.request().method() === 'POST' &&
    new URL(response.url()).pathname === '/api/v1/workflow-tasks'
  )
  await form.getByRole('button', {
    name: '使用以上参数运行',
    exact: true
  }).click()
  const created = await createdResponse
  expect(created.status()).toBe(201)
  expect(created.request().postDataJSON()).toEqual({
    workflow_uuid: os.resourceSlotInputWorkflowUuid,
    run_mode: 'normal',
    input: {
      sample: { uuid: os.resourceSlotMaterialUuid }
    }
  })

  const responseEnvelope = await created.json() as {
    code: number
    data: {
      input: Record<string, unknown>
      workflow_snapshot: {
        workflow: {
          revision: number
          meta_data: {
            unilab: { input_contract: Record<string, unknown> }
          }
        }
      }
    }
  }
  expect(responseEnvelope.code).toBe(0)
  expect(responseEnvelope.data.input).toEqual({
    sample: {
      uuid: os.resourceSlotMaterialUuid,
      resource_template_uuid: fixtureMaterial?.resource_template_uuid
    }
  })
  expect(responseEnvelope.data.workflow_snapshot.workflow.revision)
    .toBe(applied.workflow_revision)
  expect(responseEnvelope.data.workflow_snapshot.workflow.meta_data.unilab)
    .toMatchObject({
      input_contract: {
        version: 1,
        parameters: [{
          name: 'sample',
          schema: { $slot: 'ResourceSlot' },
          required: true
        }]
      }
    })

  expect(requests).toContainEqual({
    method: 'GET',
    path: '/api/v1/materials/graph'
  })
  expect(webSockets.filter((url) =>
    new URL(url).pathname !== '/api/v1/ws/device_status'
  )).toEqual([])
  expect(applicationErrors).toEqual([])
  expect(browserErrors).toEqual([])
})

for (const scenario of [
  {
    state: 'invalid_input',
    status: 400,
    code: 'invalid_input',
    message: '提交内容格式不正确',
    actionable: /输入不被 OS 接受.*检查.*重试/
  },
  {
    state: 'not_found',
    status: 404,
    code: 'not_found',
    message: '请求的资源不存在',
    actionable: /Workflow.*Material.*数据.*刷新.*重试/
  },
  {
    state: 'conflict',
    status: 409,
    code: 'conflict',
    message: '资源已发生冲突，请刷新后重试',
    actionable: /权威状态.*冲突.*刷新.*重试/
  }
] as const satisfies ReadonlyArray<{
  state: Exclude<MaterialAuthorityRaceState, 'restore'>
  status: number
  code: string
  message: string
  actionable: RegExp
}>) {
  test(`ResourceSlot authority ${scenario.status} keeps the selected form actionable and writes no Task`, async ({
    page
  }) => {
    test.setTimeout(120_000)
    const browserErrors: string[] = []
    const expectedAuthorityConsoleErrors: string[] = []
    const applicationErrors: string[] = []
    const webSockets: string[] = []
    const requests: Array<{ method: string; path: string }> = []
    page.on('console', (message) => {
      if (message.type() !== 'error') return
      const text = message.text()
      if (new RegExp(
        `^Failed to load resource: the server responded with a status of ${scenario.status} \\([^)]*\\)$`
      ).test(text)) {
        expectedAuthorityConsoleErrors.push(text)
        return
      }
      browserErrors.push(text)
    })
    page.on('pageerror', (error) => browserErrors.push(error.message))
    page.on('websocket', (webSocket) => webSockets.push(webSocket.url()))
    page.on('request', (request) => {
      requests.push({
        method: request.method(),
        path: new URL(request.url()).pathname
      })
    })
    page.on('response', (response) => {
      const path = new URL(response.url()).pathname
      const expectedAuthorityRejection =
        response.request().method() === 'POST' &&
        path === '/api/v1/workflow-tasks' &&
        response.status() === scenario.status
      if (
        response.url().startsWith(`${os.url}/api/v1/`) &&
        response.status() >= 400 &&
        !expectedAuthorityRejection
      ) {
        applicationErrors.push(
          `${response.request().method()} ${path} ${response.status()}`
        )
      }
    })

    await os.mutateResourceSlotMaterialAuthority('restore')
    await ensureAppliedWorkflow(os.resourceSlotInputWorkflowUuid)
    const taskCountBefore = await workflowTaskCount(
      os.resourceSlotInputWorkflowUuid
    )
    const storageKey = `unilab.workflow.active.${
      encodeURIComponent(`local-python:${os.url}`)
    }.v1`
    await page.addInitScript(({ key, workflowUuid }) => {
      localStorage.setItem(
        key,
        JSON.stringify({ version: 1, workflowId: workflowUuid })
      )
    }, { key: storageKey, workflowUuid: os.resourceSlotInputWorkflowUuid })

    await page.goto(
      `/?section=workflow&localOsUrl=${encodeURIComponent(os.url)}`
    )
    await expect(page.getByText('完整控制流 DAG')).toBeVisible()
    await page.getByRole('button', {
      name: '开始运行',
      exact: true
    }).click()
    const form = page.getByRole('region', {
      name: '工作流运行输入表单'
    })
    await expect(form).toBeVisible()
    const inputState = form.getByRole('combobox', {
      name: 'sample 输入状态'
    })
    await expect(inputState).toBeEnabled({ timeout: 10_000 })
    await inputState.selectOption('value')
    const materialSelector = form.getByRole('combobox', {
      name: 'sample 资源位'
    })
    await expect(materialSelector).toContainText('I1 ResourceSlot sample')
    await materialSelector.selectOption(os.resourceSlotMaterialUuid)
    await expect(materialSelector).toHaveValue(os.resourceSlotMaterialUuid)

    await os.mutateResourceSlotMaterialAuthority(scenario.state)
    try {
      const rejectedResponse = page.waitForResponse((response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/v1/workflow-tasks'
      )
      await form.getByRole('button', {
        name: '使用以上参数运行',
        exact: true
      }).click()
      const rejected = await rejectedResponse
      expect(rejected.status()).toBe(scenario.status)
      expect(rejected.request().postDataJSON()).toEqual({
        workflow_uuid: os.resourceSlotInputWorkflowUuid,
        run_mode: 'normal',
        input: { sample: { uuid: os.resourceSlotMaterialUuid } }
      })
      expect(await rejected.json()).toEqual({
        code: scenario.status,
        error: {
          code: scenario.code,
          message: scenario.message
        }
      })

      await expect(form).toBeVisible()
      await expect(materialSelector).toHaveValue(os.resourceSlotMaterialUuid)
      const alert = form.getByRole('alert')
      await expect(alert).toContainText(scenario.actionable)
      await expect(alert).toContainText(
        `OS ${scenario.status} ${scenario.code}：${scenario.message}`
      )
      await expect(alert).not.toContainText(/已删除|已不存在|已占用|类型不兼容/)
      await expect(form.getByRole('button', {
        name: '使用以上参数运行',
        exact: true
      })).toBeEnabled()
      expect(await workflowTaskCount(os.resourceSlotInputWorkflowUuid))
        .toBe(taskCountBefore)
    } finally {
      await os.mutateResourceSlotMaterialAuthority('restore')
    }

    const forbiddenRequests = requests.filter(({ path }) =>
      path === '/api/run' ||
      path.startsWith('/api/runtime/local/') ||
      path.startsWith('/api/v1/runtime/runs') ||
      path.startsWith('/ws/workflow/')
    )
    expect(forbiddenRequests).toEqual([])
    expect(webSockets.filter((url) =>
      new URL(url).pathname !== '/api/v1/ws/device_status'
    )).toEqual([])
    expect(applicationErrors).toEqual([])
    expect(expectedAuthorityConsoleErrors).toEqual([
      expect.stringMatching(new RegExp(
        `^Failed to load resource: the server responded with a status of ${scenario.status} \\([^)]*\\)$`
      ))
    ])
    expect(browserErrors).toEqual([])
  })
}
