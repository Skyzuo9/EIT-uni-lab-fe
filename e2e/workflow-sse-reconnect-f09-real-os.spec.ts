import {
  expect,
  test,
  type ConsoleMessage,
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
 * 启动当前 F09 OS 候选的持久工作流服务。
 *
 * 参数：无。返回：公共 HTTP 与源码监视器就绪后无值。异常：启动、目录编译或
 * 就绪探测失败时拒绝套件，并由夹具清理已创建资源。
 */
async function startOs(): Promise<void> {
  os = await startF07TaskInputOs()
}

/**
 * 回收当前测试拥有的 OS 子进程和隔离目录。
 *
 * 参数：无。返回：清理完成后无值。异常：进程终止失败时拒绝测试套件。
 */
async function stopOs(): Promise<void> {
  await os?.stop()
}

test.beforeAll(startOs)
test.afterAll(stopOs)

/**
 * 验证浏览器断线期间的持久失效通知会按 Last-Event-ID 重放并触发 REST 复原。
 *
 * 参数：`page` 是连接当前候选构建的真实浏览器页。返回：重连头、源码补读、
 * 界面恢复和旧接口负向断言完成后无值。异常：任何状态补丁式 SSE、丢失/重复
 * 复原、残留错误或接口失败使测试失败；全程不安装浏览器路由模拟。
 */
async function verifyDurableReconnect({ page }: { page: Page }): Promise<void> {
  test.setTimeout(120_000)
  const artifactDirectory = resolve(
    process.env.UNILAB_WORKFLOW_E2E_ARTIFACT_DIR ||
      '../e2e-artifacts/f09-sse-reconnect'
  )
  mkdirSync(artifactDirectory, { recursive: true })
  const successfulSseHeaders: string[] = []
  const requests: Array<{ method: string; path: string }> = []
  const pageErrors: string[] = []
  const unexpectedConsoleErrors: string[] = []

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
   * 记录成功 SSE 打开时实际携带的恢复游标。
   *
   * 参数：`response` 是 Playwright 响应。返回：非目标响应保持忽略。异常：
   * 非法 URL 直接使测试失败。
   */
  const recordSuccessfulSse = (response: Response): void => {
    if (isSuccessfulSseResponse(response)) {
      successfulSseHeaders.push(
        response.request().headers()['last-event-id'] || ''
      )
    }
  }
  /**
   * 记录页面未捕获异常。
   *
   * 参数：`error` 是页面异常。返回：记录后无值。异常：不抛异常。
   */
  const recordPageError = (error: Error): void => {
    pageErrors.push(error.message)
  }
  /**
   * 记录非预期控制台错误，忽略测试主动离线产生的网络诊断。
   *
   * 参数：`message` 是控制台事件。返回：记录或忽略后无值。异常：不抛异常。
   */
  const recordConsoleError = (message: ConsoleMessage): void => {
    if (
      message.type() === 'error' &&
      !/ERR_INTERNET_DISCONNECTED|Failed to fetch/i.test(message.text())
    ) {
      unexpectedConsoleErrors.push(message.text())
    }
  }
  page.on('request', recordRequest)
  page.on('response', recordSuccessfulSse)
  page.on('pageerror', recordPageError)
  page.on('console', recordConsoleError)

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
  const firstSse = page.waitForResponse(isSuccessfulSseResponse)
  await page.goto(`/?section=workflow&localOsUrl=${encodeURIComponent(os.url)}`)
  await firstSse
  await expect(page.getByText('完整控制流 DAG')).toBeVisible()
  const editor = page.locator('.cm-content:visible')

  const onlineMarker = '# f09 online cursor baseline'
  await saveAuthorityMarker(onlineMarker)
  await expect(editor).toContainText(onlineMarker, { timeout: 15_000 })
  const authoringReadsBeforeOffline = requests.filter(isAuthoringRead).length
  const successfulOpensBeforeOffline = successfulSseHeaders.length

  await page.context().setOffline(true)
  const offlineMarker = '# f09 replayed after browser reconnect'
  await saveAuthorityMarker(offlineMarker)
  await expect(page.getByText('工作流编辑操作失败', { exact: true }))
    .toBeVisible({ timeout: 10_000 })
  await page.context().setOffline(false)

  /**
   * 读取已成功建立的 SSE 连接数量。
   *
   * 参数：无。返回：当前已观察到的成功响应数。异常：无。
   */
  const countSuccessfulSseConnections = (): number =>
    successfulSseHeaders.length
  await expect.poll(
    countSuccessfulSseConnections,
    { timeout: 15_000 }
  ).toBeGreaterThan(successfulOpensBeforeOffline)
  await expect(editor).toContainText(offlineMarker, { timeout: 15_000 })
  await expect(page.getByText('已同步外部修改', { exact: true }))
    .toBeVisible()
  await expect(page.getByText('工作流编辑操作失败', { exact: true }))
    .toHaveCount(0)
  expect(successfulSseHeaders.at(-1)).toMatch(/^[1-9][0-9]*$/)
  expect(requests.filter(isAuthoringRead).length)
    .toBeGreaterThan(authoringReadsBeforeOffline)
  expect(requests).not.toContainEqual({ method: 'POST', path: '/api/run' })
  expect(requests.some(isLegacyLocalRuntimeRequest)).toBe(false)
  expect(requests.some(isLegacyRuntimeRunRequest)).toBe(false)
  expect(pageErrors).toEqual([])
  expect(unexpectedConsoleErrors).toEqual([])

  await page.screenshot({
    path: join(artifactDirectory, 'f09-sse-reconnect-rehydrated.png'),
    fullPage: true
  })
  writeFileSync(
    join(artifactDirectory, 'f09-sse-reconnect-report.json'),
    `${JSON.stringify({
      workflow_uuid: os.workflowUuid,
      successful_sse_last_event_ids: successfulSseHeaders,
      authoring_reads_before_offline: authoringReadsBeforeOffline,
      authoring_reads_after_reconnect: requests.filter(isAuthoringRead).length,
      replay_marker: offlineMarker
    }, null, 2)}\n`,
    'utf8'
  )
}

test(
  'F09 浏览器携带持久游标重连并用 REST 复原工作流权威',
  verifyDurableReconnect
)

/**
 * 通过公共创作接口向真实工作流草稿追加唯一标记。
 *
 * 参数：`marker` 是合法 Python 注释。返回：OS 事务提交后无值。异常：HTTP、
 * 双 CAS 或信封解码失败时传播；不调用工作流任务（WorkflowTask）或物理动作。
 */
async function saveAuthorityMarker(marker: string): Promise<void> {
  const url = `${os.url}/api/v1/workflows/${os.workflowUuid}/authoring`
  const before = await readEnvelope<AuthoringAggregate>(url)
  if (!before.draft) {
    throw new Error('当前工作流没有可写持久草稿')
  }
  const saved = await readEnvelope<AuthoringAggregate>(`${url}/draft`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      python_source: `${before.draft.python_source}\n${marker}\n`,
      expected_draft_hash: before.draft.draft_hash,
      expected_workflow_revision: before.workflow_revision
    })
  })
  if (!saved.draft?.python_source.includes(marker)) {
    throw new Error(`OS 未持久化源码标记: ${marker}`)
  }
}

/**
 * 判定响应是否为成功打开的全局 SSE。
 *
 * 参数：`response` 是 Playwright 响应。返回：目标路径、状态和内容类型均匹配时
 * 为真。异常：非法 URL 直接传播。
 */
function isSuccessfulSseResponse(response: Response): boolean {
  return response.ok() &&
    new URL(response.url()).pathname === '/api/v1/events' &&
    response.headers()['content-type']?.startsWith('text/event-stream') === true
}

/** 判断是否为工作流创作 REST 补读；参数为请求记录，返回布尔值，不抛异常。 */
function isAuthoringRead(request: { method: string; path: string }): boolean {
  return request.method === 'GET' && request.path.endsWith('/authoring')
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

interface AuthoringAggregate {
  workflow_revision: number
  draft: null | { python_source: string; draft_hash: string }
}
