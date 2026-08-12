import { expect, test } from '@playwright/test'

import {
  capture,
  installLocalRuntimeTestPage,
  logRowSetSize
} from './helpers/local-runtime-logs'

// 浏览器实测可换行日志行高时允许的亚像素滚动修正。
const LOG_SCROLL_POSITION_TOLERANCE_PX = 4

test.beforeEach(async ({ page }) => {
  await installLocalRuntimeTestPage(page)
})

test('keeps the log entry immediately left of the Edge connection status', async ({
  page
}) => {
  await page.goto('/')

  const connectionBar = page.getByRole('group', {
    name: 'Edge 连接配置'
  })
  const logButton = connectionBar.getByRole('button', { name: '查看日志' })
  const edgeStatus = connectionBar.getByRole('status')
  await expect(logButton).toBeVisible()
  await expect(edgeStatus).toContainText('Edge 未连接')

  const logBox = await logButton.boundingBox()
  const statusBox = await edgeStatus.boundingBox()
  expect(logBox).not.toBeNull()
  expect(statusBox).not.toBeNull()
  expect(logBox?.x).toBeLessThan(statusBox?.x ?? 0)

  await logButton.click()
  await expect(page.getByRole('dialog', { name: '本地运行日志' }))
    .toBeVisible()
})

test('keeps the original log entry in the local runtime dialog', async ({
  page
}) => {
  await page.goto('/')
  const connectionBar = page.getByRole('group', {
    name: 'Edge 连接配置'
  })
  await connectionBar.getByRole('button', { name: '启动本地环境' }).click()
  const runtimeDialog = page.getByRole('dialog', {
    name: '领域侧 Edge（以 sz_lab 为例）'
  })
  const dialogLogButton = runtimeDialog.getByRole('button', {
    name: '查看日志'
  })
  await expect(dialogLogButton).toBeVisible()
  await dialogLogButton.click()
  const logDrawer = page.getByRole('dialog', { name: '本地运行日志' })
  await expect(logDrawer).toBeVisible()
  await expect(logDrawer.getByRole('tab', { name: /Edge 运行时/ }))
    .toHaveAttribute('aria-selected', 'true')
  await expect(logDrawer.getByText('latest edge output')).toBeVisible()
  const openLogFileButton = logDrawer.getByRole('button', {
    name: '打开日志目录'
  })
  await expect(openLogFileButton).toBeEnabled()
  await openLogFileButton.click()
  await expect(logDrawer).not.toContainText('Bridge')

  await page.keyboard.press('Escape')
  await expect(logDrawer).toBeHidden()
  await expect(runtimeDialog).toBeVisible()
})

/**
 * 验证首次打开日志抽屉时，无需切换页签即可识别 PLC-Sim 已有输出。
 *
 * @param page 已安装多来源本地运行日志替身的浏览器页面。
 * @returns 完成日志抽屉首次快照与页签摘要验收。
 * @throws PLC-Sim 页签仍显示“暂无”或读取失败时由 Playwright 断言报告。
 * @safety 只读取固定日志来源，不启动、停止或修改本地运行进程。
 */
test('首次打开即展示未激活 PLC-Sim 页签的已有日志状态', async ({
  page
}) => {
  await page.goto('/')
  const connectionBar = page.getByRole('group', {
    name: 'Edge 连接配置'
  })
  await connectionBar.getByRole('button', { name: '查看日志' }).click()

  const logDrawer = page.getByRole('dialog', { name: '本地运行日志' })
  const plcTab = logDrawer.getByRole('tab', { name: /PLC-Sim/ })
  const edgeTab = logDrawer.getByRole('tab', { name: /Edge 运行时/ })
  await expect(edgeTab).toHaveAttribute('aria-selected', 'true')
  await expect(plcTab).toContainText('有输出')
  await expect(plcTab).toHaveAttribute('data-available', 'true')
})

/**
 * 验证未激活的 PLC-Sim 页签持续接收后台日志，并在切换后展示缓存内容。
 *
 * @param page 已安装延迟 PLC-Sim 输出场景的浏览器页面。
 * @returns 完成后台更新、页签摘要和切换内容一致性验收。
 * @throws 未激活来源停止刷新或切换后内容不一致时由 Playwright 断言报告。
 * @safety 日志替身只改变只读快照，不改变本地运行进程状态。
 */
