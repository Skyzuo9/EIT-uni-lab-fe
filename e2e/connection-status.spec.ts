import { expect, test } from '@playwright/test'

test('连接成功后持续展示已连接状态', async ({ page }) => {
  await page.route('**/health', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, data: { status: 'ok' } })
    })
  })

  await page.goto('/?enable=materialNav')
  await page.getByRole('button', { name: /物料/ }).click()

  const connectionBar = page.getByRole('group', {
    name: 'Edge 连接配置'
  })
  await expect(connectionBar).toHaveAttribute(
    'data-connection-state',
    'connected'
  )
  await expect(
    connectionBar.getByRole('status').getByText('Edge 已连接')
  ).toBeVisible()
})

test('Edge 健康检查失败后更新为断开状态', async ({ page }) => {
  let edgeOnline = true
  await page.route('**/health', async (route) => {
    await route.fulfill(edgeOnline
      ? { json: { status: 'ok' } }
      : { status: 503, json: { status: 'offline' } })
  })

  await page.goto('/?enable=materialNav')
  await page.getByRole('button', { name: /物料/ }).click()
  const connectionBar = page.getByRole('group', {
    name: 'Edge 连接配置'
  })
  await expect(connectionBar).toHaveAttribute(
    'data-connection-state',
    'connected'
  )

  edgeOnline = false
  await expect(connectionBar).toHaveAttribute(
    'data-connection-state',
    'disconnected',
    { timeout: 10_000 }
  )
  await expect(connectionBar.getByRole('status')).toContainText('Edge 未连接')
})
