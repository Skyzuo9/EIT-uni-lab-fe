import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

const workbenchUrl = process.env.UNILAB_WORKBENCH_URL
const ARTIFACT_DIRECTORY = resolve(
  process.env.UNILAB_E2E_ARTIFACT_DIR
    ?? resolve(process.cwd(), 'e2e-artifacts/workbench-robot-workstation')
)

test.skip(!workbenchUrl, 'UNILAB_WORKBENCH_URL is required')

/** 为真实工站四入口验收准备独立截图目录。 */
test.beforeAll(() => {
  mkdirSync(ARTIFACT_DIRECTORY, { recursive: true })
})

/**
 * 验收四个功能作为 Theia 活动栏一级入口，并确认页面不再展示产品假数据。
 * @param page Playwright 管理的真实 Workbench 页面。
 */
test('四个工站功能从浏览器侧边栏进入并仅展示真实接口状态', async ({ page }) => {
  await page.goto(workbenchUrl!)
  await page.waitForSelector(
    '[data-package-mount-count], button:has-text("校验并启动")',
    { state: 'visible', timeout: 30_000 }
  )
  const startButton = page.getByRole('button', { name: '校验并启动' })
  if (await startButton.isVisible().catch(() => false)) await startButton.click()
  await expect(page.locator('[data-package-mount-count]')).toBeVisible({
    timeout: 60_000
  })

  const activityIds = await page.locator(
    '.theia-app-left .lm-TabBar-tab[data-unilabgroup="true"]:not([id$="-hidden"])'
  ).evaluateAll(tabs => tabs.map(tab => tab.id))
  expect(activityIds).toEqual(expect.arrayContaining([
    'shell-tab-unilab:robot-debug-navigation',
    'shell-tab-unilab:robot-points-navigation',
    'shell-tab-unilab:robot-bench-navigation',
    'shell-tab-unilab:robot-reagents-navigation'
  ]))
  expect(activityIds.indexOf('shell-tab-unilab:robot-debug-navigation'))
    .toBeLessThan(activityIds.indexOf('shell-tab-unilab:robot-points-navigation'))
  expect(activityIds.indexOf('shell-tab-unilab:robot-points-navigation'))
    .toBeLessThan(activityIds.indexOf('shell-tab-unilab:robot-bench-navigation'))
  expect(activityIds.indexOf('shell-tab-unilab:robot-bench-navigation'))
    .toBeLessThan(activityIds.indexOf('shell-tab-unilab:robot-reagents-navigation'))

  await openActivity(page, 'robot-debug', '动作调试')
  await expect(page.getByRole('complementary', { name: 'Edge 设备列表' })).toBeVisible()
  await assertNoFixtureCopy(page)
  await capture(page, '01-action-debug-real-data.png')

  await openActivity(page, 'robot-points', '点位管理')
  await expect(page.getByTestId('workstation-points')).toContainText('点位接口尚未接入')
  await expect(page.getByRole('button', { name: '保存修改' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '导入文件' })).toHaveCount(0)
  await assertNoFixtureCopy(page)
  await capture(page, '02-points-api-unavailable.png')

  const graphRequest = page.waitForRequest(request =>
    new URL(request.url()).pathname === '/api/v1/materials/graph'
  )
  await openActivity(page, 'robot-bench', '实验台')
  await graphRequest
  await expect(page.getByTestId('workstation-bench')).toBeVisible()
  await assertNoFixtureCopy(page)
  await capture(page, '03-bench-real-material-graph.png')

  const inventoryRequest = page.waitForRequest(request =>
    new URL(request.url()).pathname === '/api/v1/inventory/snapshot'
  )
  await openActivity(page, 'robot-reagents', '试剂管理')
  await inventoryRequest
  await expect(page.getByTestId('workstation-reagents')).toBeVisible()
  await expect(page.getByRole('button', { name: '新增' })).toHaveCount(0)
  await assertNoFixtureCopy(page)
  await capture(page, '04-reagents-real-inventory.png')
})

