import {
  expect,
  test,
  type ConsoleMessage,
  type Locator,
  type Page,
  type Request,
  type Response
} from '@playwright/test'

import {
  startF07TaskInputOs,
  type F07TaskInputOs
} from './helpers/f07-task-input-real-os'

let os: F07TaskInputOs

/**
 * 为本文件启动唯一真实 OS 候选。
 *
 * 参数：无。返回：OS 公共接口就绪后无值。异常：启动失败时拒绝测试套件。
 */
async function startOs(): Promise<void> {
  os = await startF07TaskInputOs()
}

/**
 * 回收本文件拥有的 OS 子进程和隔离目录。
 *
 * 参数：无。返回：清理完成后无值。异常：清理失败时拒绝测试套件。
 */
async function stopOs(): Promise<void> {
  await os?.stop()
}

test.beforeAll(startOs)
test.afterAll(stopOs)

/**
 * 验证工作流任务（WorkflowTask）输入的标量、默认值、必填与冻结合同。
 *
 * 参数：`page` 是连接当前候选构建的真实浏览器页。返回：全部公共 HTTP、界面和
 * 持久事实断言完成后无值。异常：任何合同偏差、浏览器错误或接口失败使测试失败；
 * 全程不使用浏览器路由模拟。
 */
async function verifyFrozenTaskInput({ page }: { page: Page }): Promise<void> {
  test.setTimeout(120_000)
  const browserErrors: string[] = []
  const applicationErrors: string[] = []
  const requests: Array<{ method: string; path: string }> = []
  /**
   * 记录浏览器控制台错误。
   *
   * 参数：`message` 是 Playwright 控制台事件。返回：记录完成后无值。异常：
   * 不抛异常，非错误消息保持忽略。
   */
  const recordConsoleError = (message: ConsoleMessage): void => {
    if (message.type() === 'error') browserErrors.push(message.text())
  }
  /**
   * 记录页面未捕获错误。
   *
   * 参数：`error` 是页面异常。返回：记录完成后无值。异常：不抛异常。
   */
  const recordPageError = (error: Error): void => {
    browserErrors.push(error.message)
  }
  /**
   * 记录浏览器发出的接口方法和路径。
   *
   * 参数：`request` 是真实网络请求。返回：记录完成后无值。异常：非法 URL 会
   * 立即暴露为测试失败，不静默忽略。
   */
  const recordRequest = (request: Request): void => requests.push({
    method: request.method(),
    path: new URL(request.url()).pathname
  })
  /**
   * 记录非成功应用响应。
   *
   * 参数：`response` 是真实网络响应。返回：记录完成后无值。异常：非法 URL 会
   * 立即暴露为测试失败。
   */
  const recordApplicationError = (response: Response): void => {
    if (response.status() >= 400) {
      applicationErrors.push(
        `${response.request().method()} ${new URL(response.url()).pathname} ` +
        `${response.status()}`
      )
    }
  }
  page.on('console', recordConsoleError)
  page.on('pageerror', recordPageError)
  page.on('request', recordRequest)
  page.on('response', recordApplicationError)

  const initialAuthoring = await readEnvelope<AuthoringAggregate>(
    `${os.url}/api/v1/workflows/${os.workflowUuid}/authoring`
  )
  const storageKey = `unilab.workflow.active.${
    encodeURIComponent(`local-python:${os.url}`)
  }.v1`
  /**
   * 把当前工作流身份写入产品自己的本地活动工作流槽。
   *
   * 参数：`key` 是产品存储键，`workflowUuid` 是固定工作流身份。返回：写入后
   * 无值。异常：浏览器存储拒绝写入时让页面初始化失败。
   */
  const selectActiveWorkflow = ({
    key,
    workflowUuid
  }: {
    key: string
    workflowUuid: string
  }): void => {
    localStorage.setItem(
      key,
      JSON.stringify({ version: 1, workflowId: workflowUuid })
    )
  }
  await page.addInitScript(
    selectActiveWorkflow,
    { key: storageKey, workflowUuid: os.workflowUuid }
  )

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

  const createdResponse = page.waitForResponse(isTaskCreateResponse)
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
  expect(requests.some(isLegacyLocalRuntimeRequest))
    .toBe(false)
  expect(requests.some(isLegacyRuntimeRunRequest))
    .toBe(false)
  expect(applicationErrors).toEqual([])
  expect(browserErrors).toEqual([])
}

