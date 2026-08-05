import { expect, test, type Locator } from '@playwright/test'

import {
  startF07TaskInputOs,
  type F07TaskInputOs
} from './helpers/f07-task-input-real-os'

let os: F07TaskInputOs

test.beforeAll(async () => {
  os = await startF07TaskInputOs()
})

test.afterAll(async () => {
  await os?.stop()
})

test('F07 scalar/default/required input stays frozen after Workflow evolves', async ({
  page
}) => {
  test.setTimeout(120_000)
  const browserErrors: string[] = []
  const applicationErrors: string[] = []
  const requests: Array<{ method: string; path: string }> = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('pageerror', (error) => browserErrors.push(error.message))
  page.on('request', (request) => requests.push({
    method: request.method(),
    path: new URL(request.url()).pathname
  }))
  page.on('response', (response) => {
    if (response.status() >= 400) {
      applicationErrors.push(
        `${response.request().method()} ${new URL(response.url()).pathname} ` +
        `${response.status()}`
      )
    }
  })

  const initialAuthoring = await readEnvelope<AuthoringAggregate>(
    `${os.url}/api/v1/workflows/${os.workflowUuid}/authoring`
  )
  const storageKey = `unilab.workflow.active.${
    encodeURIComponent(`local-python:${os.url}`)
  }.v1`
  await page.addInitScript(({ key, workflowUuid }) => {
    localStorage.setItem(
      key,
      JSON.stringify({ version: 1, workflowId: workflowUuid })
    )
  }, { key: storageKey, workflowUuid: os.workflowUuid })

  await page.goto(`/?section=workflow&localOsUrl=${encodeURIComponent(os.url)}`)
  await expect(page.getByText('完整控制流 DAG')).toBeVisible()
  await page.getByRole('button', { name: '开始运行', exact: true }).click()
  const form = page.getByRole('region', { name: '工作流运行输入表单' })
  await expect(form).toBeVisible()
  await expect(form.locator(
    '[data-workflow-task-input-name="attempts"]'
  )).toContainText(/默认值[^0-9]*3/i)

  const taskCountBefore = await workflowTaskCount()
  await form.getByRole('button', {
    name: '使用以上参数运行',
    exact: true
  }).click()
  await expect(form.getByRole('alert')).toContainText(/必填|提供/)
  expect(await workflowTaskCount()).toBe(taskCountBefore)

  await chooseExplicitValue(form, 'label')
  await form.getByRole('textbox', { name: 'label 明确值' }).fill('frozen-label')
  await chooseExplicitValue(form, 'count')
  await form.getByRole('spinbutton', { name: 'count 明确值' }).fill('0')
  await chooseExplicitValue(form, 'enabled')
  await form.getByRole('combobox', { name: 'enabled 明确值' })
    .selectOption('false')

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
    workflow_uuid: os.workflowUuid,
    run_mode: 'normal',
    input: {
      label: 'frozen-label',
      count: 0,
      enabled: false
    }
  })
  const task = (await created.json() as Envelope<WorkflowTask>).data
  expect(task.input).toEqual({
    label: 'frozen-label',
    count: 0,
    enabled: false,
    attempts: 3
  })
  expect(task.workflow_snapshot.workflow.revision)
    .toBe(initialAuthoring.workflow_revision)
  expect(task.execution_plan.nodes[0].param).toEqual({
    report: 'frozen-label'
  })

  const jobs = await readEnvelope<Array<{ param: Record<string, unknown> }>>(
    `${os.url}/api/v1/workflow-tasks/${task.uuid}/jobs`
  )
  expect(jobs).toHaveLength(1)
  expect(jobs[0].param).toEqual({ report: 'frozen-label' })

  const evolved = await evolveGraph()
  expect(evolved.workflow.revision).toBeGreaterThan(
    initialAuthoring.workflow_revision
  )
  const refetched = await readEnvelope<WorkflowTask>(
    `${os.url}/api/v1/workflow-tasks/${task.uuid}`
  )
  expect(refetched.input).toEqual(task.input)
  expect(refetched.workflow_snapshot).toEqual(task.workflow_snapshot)
  expect(refetched.execution_plan).toEqual(task.execution_plan)
  expect(await workflowTaskCount()).toBe(taskCountBefore + 1)

  expect(requests).not.toContainEqual({ method: 'POST', path: '/api/run' })
  expect(requests.some(({ path }) => path.startsWith('/api/runtime/local/')))
    .toBe(false)
  expect(requests.some(({ path }) => path.startsWith('/api/v1/runtime/runs')))
    .toBe(false)
  expect(applicationErrors).toEqual([])
  expect(browserErrors).toEqual([])
})

/** 选择一个任务输入字段的明确值状态。 */
async function chooseExplicitValue(
  form: Locator,
  name: string
): Promise<void> {
  await form.getByRole('combobox', { name: `${name} 输入状态` })
    .selectOption('value')
}

/** 通过公共图接口修改节点名称并返回新应用图。 */
async function evolveGraph(): Promise<WorkflowGraph> {
  const before = await readEnvelope<WorkflowGraph>(
    `${os.url}/api/v1/workflows/${os.workflowUuid}/graph`
  )
  const evolvedNodes = before.nodes.map((node, index) => ({
    ...node,
    name: index === 0 ? 'Evolved finalize' : node.name
  }))
  return readEnvelope<WorkflowGraph>(
    `${os.url}/api/v1/workflows/${os.workflowUuid}/graph`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        revision: before.workflow.revision,
        nodes: evolvedNodes,
        edges: before.edges
      })
    }
  )
}

/** 读取当前 F07 工作流任务（WorkflowTask）总数。 */
async function workflowTaskCount(): Promise<number> {
  const page = await readEnvelope<{ items: unknown[] }>(
    `${os.url}/api/v1/workflow-tasks?page=1&page_size=100&` +
    `workflow_uuid=${os.workflowUuid}`
  )
  return page.items.length
}

/** 解码公共工作流接口的成功信封。 */
async function readEnvelope<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  const body = await response.json() as Envelope<T> | Record<string, unknown>
  if (!response.ok || body.code !== 0 || !('data' in body)) {
    throw new Error(`${response.status} ${JSON.stringify(body)}`)
  }
  return body.data as T
}

interface Envelope<T> {
  code: number
  data: T
}

interface AuthoringAggregate {
  workflow_revision: number
  draft: null | {
    draft_hash: string
    python_source: string
  }
  candidate: null | { candidate_hash: string }
}

interface WorkflowTask {
  uuid: string
  input: Record<string, unknown>
  workflow_snapshot: {
    workflow: { revision: number }
    [key: string]: unknown
  }
  execution_plan: {
    nodes: Array<{ param: Record<string, unknown> }>
    [key: string]: unknown
  }
}

interface WorkflowGraph {
  workflow: { revision: number }
  nodes: Array<Record<string, unknown> & { name: string }>
  edges: Array<Record<string, unknown>>
}
