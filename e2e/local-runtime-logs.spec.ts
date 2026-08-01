import { expect, test, type Page } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await installRuntimeApi(page)
})

test('opens current local runtime output from the upper-right log drawer', async ({
  page
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: '启动本地环境' }).click()

  const runtimeDialog = page.getByRole('dialog', {
    name: '启动 SZLab 本地调试环境'
  })
  const dialogHeader = runtimeDialog.locator('header').first()
  const dialogFooter = runtimeDialog.locator('footer')
  await expect(dialogHeader.getByRole('button', { name: '查看日志' }))
    .toBeVisible()
  await expect(dialogFooter.getByRole('button', { name: '查看日志' }))
    .toHaveCount(0)

  await dialogHeader.getByRole('button', { name: '查看日志' }).click()
  const logDrawer = page.getByRole('dialog', { name: '本地运行日志' })
  await expect(logDrawer).toBeVisible()
  await expect(logDrawer.getByRole('tab', { name: /Edge 运行时/ }))
    .toHaveAttribute('aria-selected', 'true')
  await expect(logDrawer.getByText('latest edge output')).toBeVisible()
  await expect(logDrawer).not.toContainText('Bridge')
})

test('keeps the log drawer usable on a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('button', { name: '启动本地环境' }).click()
  await page.getByRole('button', { name: '查看日志' }).click()

  const logDrawer = page.getByRole('dialog', { name: '本地运行日志' })
  await expect(logDrawer).toBeVisible()
  await expect(logDrawer.getByRole('tab', { name: /PLC-Sim/ })).toBeVisible()
  await expect(logDrawer.getByRole('tab', { name: /Edge 服务/ })).toBeVisible()
  await expect(logDrawer.getByRole('tab', { name: /Edge 运行时/ })).toBeVisible()
  await expect(logDrawer).toHaveCSS('width', '390px')
})

async function installRuntimeApi(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const idleSnapshot = {
      phase: 'idle' as const,
      message: 'PLC-Sim 与 SZLab Edge 均未启动',
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
      readLogs: async () => ({
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
            content: 'latest edge output',
            available: true,
            truncated: false
          }
        ]
      }),
      onSnapshot: () => () => undefined
    }
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { runtime: runtimeApi }
    })
  })
}
