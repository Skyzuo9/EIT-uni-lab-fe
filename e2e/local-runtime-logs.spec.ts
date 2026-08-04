import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

const artifactDirectory = process.env.UNILAB_E2E_ARTIFACT_DIR

test.beforeEach(async ({ page }) => {
  await installRuntimeApi(page)
  await page.route('**/health', async (route) => {
    await route.fulfill({ json: { status: 'ok' } })
  })
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
    name: '启动领域侧本地调试环境（以 sz_lab 为例）'
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
  await expect(logDrawer).not.toContainText('Bridge')

  await page.keyboard.press('Escape')
  await expect(logDrawer).toBeHidden()
  await expect(runtimeDialog).toBeVisible()
})

test('用户拖动滚动条与自动刷新重叠时保持阅读位置', async ({
  page
}) => {
  await page.goto('/')
  const connectionBar = page.getByRole('group', {
    name: 'Edge 连接配置'
  })
  await connectionBar.getByRole('button', { name: '查看日志' }).click()

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
  await capture(page, '01-log-tail-following.png')

  const rowsBeforeRefresh = await logOutput.locator('li').count()
  const scrollTopBeforeRefresh = await logOutput.evaluate((element) => (
    element.scrollTop
  ))
  await logOutput.dispatchEvent('pointerdown', {
    pointerType: 'mouse',
    button: 0,
    isPrimary: true
  })
  await capture(page, '02-user-scroll-started.png')

  await expect.poll(
    () => logOutput.locator('li').count(),
    { timeout: 5_000 }
  ).toBeGreaterThan(rowsBeforeRefresh)
  expect(await logOutput.evaluate((element) => element.scrollTop))
    .toBe(scrollTopBeforeRefresh)
  await capture(page, '03-refresh-preserved-pointer-position.png')

  const scrollTopWhileReading = await logOutput.evaluate((element) => {
    element.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
    element.scrollTop = Math.max(0, element.scrollTop - 240)
    element.dispatchEvent(new Event('scroll', { bubbles: true }))
    return element.scrollTop
  })
  const rowsBeforeReadingRefresh = await logOutput.locator('li').count()
  await expect.poll(
    () => logOutput.locator('li').count(),
    { timeout: 5_000 }
  ).toBeGreaterThan(rowsBeforeReadingRefresh)
  expect(await logOutput.evaluate((element) => element.scrollTop))
    .toBe(scrollTopWhileReading)
  await capture(page, '04-refresh-preserved-reading-position.png')

  await logOutput.evaluate((element) => {
    element.scrollTop = element.scrollHeight
    element.dispatchEvent(new Event('scroll', { bubbles: true }))
  })
  const rowsBeforeFollowResumed = await logOutput.locator('li').count()
  await expect.poll(
    () => logOutput.locator('li').count(),
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
    name: '启动领域侧本地调试环境（以 sz_lab 为例）'
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
})

async function installRuntimeApi(page: Page): Promise<void> {
  await page.addInitScript(() => {
    let logReadCount = 0
    const idleSnapshot = {
      phase: 'idle' as const,
      message: 'PLC-Sim 与领域侧 Edge 均未启动',
      simulatorRunning: false,
      bridgeRunning: false,
      edgeRunning: false
    }
    const runtimeApi = {
      selectPath: async () => null,
      getDefaultEnvironmentPath: async () => '/tmp/envs/unilab',
      getSnapshot: async () => idleSnapshot,
      startSimulator: async () => idleSnapshot,
      stopSimulator: async () => idleSnapshot,
      startEdge: async () => idleSnapshot,
      stopEdge: async () => idleSnapshot,
      readLogs: async () => {
        logReadCount += 1
        const edgeLines = Array.from(
          { length: 80 + logReadCount * 4 },
          (_, index) => `26-08-04 [12:00:${String(index).padStart(2, '0')}] [INFO] edge line ${index}`
        )
        edgeLines.push('latest edge output')
        return {
          readAt: Date.now(),
          entries: [
            {
              kind: 'simulator' as const,
              content: 'OPC UA ready',
              available: true,
              truncated: false
            },
            {
              kind: 'bridge' as const,
              content: 'Edge service ready',
              available: true,
              truncated: false
            },
            {
              kind: 'edge' as const,
              content: edgeLines.join('\n'),
              available: true,
              truncated: false
            }
          ]
        }
      },
      onSnapshot: () => () => undefined
    }
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { runtime: runtimeApi }
    })
  })
}

async function capture(page: Page, name: string): Promise<void> {
  if (!artifactDirectory) return
  mkdirSync(artifactDirectory, { recursive: true })
  await page.screenshot({
    path: resolve(artifactDirectory, name),
    fullPage: true
  })
}