/**
 * 经 Workbench 同源代理验收 Backend 试剂创建、乐观修订、历史读取与软删除闭环。
 * 测试只创建带唯一条码的临时容器，并在 finally 中清理，不修改演示试剂。
 */
test('试剂管理通过真实 Backend 完成 CRUD 与不可变历史查询', async ({ page }) => {
  test.setTimeout(120_000)
  const browserErrors: string[] = []
  const suffix = `${Date.now()}`
  const containerName = `E2E 试剂瓶 ${suffix}`
  const containerBarcode = `E2E-RGT-${suffix}`
  let containerId = ''
  let reagentId = ''
  let reagentDeleted = false

  page.on('console', message => {
    if (
      message.type() === 'error' &&
      !message.text().startsWith('Failed to load resource:')
    ) browserErrors.push(message.text())
  })
  page.on('pageerror', error => browserErrors.push(error.message))
  await page.addInitScript(() => {
    localStorage.setItem('unilab.workbench.connection-mode.v1', 'backend')
  })
  await page.goto(workbenchUrl!)
  await startWorkbench(page)
  await selectBackendConnection(page)

  try {
    containerId = await createBackendContainer(page, {
      name: containerName,
      barcode: containerBarcode,
      idempotencyKey: `e2e-reagent-container-${suffix}`
    })

    const initialList = page.waitForResponse(response =>
      response.request().method() === 'GET' &&
      new URL(response.url()).pathname.endsWith('/api/v1/reagents')
    )
    await openActivity(page, 'robot-reagents', '试剂管理')
    await initialList
    await expect(page.getByTestId('reagent-create')).toBeEnabled()

    await page.getByTestId('reagent-create').click()
    const editor = page.getByRole('dialog', { name: '新增试剂实例' })
    await expect(editor).toBeVisible()
    await expect(editor.locator(
      'option[value="20000000-0000-4000-8000-000000000001"]'
    )).toHaveCount(0)
    await editor.locator('select[name="materialId"]').selectOption(containerId)
    await editor.locator('input[name="cas"]').fill('64-17-5')
    await editor.locator('select[name="physicalState"]').selectOption('liquid')
    await editor.locator('input[name="quantity"]').fill('123')
    await editor.locator('input[name="quantityUnit"]').fill('mL')
    await editor.locator('input[name="concentrationValue"]').fill('95')
    await editor.locator('input[name="concentrationUnit"]').fill('%')
    await editor.locator('textarea[name="description"]').fill('真实 Backend CRUD E2E')

    const createResponsePromise = page.waitForResponse(response =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname.endsWith('/api/v1/reagents')
    )
    const createRefreshPromise = nextReagentListResponse(page)
    await editor.getByRole('button', { name: '创建试剂' }).click()
    const createResponse = await createResponsePromise
    expect(createResponse.status()).toBe(201)
    const createEnvelope = await createResponse.json() as {
      data: { uuid: string; revision: number }
    }
    reagentId = createEnvelope.data.uuid
    expect(createEnvelope.data.revision).toBe(1)
    await createRefreshPromise

    let row = reagentRow(page, containerBarcode)
    await expect(row).toContainText('123 mL')
    await expect(row).toContainText('95 %')
    await expect(row.locator('td[data-label="修订 / 更新时间"]')).toContainText('1')

    await row.locator('button[aria-label^="编辑 "]').click()
    const editDialog = page.getByRole('dialog', { name: /^编辑 / })
    await editDialog.locator('input[name="quantity"]').fill('100')
    const updateResponsePromise = page.waitForResponse(response =>
      response.request().method() === 'PUT' &&
      new URL(response.url()).pathname.endsWith(`/api/v1/reagents/${reagentId}`)
    )
    const updateRefreshPromise = nextReagentListResponse(page)
    await editDialog.getByRole('button', { name: '保存修改' }).click()
    const updateResponse = await updateResponsePromise
    expect(updateResponse.status()).toBe(200)
    expect(updateResponse.request().postDataJSON()).toMatchObject({
      quantity: 100,
      quantity_unit: 'mL',
      expected_revision: 1,
      source: 'frontend:robot-workstation'
    })
    await updateRefreshPromise

    row = reagentRow(page, containerBarcode)
    await expect(row).toContainText('100 mL')
    await expect(row.locator('td[data-label="修订 / 更新时间"]')).toContainText('2')
    const historyResponsePromise = page.waitForResponse(response =>
      response.request().method() === 'GET' &&
      new URL(response.url()).pathname.endsWith(`/api/v1/materials/${containerId}/reagent-history`)
    )
    await row.locator('button[aria-label^="查看 "][aria-label$=" 历史"]').click()
    expect((await historyResponsePromise).status()).toBe(200)
    const history = page.locator('section[aria-label$=" 操作记录"]')
    await expect(history).toContainText('新增试剂余量')
    await expect(history).toContainText('校准试剂余量')
    await history.scrollIntoViewIfNeeded()
    await captureViewport(page, '05-reagents-backend-crud-history-desktop.png')
    await page.setViewportSize({ width: 390, height: 844 })
    await history.scrollIntoViewIfNeeded()
    await captureViewport(page, '06-reagents-backend-crud-history-mobile.png')
    await page.setViewportSize({ width: 1680, height: 1050 })

    row = reagentRow(page, containerBarcode)
    await row.locator('button[aria-label^="删除 "]').click()
    const deleteDialog = page.getByRole('dialog', { name: /^删除 / })
    await expect(deleteDialog).toContainText('软删除试剂')
    await deleteDialog.locator('input').fill('删除')
    const deleteResponsePromise = page.waitForResponse(response =>
      response.request().method() === 'DELETE' &&
      new URL(response.url()).pathname.endsWith(`/api/v1/reagents/${reagentId}`)
    )
    const deleteRefreshPromise = nextReagentListResponse(page)
    await deleteDialog.getByRole('button', { name: '确认软删除' }).click()
    expect((await deleteResponsePromise).status()).toBe(200)
    reagentDeleted = true
    await deleteRefreshPromise
    await expect(reagentRow(page, containerBarcode)).toHaveCount(0)
    expect(browserErrors).toEqual([])
  } finally {
    if (reagentId && !reagentDeleted) {
      await page.request.delete(
        backendRequestUrl(`/api/v1/reagents/${reagentId}`),
        { data: {} }
      )
        .catch(() => undefined)
    }
    if (containerId) {
      await page.request.delete(
        backendRequestUrl(`/api/v1/materials/${containerId}`),
        { data: {} }
      )
        .catch(() => undefined)
    }
  }
})

