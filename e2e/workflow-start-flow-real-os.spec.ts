import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

import {
  startPersistentAuthoringOs,
  type PersistentAuthoringOs
} from './helpers/persistent-authoring-os'
import {
  installWorkflowPanel,
  saveWorkflowDraftOnly,
  waitForTaskInputDrawerClosed
} from './helpers/workflow-runtime-ui'

interface CapturedRequest {
  method: string
  path: string
  body: unknown
}

let os: PersistentAuthoringOs

test.describe.configure({ mode: 'serial' })

/**
 * 启动真实生产 OS 应用、SQLite、编译器与 SSE 测试运行时。
 *
 * @returns OS 完成健康检查后的 Promise。
 */
async function startRealOs(): Promise<void> {
  os = await startPersistentAuthoringOs({ faultProxy: true })
}

/**
 * 停止真实 OS 测试运行时并删除它的临时持久数据。
 *
 * @returns 清理完成后的 Promise。
 */
async function stopRealOs(): Promise<void> {
  await os?.stop()
}

test.beforeAll(startRealOs)
test.afterAll(stopRealOs)

/**
 * 读取 OS 统一响应封装中的 data 字段。
 *
 * @param url 真实 OS HTTP 资源地址。
 * @returns 成功响应中的权威数据。
 */
async function readOsData<Value>(url: string): Promise<Value> {
  const response = await fetch(url)
  const text = await response.text()
  expect(response.status, `${text}\n\n${os.logs().slice(-8_000)}`).toBe(200)
  return (JSON.parse(text) as { data: Value }).data
}

/**
 * 用键盘替换当前可写 Python 编辑器内容，保持真实 CodeMirror 事件链。
 *
 * @param page Playwright 浏览器页面。
 * @param source 要写入的工作流源码（Workflow Source）。
 * @returns 编辑器产生未保存修改后的 Promise。
 */
async function replacePythonSource(page: Page, source: string): Promise<void> {
  const editor = page.locator('.cm-content:visible')
  await expect(editor).toHaveAttribute('contenteditable', 'true')
  await editor.click()
  await page.keyboard.press('Control+a')
  await page.keyboard.insertText(source)
}

/**
 * 证明独立应用与运行入口在真实 OS 接缝上共用同一顺序门禁。
 *
 * @param page Playwright 浏览器页面。
 * @returns 全部公开界面、HTTP 顺序、失败关闭和截图断言完成后的 Promise。
 */