test('未激活 PLC-Sim 页签持续刷新并缓存新增日志', async ({ page }) => {
  await page.goto('/?backgroundPlcLogs=1')
  const connectionBar = page.getByRole('group', {
    name: 'Edge 连接配置'
  })
  await connectionBar.getByRole('button', { name: '查看日志' }).click()

  const logDrawer = page.getByRole('dialog', { name: '本地运行日志' })
  const plcTab = logDrawer.getByRole('tab', { name: /PLC-Sim/ })
  const edgeTab = logDrawer.getByRole('tab', { name: /Edge 运行时/ })
  await expect(edgeTab).toHaveAttribute('aria-selected', 'true')
  await expect(plcTab).toContainText('暂无')
  await expect(plcTab).toContainText('有输出', { timeout: 5_000 })
  await expect(edgeTab).toHaveAttribute('aria-selected', 'true')

  await plcTab.click()
  await expect(logDrawer).toContainText('PLC-Sim 后台新增输出')
  await expect(plcTab).toHaveAttribute('aria-selected', 'true')
})

/**
 * 证明 PLC-Sim 折叠边界与常驻路径顺序在真实浏览器渲染中保持一致。
 *
 * @param page 已安装本地运行配置夹具的浏览器页面。
 * @returns 完成依赖顺序、折叠边界与窄屏布局验收。
 * @throws 任一配置项顺序、可见性或横向溢出不符合预期时由 Playwright 断言报告失败。
 */
test('本地运行配置按依赖顺序展示且仅折叠 PLC-Sim', async ({ page }) => {
  await page.goto('/?longRuntimePaths=1')
  const connectionBar = page.getByRole('group', {
    name: 'Edge 连接配置'
  })
  await connectionBar.getByRole('button', { name: '启动本地环境' }).click()

  const runtimeDialog = page.getByRole('dialog', {
    name: '领域侧 Edge（以 sz_lab 为例）'
  })
  const plcDetails = runtimeDialog.locator('details').filter({
    hasText: 'PLC-Sim（可选）'
  }).first()
  const environmentPath = runtimeDialog.locator('#runtime-environment-path')
  const osPath = runtimeDialog.locator('#runtime-os-path')
  const domainPath = runtimeDialog.locator('#runtime-szlab-path')
  const graphPath = runtimeDialog.locator('#runtime-graph-path')
  const simulatorPath = runtimeDialog.locator('#runtime-simulator-path')
  await expect(plcDetails).not.toHaveAttribute('open', '')
  for (const pathControl of [
    environmentPath,
    osPath,
    domainPath,
    graphPath
  ]) {
    await pathControl.scrollIntoViewIfNeeded()
    await expect(pathControl).toBeVisible()
  }
  await expect(simulatorPath).toBeHidden()

  expect(await runtimeDialog.locator([
    '#runtime-simulator-path',
    '#runtime-environment-path',
    '#runtime-os-path',
    '#runtime-szlab-path',
    '#runtime-graph-path'
  ].join(', ')).evaluateAll((elements) => (
    elements.map((element) => element.id)
  ))).toEqual([
    'runtime-simulator-path',
    'runtime-environment-path',
    'runtime-os-path',
    'runtime-szlab-path',
    'runtime-graph-path'
  ])
  expect(await plcDetails.locator([
    '#runtime-environment-path',
    '#runtime-os-path',
    '#runtime-szlab-path',
    '#runtime-graph-path'
  ].join(', ')).count()).toBe(0)
  await capture(page, '10-local-runtime-plc-collapsed.png')

  await plcDetails.locator('summary').click()
  await expect(plcDetails).toHaveAttribute('open', '')
  await expect(simulatorPath).toBeVisible()
  await capture(page, '11-local-runtime-plc-expanded.png')

  await page.setViewportSize({ width: 390, height: 844 })
  await environmentPath.scrollIntoViewIfNeeded()
  await expect(environmentPath).toBeVisible()
  await expect.poll(() => runtimeDialog.evaluate((element) => (
    element.scrollWidth <= element.clientWidth
  ))).toBe(true)
  await capture(page, '12-local-runtime-narrow-long-path.png')
})

/**
 * 验证高频增量刷新持续进入虚拟日志列表，同时保留用户查看长日志时的滚动位置。
 *
 * @param page 已安装增量日志夹具的浏览器页面。
 * @returns 完成自动跟随、暂停、新内容提示和一键恢复的界面验收。
 * @throws 任一滚动或刷新不变量失效时由 Playwright 断言报告失败。
 */