/**
 * 从 Theia 左侧活动栏打开一个工站一级入口。
 * @param page Playwright 管理的真实 Workbench 页面。
 * @param mode 稳定活动栏模式后缀。
 * @param label 期望出现在 Workbench 顶栏的中文功能名。
 */
async function openActivity(
  page: Page,
  mode: 'robot-debug' | 'robot-points' | 'robot-bench' | 'robot-reagents',
  label: string
): Promise<void> {
  await page.locator(`[id="shell-tab-unilab:${mode}-navigation"]`).click()
  await expect(page.locator('main[data-workbench-view]')).toHaveAttribute(
    'data-workbench-view',
    mode
  )
  await expect(page.locator('.unilab-workbench__view-mode')).toHaveText(label)
  await expect(page.locator('#theia-left-content-panel')).toHaveClass(
    /theia-mod-collapsed/
  )
}

/** 完成 Workbench 首次会话门禁并等待主界面挂载。 */
async function startWorkbench(page: Page): Promise<void> {
  await page.waitForSelector(
    '[data-package-mount-count], button:has-text("校验并启动")',
    { state: 'visible', timeout: 30_000 }
  )
  const startButton = page.getByRole('button', { name: '校验并启动' })
  if (await startButton.isVisible().catch(() => false)) await startButton.click()
  await expect(page.locator('[data-package-mount-count]')).toBeVisible({
    timeout: 60_000
  })
}