async function provesSingleWorkflowStartEntry({
  page
}: {
  page: Page
}): Promise<void> {
  test.setTimeout(120_000)
  const artifactDirectory = resolve(
    process.env.UNILAB_E2E_ARTIFACT_DIR ||
      resolve(process.cwd(), '../e2e-artifacts/workflow-start-flow-real-os')
  )
  mkdirSync(artifactDirectory, { recursive: true })

  const browserErrors: string[] = []
  // requests 记录浏览器对真实 OS 的公开请求顺序与请求体，不读取数据库旁路。
  const requests: CapturedRequest[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('pageerror', (error) => browserErrors.push(error.message))
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.origin !== new URL(os.url).origin) return
    let body: unknown = null
    try {
      body = request.postDataJSON()
    } catch {
      body = request.postData()
    }
    requests.push({ method: request.method(), path: url.pathname, body })
  })

  await installWorkflowPanel(page, os.runtimeWorkflowUuid)
  await page.goto(
    `/?section=workflow&localOsUrl=${encodeURIComponent(os.url)}`
  )
  const panel = page.locator('[data-panel-instance-id="runtime-workflow"]')
  await expect(panel.getByText('完整控制流 DAG')).toBeVisible()

  const applyVersion = panel.getByRole('button', {
    name: '应用此版本',
    exact: true
  })
  const startWorkflow = panel.getByRole('button', {
    name: '开始运行',
    exact: true
  })
  await expect(applyVersion).toBeEnabled()
  await expect(applyVersion).toHaveAttribute(
    'aria-description',
    '保存并校验当前修改，将其设为后续运行使用的版本；不会立即运行设备。'
  )
  await expect(startWorkflow).toBeEnabled()
  await applyVersion.hover()
  await expect(page.getByRole('tooltip')).toHaveText(
    '保存并校验当前修改，将其设为后续运行使用的版本；不会立即运行设备。'
  )
  await page.screenshot({
    path: join(artifactDirectory, '01-candidate-awaiting-materialization.png'),
    fullPage: true
  })
  await page.mouse.move(20, 200)
  await expect(page.getByRole('tooltip')).toBeHidden()

  const taskPostsBeforeCandidate = requests.filter((request) =>
    request.method === 'POST' && request.path === '/api/v1/workflow-tasks'
  ).length
  await saveWorkflowDraftOnly(panel)
  const normalizedDiff = page.getByRole('dialog', {
    name: '完整 Python 差异'
  })
  await expect(normalizedDiff).toBeVisible()
  await page.screenshot({
    path: join(artifactDirectory, '02-normalized-source-review.png'),
    fullPage: true
  })
  await normalizedDiff.getByRole('button', {
    name: '接受完整差异并保存',
    exact: true
  }).click()
  await expect(applyVersion).toBeEnabled()
  await page.screenshot({
    path: join(artifactDirectory, '03-saved-candidate-apply-and-run.png'),
    fullPage: true
  })

  const draftPutCountBeforeApply = requests.filter((request) =>
    request.method === 'PUT' && request.path.endsWith('/authoring/draft')
  ).length
  await applyVersion.click()

  await expect(page.getByLabel('工作流运行输入表单')).toBeHidden()
  expect(requests.filter((request) =>
    request.method === 'PUT' && request.path.endsWith('/authoring/draft')
  )).toHaveLength(draftPutCountBeforeApply)
  expect(requests.filter((request) =>
    request.method === 'POST' && request.path === '/api/v1/workflow-tasks'
  )).toHaveLength(taskPostsBeforeCandidate)
  await expect(applyVersion).toBeDisabled()
  await expect(startWorkflow).toBeEnabled()
  await page.screenshot({
    path: join(artifactDirectory, '04-applied-without-task-input.png'),
    fullPage: true
  })

  await panel.getByRole('button', { name: '画布模式', exact: true }).click()
  const firstNode = panel.locator('.react-flow__node-wfNode').first()
  await firstNode.click({ position: { x: 40, y: 24 } })
  const nodeName = panel.getByRole('textbox', { name: '节点名称' })
  await expect(nodeName).toBeVisible()
  await nodeName.fill('prepared_start_flow')
  await expect(startWorkflow).toBeEnabled()
  await expect(applyVersion).toBeEnabled()
  await page.screenshot({
    path: join(artifactDirectory, '05-dirty-with-stable-run-action.png'),
    fullPage: true
  })

  const dirtyRequestOffset = requests.length
  await startWorkflow.click()
  const canvasDiff = page.getByRole('dialog', { name: '完整 Python 差异' })
  await expect(canvasDiff).toBeVisible()
  await page.screenshot({
    path: join(artifactDirectory, '06-canvas-source-review.png'),
    fullPage: true
  })
  await canvasDiff.getByRole('button', {
    name: '接受完整差异并保存',
    exact: true
  }).click()

  const taskInput = page.getByLabel('工作流运行输入表单')
  await expect(taskInput).toBeVisible()
  const dirtyRequests = requests.slice(dirtyRequestOffset)
  const draftIndex = dirtyRequests.findIndex((request) =>
    request.method === 'PUT' && request.path.endsWith('/authoring/draft')
  )
  const applyIndex = dirtyRequests.findIndex((request) =>
    request.method === 'POST' && request.path.endsWith('/authoring/apply')
  )
  const appliedReadIndex = dirtyRequests.findIndex((request, index) =>
    index > applyIndex &&
    request.method === 'GET' &&
    request.path.endsWith('/authoring')
  )
  expect(draftIndex).toBeGreaterThanOrEqual(0)
  expect(applyIndex).toBeGreaterThan(draftIndex)
  expect(appliedReadIndex).toBeGreaterThan(applyIndex)
  expect(dirtyRequests.some((request) =>
    request.method === 'POST' && request.path === '/api/v1/workflow-tasks'
  )).toBe(false)
  const applyRequest = dirtyRequests[applyIndex]
  expect(Object.keys(applyRequest.body as Record<string, unknown>)).toEqual([
    'candidate_hash'
  ])

  const applied = await readOsData<{
    workflow_revision: number
    applied_graph: Record<string, unknown>
  }>(`${os.url}/api/v1/workflows/${os.runtimeWorkflowUuid}/authoring`)
  const taskResponsePromise = page.waitForResponse((response) =>
    response.request().method() === 'POST' &&
    new URL(response.url()).pathname === '/api/v1/workflow-tasks'
  )
  await taskInput.getByRole('button', {
    name: '使用以上参数运行',
    exact: true
  }).click()
  const taskResponse = await taskResponsePromise
  expect(taskResponse.status()).toBe(201)
  const taskEnvelope = await taskResponse.json() as {
    data: { workflow_snapshot: Record<string, unknown> }
  }
  expect(taskEnvelope.data.workflow_snapshot).toEqual(applied.applied_graph)
  await expect(panel.locator('[data-run-status="pending"]')).toBeVisible()
  await waitForTaskInputDrawerClosed(page)
  await page.screenshot({
    path: join(artifactDirectory, '07-new-revision-task-created.png'),
    fullPage: true
  })

  await panel.getByRole('button', { name: '代码模式', exact: true }).click()
  const currentRuntimeSource = await page.locator('.cm-content:visible')
    .innerText()
  await replacePythonSource(
    page,
    `${currentRuntimeSource}\n# local CAS conflict\n`
  )
  const applyCountBeforeConflict = requests.filter((request) =>
    request.method === 'POST' && request.path.endsWith('/authoring/apply')
  ).length
  const taskCountBeforeConflict = requests.filter((request) =>
    request.method === 'POST' && request.path === '/api/v1/workflow-tasks'
  ).length
  expect(browserErrors).toEqual([])
  for (let attempt = 0; attempt < 3; attempt += 1) {
    os.failNextRequest({
      method: 'PUT',
      path: `/api/v1/workflows/${os.runtimeWorkflowUuid}/authoring/draft`,
      status: 409,
      code: 'draft_hash_conflict',
      message: '工作流草稿已被远端修改',
      retryable: false
    })
  }
  await startWorkflow.click()
  await expect(panel.getByRole('alert').filter({
    hasText: '工作流草稿已被远端修改'
  })).toBeVisible()
  expect(requests.filter((request) =>
    request.method === 'POST' && request.path.endsWith('/authoring/apply')
  )).toHaveLength(applyCountBeforeConflict)
  expect(requests.filter((request) =>
    request.method === 'POST' && request.path === '/api/v1/workflow-tasks'
  )).toHaveLength(taskCountBeforeConflict)
  await page.screenshot({
    path: join(artifactDirectory, '08-cas-conflict-blocked.png'),
    fullPage: true
  })
  await panel.getByRole('alert').getByRole('button', {
    name: '关闭',
    exact: true
  }).click()

  await replacePythonSource(page, 'def broken(:\n')
  await expect(startWorkflow).toBeEnabled()
  const applyCountBeforeInvalid = requests.filter((request) =>
    request.method === 'POST' && request.path.endsWith('/authoring/apply')
  ).length
  const taskCountBeforeInvalid = requests.filter((request) =>
    request.method === 'POST' && request.path === '/api/v1/workflow-tasks'
  ).length
  await startWorkflow.click()
  await expect(panel.getByRole('alert').filter({
    hasText: '工作流源码未生成可应用候选'
  })).toBeVisible()
  await expect(panel.getByRole('button', {
    name: '开始运行',
    exact: true
  })).toBeDisabled()
  expect(requests.filter((request) =>
    request.method === 'POST' && request.path.endsWith('/authoring/apply')
  )).toHaveLength(applyCountBeforeInvalid)
  expect(requests.filter((request) =>
    request.method === 'POST' && request.path === '/api/v1/workflow-tasks'
  )).toHaveLength(taskCountBeforeInvalid)
  await page.screenshot({
    path: join(artifactDirectory, '09-invalid-draft-blocked.png'),
    fullPage: true
  })

  expect(browserErrors).toHaveLength(3)
  for (const browserError of browserErrors) {
    expect(browserError).toMatch(
      /^Failed to load resource: the server responded with a status of 409/
    )
  }
}

test(
  '应用此版本与开始运行通过真实 OS 共用严格门禁',
  provesSingleWorkflowStartEntry
)