test(
  'F07 标量/default/required 输入在工作流（Workflow）演进后仍冻结',
  verifyFrozenTaskInput
)

/**
 * 判定响应是否为公共工作流任务（WorkflowTask）创建结果。
 *
 * 参数：`response` 是 Playwright 网络响应。返回：方法和路径同时匹配时为真。
 * 异常：非法响应 URL 会直接抛出并使测试失败。
 */
function isTaskCreateResponse(response: Response): boolean {
  return response.request().method() === 'POST' &&
    new URL(response.url()).pathname === '/api/v1/workflow-tasks'
}

/**
 * 判定请求是否访问旧本地运行时路径。
 *
 * 参数：`request` 是已记录的方法与路径。返回：路径属于旧接口时为真。异常：
 * 不抛异常；本谓词不发起网络请求。
 */
function isLegacyLocalRuntimeRequest(request: {
  method: string
  path: string
}): boolean {
  return request.path.startsWith('/api/runtime/local/')
}

/**
 * 判定请求是否访问旧运行实例路径。
 *
 * 参数：`request` 是已记录的方法与路径。返回：路径属于旧接口时为真。异常：
 * 不抛异常；本谓词不发起网络请求。
 */
function isLegacyRuntimeRunRequest(request: {
  method: string
  path: string
}): boolean {
  return request.path.startsWith('/api/v1/runtime/runs')
}

/**
 * 选择一个任务输入字段的明确值状态。
 *
 * 参数：`form` 是输入表单区域，`name` 是公共参数名。返回：选择生效后无值。
 * 异常：字段不存在或不可操作时由 Playwright 抛出并使测试失败。
 */
async function chooseExplicitValue(
  form: Locator,
  name: string
): Promise<void> {
  await form.getByRole('combobox', { name: `${name} 输入状态` })
    .selectOption('value')
}

/**
 * 通过公共图接口修改节点名称并返回新应用图。
 *
 * 参数：无，使用当前固定 OS 和工作流身份。返回：修订号递增的已应用图。异常：
 * 读取、写入或信封解码失败时传播；不修改旧工作流任务（WorkflowTask）事实。
 */
async function evolveGraph(): Promise<WorkflowGraph> {
  const before = await readEnvelope<WorkflowGraph>(
    `${os.url}/api/v1/workflows/${os.workflowUuid}/graph`
  )
  /**
   * 只改首节点显示名，保持图身份和执行合同不变。
   *
   * 参数：`node` 是已应用节点，`index` 是稳定数组位置。返回：独立节点副本。
   * 异常：不抛异常。
   */
  const evolveNode = (
    node: Record<string, unknown> & { name: string },
    index: number
  ): Record<string, unknown> & { name: string } => ({
    ...node,
    name: index === 0 ? 'Evolved finalize' : node.name
  })
  const evolvedNodes = before.nodes.map(evolveNode)
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

/**
 * 读取当前 F07 工作流任务（WorkflowTask）总数。
 *
 * 参数：无。返回：公共列表中的任务数量。异常：网络或成功信封不合法时传播。
 */
async function workflowTaskCount(): Promise<number> {
  const page = await readEnvelope<{ items: unknown[] }>(
    `${os.url}/api/v1/workflow-tasks?page=1&page_size=100&` +
    `workflow_uuid=${os.workflowUuid}`
  )
  return page.items.length
}

/**
 * 解码公共工作流接口的成功信封。
 *
 * 参数：`url` 是公共接口地址，`init` 是可选标准请求参数。返回：信封内的强类型
 * 数据。异常：非成功 HTTP、业务码或缺少 `data` 时抛出包含原响应的错误。
 */
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
