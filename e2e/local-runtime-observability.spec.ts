import { expect, test } from '@playwright/test'

import {
  capture,
  captureLocator,
  installLocalRuntimeTestPage,
  isExpectedMissingDeviceSocketError
} from './helpers/local-runtime-logs'

test.beforeEach(async ({ page }) => {
  await installLocalRuntimeTestPage(page)
})

test('Edge 缺少 Phoenix 依赖时在启动界面给出非阻塞修复提示', async ({
  page
}) => {
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('pageerror', (error) => browserErrors.push(error.message))

  await page.goto('/?phoenixMissing=1')
  const connectionBar = page.getByRole('group', {
    name: 'Edge 连接配置'
  })
  const runtimeButton = connectionBar.getByRole('button', {
    name: '本地调试已启动'
  })
  await expect(runtimeButton).toContainText('Trace 降级')
  await capture(page, '01-phoenix-degraded-toolbar.png')
  await runtimeButton.click()

  const runtimeDialog = page.getByRole('dialog', {
    name: '领域侧 Edge（以 sz_lab 为例）'
  })
  const recoveryNotice = runtimeDialog.getByRole('status', {
    name: '链路追踪（Trace）功能已降级'
  })
  await expect(recoveryNotice).toBeVisible({ timeout: 3_000 })
  await expect(recoveryNotice).toContainText('设备与业务运行不受影响')
  await expect(recoveryNotice).toContainText("pip install -e '.[observability]'")
  await expect(recoveryNotice).toContainText('停止并重新启动 Edge')
  await capture(page, '02-phoenix-recovery-notice.png')
  await captureLocator(recoveryNotice, '03-phoenix-recovery-command.png')

  await runtimeDialog.getByRole('button', { name: '查看日志' }).click()
  const logDrawer = page.getByRole('dialog', { name: '本地运行日志' })
  await logDrawer.getByRole('list', { name: '格式化运行日志' })
    .evaluate((element) => {
      element.scrollTop = 0
      element.dispatchEvent(new Event('scroll', { bubbles: true }))
    })
  await expect(logDrawer).toContainText('未安装 Arize Phoenix')
  await expect(logDrawer).toContainText('/api/v1/observability/otlp/v1/traces')
  await capture(page, '04-phoenix-source-logs.png')

  await page.keyboard.press('Escape')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(recoveryNotice).toBeVisible()
  await recoveryNotice.scrollIntoViewIfNeeded()
  await capture(page, '05-phoenix-recovery-narrow.png')
  expect(browserErrors.filter((message) => (
    !isExpectedMissingDeviceSocketError(message)
  ))).toEqual([])
})

/**
 * 识别本地运行日志夹具未提供设备状态 WebSocket 时的预期连接错误。
 *
 * @param message 浏览器控制台采集到的错误文本。
 * @returns 是否为固定设备状态地址的连接拒绝错误。
 * @throws 不抛出异常。
 * @safety 只忽略精确地址与 ERR_CONNECTION_REFUSED 组合，其他错误继续导致回归失败。
 */
