import { expect, test, type Page } from '@playwright/test'

/**
 * 为日志复制回归安装最小本地运行接口和空目录 HTTP 响应。
 *
 * @param page 即将打开 kernel-web 的浏览器页面。
 * @returns 页面初始化脚本和必要网络替身注册完成后结束。
 * @throws Playwright 无法注册脚本或路由时透传异常。
 * @safety 只在测试浏览器中替换预加载接口，不访问系统剪贴板或真实进程。
 */
test.beforeEach(async ({ page }) => {
  await installCopyRuntimeApi(page)
  await page.route('**/health', async (route) => {
    await route.fulfill({ json: { status: 'ok' } })
  })
  await page.route('**/api/v1/devices', async (route) => {
    await route.fulfill({
      json: {
        code: 0,
        data: {
          schemaVersion: 'device-catalog/v1',
          source: 'edge',
          generatedAt: Date.now(),
          items: []
        }
      }
    })
  })
  await page.route('**/api/v1/workflow-node-templates?*', async (route) => {
    await route.fulfill({
      json: {
        code: 0,
        data: {
          authority: { authority_id: 'e2e-edge', kind: 'local' },
          catalog_fingerprint: `sha256:${'a'.repeat(64)}`,
          items: [],
          total: 0,
          page: 1,
          page_size: 100
        }
      }
    })
  })
  await page.route('**/api/v1/materials/graph', async (route) => {
    await route.fulfill({ json: { code: 0, data: { nodes: [] } } })
  })
  await page.route('**/api/v1/material-shapes', async (route) => {
    await route.fulfill({ json: { code: 0, data: { items: [] } } })
  })
})

/**
 * 验证复制当前日志会剥离控制码，并原样保留换行、空行与 traceback 缩进。
 *
 * @param page 已安装内存剪贴板与本地运行日志替身的浏览器页面。
 * @returns 完成日志抽屉复制交互与剪贴板精确文本验收。
 * @throws 复制入口缺失、反馈错误或文本失真时由 Playwright 断言报告。
 * @safety 所有内容只写入测试页面内存变量，不触碰宿主机剪贴板。
 */
test('复制安全原文并保留 traceback 排版', async ({ page }) => {
  await page.goto('/')
  const connectionBar = page.getByRole('group', { name: 'Edge 连接配置' })
  await connectionBar.getByRole('button', { name: '查看日志' }).click()

  const logDrawer = page.getByRole('dialog', { name: '本地运行日志' })
  const copyButton = logDrawer.getByRole('button', { name: '复制当前日志' })
  await expect(copyButton).toBeVisible()
  await copyButton.click()
  await expect(logDrawer.getByRole('button', { name: '已复制' })).toBeVisible()

  await expect.poll(() => page.evaluate(() => (
    (window as typeof window & { __copiedRuntimeLog?: string })
      .__copiedRuntimeLog
  ))).toBe([
    '2026-08-05 12:01:31.000 | ERROR | worker - Action failed',
    '',
    'Traceback (most recent call last):',
    '  File "worker.py", line 18, in run',
    'ValueError: invalid volume'
  ].join('\n'))
})

/**
 * 注入只读日志来源与页面内存剪贴板，实现可重复的复制交互。
 *
 * @param page Playwright 页面，用于注册加载前初始化脚本。
 * @returns 初始化脚本注册完成后结束。
 * @throws Playwright 无法注入脚本时透传异常。
 * @safety 不启动 PLC-Sim 或领域侧 Edge，不访问本地文件和真实剪贴板。
 */
async function installCopyRuntimeApi(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const logContent = [
      '\u001b[31m2026-08-05 12:01:31.000 | ERROR | worker - Action failed\u001b[0m',
      '',
      'Traceback (most recent call last):',
      '  File "worker.py", line 18, in run',
      'ValueError: invalid volume'
    ].join('\n')
    const browserWindow = window as typeof window & {
      __copiedRuntimeLog?: string
    }
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        /**
         * 把复制结果保存在测试页面内存中，供精确断言读取。
         *
         * @param value 日志抽屉请求写入的安全原文。
         * @returns 内存变量更新完成后结束。
         * @throws 不抛出异常。
         * @safety 不访问宿主机剪贴板，数据只存活于当前测试页面。
         */
        writeText: async (value: string): Promise<void> => {
          browserWindow.__copiedRuntimeLog = value
        }
      }
    })
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
      readLog: async ({ kind }: { kind: 'simulator' | 'bridge' | 'edge' }) => ({
        kind,
        content: kind === 'edge' ? logContent : '',
        available: kind === 'edge',
        truncated: false,
        readAt: Date.now(),
        cursor: { fileId: `copy-${kind}`, offset: 1 },
        reset: true
      }),
      readLogs: async () => ({ readAt: Date.now(), entries: [] }),
      onSnapshot: () => () => undefined
    }
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { runtime: runtimeApi }
    })
  })
}
