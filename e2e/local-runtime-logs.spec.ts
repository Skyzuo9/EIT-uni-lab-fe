import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, test, type Locator, type Page } from '@playwright/test'

const artifactDirectory = process.env.UNILAB_E2E_ARTIFACT_DIR

test.beforeEach(async ({ page }) => {
  await installRuntimeApi(page)
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

test('用户拖动滚动条与自动刷新重叠时保持阅读位置', async ({
  page
}) => {
  await page.goto('/')
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

  await expect(page.getByText('已暂停自动刷新，便于保持当前阅读位置。'))
    .toBeVisible()
  await page.waitForTimeout(2_200)
  expect(await logRowSetSize(logOutput)).toBe(rowsBeforePause)
  expect(await logOutput.evaluate((element) => element.scrollTop))
    .toBe(scrollTopBeforeRefresh)
  await capture(page, '03-auto-refresh-paused.png')

  const scrollTopWhileReading = await logOutput.evaluate((element) => {
    element.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
    element.scrollTop = Math.max(0, element.scrollTop - 240)
    element.dispatchEvent(new Event('scroll', { bubbles: true }))
    return element.scrollTop
  })
  const rowsBeforeManualRefresh = await logRowSetSize(logOutput)
  await logDrawer.getByRole('button', { name: '刷新' }).click()
  await expect.poll(
    () => logRowSetSize(logOutput),
    { timeout: 5_000 }
  ).toBeGreaterThan(rowsBeforeManualRefresh)
  expect(await logOutput.evaluate((element) => element.scrollTop))
    .toBe(scrollTopWhileReading)
  await capture(page, '04-manual-refresh-preserved-reading-position.png')

  await logOutput.evaluate((element) => {
    element.scrollTop = element.scrollHeight
    element.dispatchEvent(new Event('scroll', { bubbles: true }))
  })
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

test('大日志只挂载可视行并把内存窗口限制在两千行', async ({ page }) => {
  await page.goto('/?largeLogs=1')
  const connectionBar = page.getByRole('group', {
    name: 'Edge 连接配置'
  })
  await connectionBar.getByRole('button', { name: '查看日志' }).click()

  const logOutput = page.getByRole('list', { name: '格式化运行日志' })
  await expect.poll(() => logRowSetSize(logOutput)).toBe(2_000)
  expect(await logOutput.getByRole('listitem').count()).toBeLessThan(80)
  await page.waitForTimeout(250)
  await capture(page, '07-large-log-windowed.png')
})

test('长日志自动换行并完整展示末尾内容', async ({ page }) => {
  await page.goto('/?longLogs=1')
  const connectionBar = page.getByRole('group', {
    name: 'Edge 连接配置'
  })
  await connectionBar.getByRole('button', { name: '查看日志' }).click()

  const logOutput = page.getByRole('list', { name: '格式化运行日志' })
  const longMessage = logOutput.getByText(/完整日志末尾-UNILAB/)
  const longSource = logOutput.getByText(
    'unilabos.drivers.powder_feeder.material_flow'
  )
  await expect(longMessage).toBeVisible()
  await expect.poll(async () => longMessage.evaluate((element) => ({
    clippedHorizontally: element.scrollWidth > element.clientWidth + 1,
    clippedVertically: element.scrollHeight > element.clientHeight + 1,
    whiteSpace: getComputedStyle(element).whiteSpace
  }))).toEqual({
    clippedHorizontally: false,
    clippedVertically: false,
    whiteSpace: 'pre-wrap'
  })
  await expect.poll(async () => longSource.evaluate((element) => ({
    clippedHorizontally: element.scrollWidth > element.clientWidth + 1,
    clippedVertically: element.scrollHeight > element.clientHeight + 1
  }))).toEqual({
    clippedHorizontally: false,
    clippedVertically: false
  })

  const row = longMessage.locator('..')
  await expect.poll(async () => row.evaluate((element) => (
    element.getBoundingClientRect().height
  ))).toBeGreaterThan(28)
  const followingRow = logOutput.getByText('latest edge output').locator('..')
  await expect.poll(async () => {
    const [longBox, followingBox] = await Promise.all([
      row.boundingBox(),
      followingRow.boundingBox()
    ])
    return Boolean(
      longBox && followingBox
      && followingBox.y >= longBox.y + longBox.height - 1
    )
  }).toBe(true)
  await capture(page, '08-full-long-log-line.png')
})

/** 验证级别筛选作用于格式化记录，并持续接收符合条件的增量错误。 */
test('按状态筛选诊断日志并保留 traceback 完整上下文', async ({ page }) => {
  await page.goto('/?logFilters=1')
  const connectionBar = page.getByRole('group', {
    name: 'Edge 连接配置'
  })
  await connectionBar.getByRole('button', { name: '查看日志' }).click()

  const logDrawer = page.getByRole('dialog', { name: '本地运行日志' })
  const levelFilter = logDrawer.getByRole('combobox', {
    name: '日志级别筛选'
  })
  const logOutput = logDrawer.getByRole('list', { name: '格式化运行日志' })
  await levelFilter.selectOption('error')

  await expect(logOutput).not.toContainText('worker ready')
  await expect(logOutput).toContainText('Action failed')
  await expect(logOutput).toContainText('Traceback (most recent call last):')
  await expect(logOutput).toContainText('ValueError: invalid volume')
  await expect(logOutput).not.toContainText('latest edge output')
  await expect.poll(() => logRowSetSize(logOutput)).toBeGreaterThan(1)
  await capture(page, '10-log-level-filter-error.png')

  await levelFilter.selectOption('warning')
  await expect(logDrawer.getByText('没有符合 WARNING 条件的日志')).toBeVisible()
  await logDrawer.getByRole('button', { name: '清除筛选' }).click()
  await expect(levelFilter).toHaveValue('all')
  await expect(logOutput).toContainText('worker ready')
  await capture(page, '11-log-level-filter-cleared.png')
})

/** 证明大量可换行日志滚到末尾后，虚拟列表不会留下大块空白。 */
test('大量可换行日志末尾紧贴可视区域', async ({ page }) => {
  await page.goto('/?wrappedLargeLogs=1')
  const connectionBar = page.getByRole('group', {
    name: 'Edge 连接配置'
  })
  await connectionBar.getByRole('button', { name: '查看日志' }).click()

  const logOutput = page.getByRole('list', { name: '格式化运行日志' })
  await expect.poll(() => logRowSetSize(logOutput)).toBe(2_000)
  await logOutput.evaluate((element) => {
    element.scrollTop = element.scrollHeight
    element.dispatchEvent(new Event('scroll', { bubbles: true }))
  })

  await expect.poll(async () => logOutput.evaluate((element) => {
    const rows = element.querySelectorAll<HTMLElement>('[role="listitem"]')
    const firstRow = rows.item(0)
    const lastRow = rows.item(rows.length - 1)
    const topGap = firstRow
      ? firstRow.getBoundingClientRect().top
        - element.getBoundingClientRect().top
      : Number.POSITIVE_INFINITY
    const visualGap = lastRow
      ? element.getBoundingClientRect().bottom
        - lastRow.getBoundingClientRect().bottom
      : Number.POSITIVE_INFINITY
    return {
      lastPosition: Number(lastRow?.getAttribute('aria-posinset') ?? 0),
      scrollGap: Math.round(
        element.scrollHeight - element.clientHeight - element.scrollTop
      ),
      topGapWithinLimit: topGap <= 40,
      visualGapWithinLimit: visualGap <= 40
    }
  })).toEqual({
    lastPosition: 2_000,
    scrollGap: 0,
    topGapWithinLimit: true,
    visualGapWithinLimit: true
  })
  await capture(page, '09-wrapped-large-log-tail.png')
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
function isExpectedMissingDeviceSocketError(message: string): boolean {
  return message.includes(
    "WebSocket connection to 'ws://127.0.0.1:18003/api/v1/ws/device_status'"
  ) && message.includes('ERR_CONNECTION_REFUSED')
}

/**
 * 在页面加载前安装确定性的本地运行 API 测试替身。
 *
 * @param page Playwright 页面，用于注入不同日志规模和故障场景。
 * @returns 完成初始化脚本注册后结束，不返回业务数据。
 */
async function installRuntimeApi(page: Page): Promise<void> {
  /** 在浏览器上下文中按 URL 场景生成稳定的增量日志。 */
  await page.addInitScript(() => {
    let logReadCount = 0
    const hasPhoenixMissing = (): boolean => (
      new URLSearchParams(window.location.search).has('phoenixMissing')
    )
    const hasLargeLogs = (): boolean => (
      new URLSearchParams(window.location.search).has('largeLogs')
    )
    const hasLongLogs = (): boolean => (
      new URLSearchParams(window.location.search).has('longLogs')
    )
    const hasWrappedLargeLogs = (): boolean => (
      new URLSearchParams(window.location.search).has('wrappedLargeLogs')
    )
    const hasLogFilters = (): boolean => (
      new URLSearchParams(window.location.search).has('logFilters')
    )
    const idleSnapshot = {
      phase: 'idle' as const,
      message: 'PLC-Sim 与领域侧 Edge 均未启动',
      simulatorRunning: false,
      bridgeRunning: false,
      edgeRunning: false
    }
    const readySnapshot = {
      ...idleSnapshot,
      phase: 'ready' as const,
      message: '领域侧 Edge 已就绪',
      edgeRunning: true
    }
    const runtimeApi = {
      selectPath: async () => null,
      getDefaultEnvironmentPath: async () => '/tmp/envs/unilab',
      getSnapshot: async () => hasPhoenixMissing()
        ? readySnapshot
        : idleSnapshot,
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
        if (hasPhoenixMissing()) {
          edgeLines.unshift(
            '[launcher] 2026-08-04T03:12:00.000Z starting',
            '26-08-04 [11:12:02,100] [ERROR] Phoenix trace 日志服务启动失败：未安装 Arize Phoenix',
            'POST /api/v1/observability/otlp/v1/traces HTTP/1.1 503 Service Unavailable',
            'POST /api/v1/observability/otlp/v1/traces HTTP/1.1 503 Service Unavailable'
          )
        }
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
      readLog: async (query: {
        kind: 'simulator' | 'bridge' | 'edge'
        cursor: { fileId: string; offset: number } | null
      }) => {
        logReadCount += 1
        const initial = query.cursor === null
        const lineCount = initial
          ? (hasLargeLogs() || hasWrappedLargeLogs() ? 2_600 : 84)
          : 4
        const start = initial ? 0 : query.cursor?.offset ?? 0
        const lines = Array.from(
          { length: lineCount },
          (_, index) => hasWrappedLargeLogs()
            ? (
                `26-08-04 [12:00:${String(start + index).padStart(2, '0')}] `
                + '[INFO] uvicorn.protocols.http.httptools_impl '
                + `[Uvicorn.HTTP] 127.0.0.1:64278 - "GET /api/v1/`
                + 'workflow-node-templates/'
                + `${String(start + index).padStart(4, '0')}-`
                + '425ac1b3-2457-4724-b04f-369a362992f3 '
                + 'HTTP/1.1" 200'
              )
            : (
                `26-08-04 [12:00:${String(start + index).padStart(2, '0')}] `
                + `[INFO] ${query.kind} line ${start + index}`
              )
        )
        if (query.kind === 'edge' && hasLogFilters()) {
          if (initial) {
            lines.splice(
              0,
              lines.length,
              '2026-08-04 12:01:30.000 | INFO | worker - worker ready',
              '2026-08-04 12:01:31.000 | ERROR | worker - Action failed',
              'Traceback (most recent call last):',
              '  File "worker.py", line 18, in run',
              'ValueError: invalid volume'
            )
          } else {
            lines.splice(
              0,
              lines.length,
              `2026-08-04 12:01:${String(logReadCount).padStart(2, '0')}.000 | ERROR | worker - incremental failure ${logReadCount}`
            )
          }
        }
        if (initial && query.kind === 'edge' && hasPhoenixMissing()) {
          lines.unshift(
            '[launcher] 2026-08-04T03:12:00.000Z starting',
            '26-08-04 [11:12:02,100] [ERROR] Phoenix trace 日志服务启动失败：未安装 Arize Phoenix',
            'POST /api/v1/observability/otlp/v1/traces HTTP/1.1 503 Service Unavailable'
          )
        }
        if (initial && query.kind === 'edge' && hasLongLogs()) {
          lines.push(
            '2026-08-04 12:01:30.000 | ERROR | '
            + 'unilabos.drivers.powder_feeder.material_flow - '
            + '粉末投料执行失败：设备返回的诊断详情包含多个寄存器状态、'
            + '请求参数与恢复建议，需要在日志抽屉中完整展示，不能使用省略号隐藏。'
            + '寄存器状态=' + 'A1B2C3D4'.repeat(20)
            + ' 完整日志末尾-UNILAB'
          )
        }
        if (query.kind === 'edge') lines.push('latest edge output')
        const offset = start + lineCount
        return {
          kind: query.kind,
          content: `${lines.join('\n')}\n`,
          available: true,
          truncated: false,
          readAt: Date.now(),
          cursor: { fileId: `e2e-${query.kind}`, offset },
          reset: initial
        }
      },
      openLogFile: async () => ({ opened: true }),
      onSnapshot: () => () => undefined
    }
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { runtime: runtimeApi }
    })
  })
}

/** 返回窗口化列表声明的逻辑总行数，而不是当前挂载的 DOM 行数。 */
async function logRowSetSize(logOutput: Locator): Promise<number> {
  const value = await logOutput.getByRole('listitem').first()
    .getAttribute('aria-setsize')
  return Number(value ?? 0)
}

async function capture(page: Page, name: string): Promise<void> {
  if (!artifactDirectory) return
  mkdirSync(artifactDirectory, { recursive: true })
  await page.screenshot({
    path: resolve(artifactDirectory, name),
    fullPage: true
  })
}

async function captureLocator(locator: Locator, name: string): Promise<void> {
  if (!artifactDirectory) return
  mkdirSync(artifactDirectory, { recursive: true })
  await locator.screenshot({
    path: resolve(artifactDirectory, name)
  })
}