test('用户查看历史时持续刷新并保持阅读位置', async ({
  page
}) => {
  await page.goto('/?longLogs=1')
  const connectionBar = page.getByRole('group', {
    name: 'Edge 连接配置'
  })
  await connectionBar.getByRole('button', { name: '查看日志' }).click()

  const logDrawer = page.getByRole('dialog', { name: '本地运行日志' })
  const logOutput = page.getByRole('list', { name: '格式化运行日志' })
  await expect.poll(
    () => logOutput.evaluate((element) => (
      element.scrollHeight > element.clientHeight
    ))
  ).toBe(true)
  await expect.poll(
    () => logOutput.evaluate((element) => (
      element.scrollHeight - element.clientHeight - element.scrollTop
    ))
  ).toBeLessThanOrEqual(4)
  await page.waitForTimeout(250)
  await capture(page, '01-log-tail-following.png')

  const rowsBeforePause = await logRowSetSize(logOutput)
  await logOutput.dispatchEvent('pointerdown', {
    pointerType: 'mouse',
    button: 0,
    isPrimary: true
  })
  const scrollTopBeforeRefresh = await logOutput.evaluate((element) => (
    element.scrollTop
  ))
  await capture(page, '02-user-scroll-started.png')

  await expect(page.getByText('已暂停自动跟随；日志仍每 2 秒刷新。'))
    .toBeVisible()
  await expect.poll(
    () => logRowSetSize(logOutput),
    { timeout: 5_000 }
  ).toBeGreaterThan(rowsBeforePause)
  const scrollTopAfterRefresh = await logOutput.evaluate(
    (element) => element.scrollTop
  )
  expect(Math.abs(scrollTopAfterRefresh - scrollTopBeforeRefresh))
    .toBeLessThanOrEqual(LOG_SCROLL_POSITION_TOLERANCE_PX)
  const newLogButton = logDrawer.getByRole('button', {
    name: '有新日志，回到底部'
  })
  await expect(newLogButton).toBeVisible()
  await capture(page, '03-new-logs-preserved-reading-position.png')

  const scrollTopWhileReading = await logOutput.evaluate((element) => {
    element.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
    element.scrollTop = Math.max(0, element.scrollTop - 240)
    element.dispatchEvent(new Event('scroll', { bubbles: true }))
    return element.scrollTop
  })
  for (let refreshIndex = 0; refreshIndex < 3; refreshIndex += 1) {
    const rowsBeforeManualRefresh = await logRowSetSize(logOutput)
    await logDrawer.getByRole('button', { name: '刷新' }).click()
    await expect.poll(
      () => logRowSetSize(logOutput),
      { timeout: 5_000 }
    ).toBeGreaterThan(rowsBeforeManualRefresh)
  }
  const scrollTopAfterManualRefresh = await logOutput.evaluate(
    (element) => element.scrollTop
  )
  expect(Math.abs(scrollTopAfterManualRefresh - scrollTopWhileReading))
    .toBeLessThanOrEqual(LOG_SCROLL_POSITION_TOLERANCE_PX)
  await capture(page, '04-manual-refresh-preserved-reading-position.png')

  await newLogButton.click()
  await expect(newLogButton).toBeHidden()
  await expect.poll(
    () => logOutput.evaluate((element) => (
      element.scrollHeight - element.clientHeight - element.scrollTop
    ))
  ).toBeLessThanOrEqual(4)
  const rowsBeforeFollowResumed = await logRowSetSize(logOutput)
  await expect.poll(
    () => logRowSetSize(logOutput),
    { timeout: 5_000 }
  ).toBeGreaterThan(rowsBeforeFollowResumed)
  await expect.poll(
    () => logOutput.evaluate((element) => (
      element.scrollHeight - element.clientHeight - element.scrollTop
    ))
  ).toBeLessThanOrEqual(4)
  await capture(page, '05-log-tail-follow-resumed.png')
})

test('keeps the log drawer usable on a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const connectionBar = page.getByRole('group', {
    name: 'Edge 连接配置'
  })
  await connectionBar.getByRole('button', { name: '启动本地环境' }).click()
  const runtimeDialog = page.getByRole('dialog', {
    name: '领域侧 Edge（以 sz_lab 为例）'
  })
  const dialogLogButton = runtimeDialog.getByRole('button', {
    name: '查看日志'
  })
  await expect(dialogLogButton).toBeVisible()
  await expect(dialogLogButton).toBeInViewport()
  await dialogLogButton.click()

  const logDrawer = page.getByRole('dialog', { name: '本地运行日志' })
  await expect(logDrawer).toBeVisible()
  await expect(logDrawer.getByRole('tab', { name: /PLC-Sim/ })).toBeVisible()
  await expect(logDrawer.getByRole('tab', { name: /Edge 运行时/ })).toBeVisible()
  await expect(logDrawer).toHaveCSS('width', '390px')
  await page.waitForTimeout(250)
  await capture(page, '06-log-drawer-narrow.png')
})

/**
 * 验证 PLC-Sim 与领域侧 Edge 的四种运行组合各自拥有独立、不串色的状态区域。
 *
 * @param page 已安装本地运行状态夹具的浏览器页面。
 * @returns 完成状态文字、背景色和前景色的组合验收。
 * @throws 任一进程状态或视觉颜色依赖相邻区域时由 Playwright 断言报告失败。
 */