/** 显式选择 Backend + Scheduler，并等待连接健康而非仅依赖本地存储。 */
async function selectBackendConnection(page: Page): Promise<void> {
  const backendWorkbench = page.locator(
    '.unilab-workbench[data-connection-mode="backend"]'
  )
  if (!await backendWorkbench.isVisible().catch(() => false)) {
    const connection = page.getByLabel(/^运行连接：/)
    const backendOption = page.getByRole('button', { name: /Backend \+ Scheduler/ })
    if (!await backendOption.isVisible().catch(() => false)) await connection.click()
    await backendOption.click()
  }
  await expect(backendWorkbench).toHaveAttribute(
    'data-authority-profile',
    'backend_controlled'
  )
  await expect(page.getByText('Backend 已连接', { exact: true })).toBeVisible()
}

/** 创建本次 E2E 独占的空容器物料，并返回 Backend UUID。 */
async function createBackendContainer(
  page: Page,
  input: { name: string; barcode: string; idempotencyKey: string }
): Promise<string> {
  const response = await page.request.post(backendRequestUrl('/api/v1/materials'), {
    data: {
      resource_template_uuid: '11000000-0000-4000-8000-000000000001',
      barcode: input.barcode,
      name: input.name,
      meta_data: { source: 'e2e:robot-workstation' },
      config: {},
      data: {},
      idempotency_key: input.idempotencyKey,
      expected_revision: 0
    }
  })
  expect(response.status()).toBe(201)
  const envelope = await response.json() as { data: { uuid: string } }
  expect(envelope.data.uuid).toMatch(/^[0-9a-f-]{36}$/)
  return envelope.data.uuid
}

/** 等待一次由成功写操作触发的 Backend 试剂权威列表刷新。 */
function nextReagentListResponse(page: Page): Promise<import('@playwright/test').Response> {
  return page.waitForResponse(response =>
    response.request().method() === 'GET' &&
    new URL(response.url()).pathname.endsWith('/api/v1/reagents')
  )
}

/** 通过唯一容器条码定位本次测试创建的试剂行。 */
function reagentRow(page: Page, barcode: string): ReturnType<Page['locator']> {
  return page.getByRole('table', { name: '试剂库存' })
    .getByRole('row')
    .filter({ hasText: barcode })
}

/** 生成指向 Workbench 同源 Backend 代理的绝对请求地址。 */
function backendRequestUrl(path: string): string {
  return new URL(`/__unilab_backend${path}`, workbenchUrl!).toString()
}

/**
 * 证明当前活动主区不存在已知演示夹具和本地权威措辞。
 * @param page Playwright 管理的真实 Workbench 页面。
 */
async function assertNoFixtureCopy(page: Page): Promise<void> {
  const visibleSurface = page.locator(
    '.unilab-workbench__domain-slot.is-robot-workstation:not([hidden])'
  )
  await expect(visibleSurface).not.toContainText('本地演示')
  await expect(visibleSurface).not.toContainText('试剂演示数据')
  await expect(visibleSurface).not.toContainText('ST01_robot_points.json')
}

/**
 * 保存当前真实 Workbench 全页截图。
 * @param page Playwright 管理的真实 Workbench 页面。
 * @param filename 截图目录中的稳定文件名。
 */
async function capture(page: Page, filename: string): Promise<void> {
  await page.screenshot({
    path: resolve(ARTIFACT_DIRECTORY, filename),
    fullPage: true
  })
}

/** 保存当前 Theia 内部滚动位置，适合记录位于长列表下方的审计面板。 */
async function captureViewport(page: Page, filename: string): Promise<void> {
  await page.screenshot({
    path: resolve(ARTIFACT_DIRECTORY, filename),
    fullPage: false,
    animations: 'disabled'
  })
}
