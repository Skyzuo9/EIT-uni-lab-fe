import {
  expect,
  test,
  type ConsoleMessage,
  type Locator,
  type Page,
  type Request,
  type Response
} from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import {
  startF07TaskInputOs,
  type F07TaskInputOs
} from './helpers/f07-task-input-real-os'

let os: F07TaskInputOs

/**
 * 为 F08 启动含两个动作节点的真实 OS 候选。
 *
 * 参数：无。返回：公共 HTTP 接口就绪后无值。异常：启动或工作流编译失败时
 * 拒绝测试套件，并由夹具回收已创建资源。
 */
async function startOs(): Promise<void> {
  os = await startF07TaskInputOs({ includeSecondNode: true })
}

/**
 * 回收 F08 测试拥有的 OS 子进程和隔离目录。
 *
 * 参数：无。返回：清理完成后无值。异常：进程终止失败时拒绝测试套件。
 */
async function stopOs(): Promise<void> {
  await os?.stop()
}

test.beforeAll(startOs)
test.afterAll(stopOs)

/**
 * 验证前端把画布目标提交给规范单节点工作流任务（WorkflowTask）入口。
 *
 * 参数：`page` 是连接当前候选构建的真实浏览器页。返回：请求、冻结快照、
 * 执行计划（ExecutionPlan）和唯一作业断言完成后无值。异常：任何接口、界面、
 * 浏览器错误或范围偏差使测试失败；全程不安装路由模拟，也不执行物理动作。
 */
async function verifySingleNodeTask({ page }: { page: Page }): Promise<void> {
  test.setTimeout(120_000)
  const artifactDirectory = resolve(
    process.env.UNILAB_WORKFLOW_E2E_ARTIFACT_DIR ||
      '../e2e-artifacts/f08-single-node'
  )
  mkdirSync(artifactDirectory, { recursive: true })
  const browserErrors: string[] = []
  const applicationErrors: string[] = []
  const requests: Array<{ method: string; path: string }> = []

  /** 记录控制台错误；参数为消息，返回无，不抛异常。 */
  const recordConsoleError = (message: ConsoleMessage): void => {
    if (message.type() === 'error') browserErrors.push(message.text())
  }
  /** 记录页面未捕获错误；参数为异常，返回无，不抛异常。 */
  const recordPageError = (error: Error): void => {
    browserErrors.push(error.message)
  }
  /**
   * 记录真实网络请求。
   *
   * 参数：`request` 是 Playwright 请求。返回：记录完成后无值。异常：非法 URL
   * 直接使测试失败。
   */
  const recordRequest = (request: Request): void => {
    requests.push({
      method: request.method(),
      path: new URL(request.url()).pathname
    })
  }
  /**
   * 记录非成功应用响应。
   *
   * 参数：`response` 是 Playwright 响应。返回：记录完成后无值。异常：非法 URL
   * 直接使测试失败。
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

  const graph = await readEnvelope<WorkflowGraph>(
    `${os.url}/api/v1/workflows/${os.workflowUuid}/graph`
  )
  expect(graph.nodes.map(readNodeUuid)).toEqual([
    os.firstNodeUuid,
    os.secondNodeUuid
  ])
  const storageKey = `unilab.workflow.active.${
    encodeURIComponent(`local-python:${os.url}`)
  }.v1`
  /**
   * 安装当前活动工作流身份。
   *
   * 参数：`key` 是产品存储键，`workflowUuid` 是工作流身份。返回：写入后无值。
   * 异常：本地存储拒绝写入时传播给页面初始化。
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
  await page.addInitScript(selectActiveWorkflow, {
    key: storageKey,
    workflowUuid: os.workflowUuid
  })

  await page.goto(`/?section=workflow&localOsUrl=${encodeURIComponent(os.url)}`)
  await expect(page.getByText('完整控制流 DAG')).toBeVisible()
  await page.getByRole('button', {
    name: `设为起始点 ${os.secondNodeUuid}`,
    exact: true
  }).click()
  await page.getByRole('button', {
    name: '单节点调试',
    exact: true
  }).click()
  const startButton = page.getByRole('button', {
    name: '开始单节点调试',
    exact: true
  })
  await expect(startButton).toBeEnabled()
  await startButton.click()

  const form = page.getByRole('region', { name: '工作流运行输入表单' })
  await expect(form).toBeVisible()
  await chooseExplicitValue(form, 'label')
  await form.getByRole('textbox', { name: 'label 明确值' })
    .fill('f08-target')
  await chooseExplicitValue(form, 'count')
  await form.getByRole('spinbutton', { name: 'count 明确值' }).fill('8')
  await chooseExplicitValue(form, 'enabled')
  await form.getByRole('combobox', { name: 'enabled 明确值' })
    .selectOption('true')

  const createdResponse = page.waitForResponse(isTaskCreateResponse)
  await form.getByRole('button', {
    name: '使用以上参数运行',
    exact: true
  }).click()
  const created = await createdResponse
  expect(created.status()).toBe(201)
  expect(created.request().postDataJSON()).toEqual({
    workflow_uuid: os.workflowUuid,
    run_mode: 'single_node',
    target_node_uuid: os.secondNodeUuid,
    input: { label: 'f08-target', count: 8, enabled: true }
  })
  const task = (await created.json() as Envelope<WorkflowTask>).data
  expect(task.run_mode).toBe('single_node')
  expect(task.target_node_uuid).toBe(os.secondNodeUuid)
  expect(task.workflow_snapshot.nodes.map(readNodeUuid)).toEqual([
    os.firstNodeUuid,
    os.secondNodeUuid
  ])
  expect(task.execution_plan.nodes.map(readNodeUuid)).toEqual([
    os.secondNodeUuid
  ])
  const jobs = await readEnvelope<WorkflowNodeJob[]>(
    `${os.url}/api/v1/workflow-tasks/${task.uuid}/jobs`
  )
  expect(jobs).toHaveLength(1)
  expect(jobs[0]).toMatchObject({
    workflow_node_uuid: os.secondNodeUuid,
    status: 'pending',
    param: { report: 'f08-second' }
  })
  expect(jobs.some(isSkippedJob)).toBe(false)

  await page.screenshot({
    path: join(artifactDirectory, 'f08-single-node-task.png'),
    fullPage: true
  })
  writeFileSync(
    join(artifactDirectory, 'f08-single-node-report.json'),
    `${JSON.stringify({
      workflow_uuid: os.workflowUuid,
      target_node_uuid: os.secondNodeUuid,
      task_uuid: task.uuid,
      snapshot_nodes: task.workflow_snapshot.nodes.map(readNodeUuid),
      plan_nodes: task.execution_plan.nodes.map(readNodeUuid),
      job_nodes: jobs.map(readJobNodeUuid)
    }, null, 2)}\n`,
    'utf8'
  )
  expect(requests).not.toContainEqual({ method: 'POST', path: '/api/run' })
  expect(requests.some(isLegacyLocalRuntimeRequest)).toBe(false)
  expect(requests.some(isLegacyRuntimeRunRequest)).toBe(false)
  expect(applicationErrors).toEqual([])
  expect(browserErrors).toEqual([])
}

test(
  'F08 单节点模式保留完整快照且只创建目标工作流节点作业',
  verifySingleNodeTask
)

/**
 * 选择任务输入字段的明确值状态。
 *
 * 参数：`form` 是输入表单区域，`name` 是参数名。返回：选择生效后无值。异常：
 * 字段不存在或不可操作时由 Playwright 抛出。
 */
async function chooseExplicitValue(form: Locator, name: string): Promise<void> {
  await form.getByRole('combobox', { name: `${name} 输入状态` })
    .selectOption('value')
}

/** 判断响应是否为任务创建；参数为响应，返回布尔值，非法 URL 时抛异常。 */
function isTaskCreateResponse(response: Response): boolean {
  return response.request().method() === 'POST' &&
    new URL(response.url()).pathname === '/api/v1/workflow-tasks'
}

/** 读取节点 UUID；参数为节点，返回稳定身份，不抛异常。 */
function readNodeUuid(node: { uuid: string }): string {
  return node.uuid
}

/** 读取作业节点 UUID；参数为作业，返回稳定身份，不抛异常。 */
function readJobNodeUuid(job: WorkflowNodeJob): string {
  return job.workflow_node_uuid
}

/** 判断作业是否被跳过；参数为作业，返回布尔值，不抛异常。 */
function isSkippedJob(job: WorkflowNodeJob): boolean {
  return job.status === 'skipped'
}

/** 判断是否访问旧本地运行时；参数为请求记录，返回布尔值，不抛异常。 */
function isLegacyLocalRuntimeRequest(request: {
  method: string
  path: string
}): boolean {
  return request.path.startsWith('/api/runtime/local/')
}

/** 判断是否访问旧运行实例接口；参数为请求记录，返回布尔值，不抛异常。 */
function isLegacyRuntimeRunRequest(request: {
  method: string
  path: string
}): boolean {
  return request.path.startsWith('/api/v1/runtime/runs')
}

/**
 * 解码公共接口成功信封。
 *
 * 参数：`url` 是接口地址，`init` 是可选请求参数。返回：信封数据。异常：HTTP、
 * 业务码或数据字段不合法时抛出包含响应的错误。
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

interface WorkflowGraph {
  nodes: Array<{ uuid: string }>
}

interface WorkflowTask {
  uuid: string
  run_mode: string
  target_node_uuid?: string
  workflow_snapshot: { nodes: Array<{ uuid: string }> }
  execution_plan: { nodes: Array<{ uuid: string }> }
}

interface WorkflowNodeJob {
  workflow_node_uuid: string
  status: string
  param: Record<string, unknown>
}
