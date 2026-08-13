import { expect, test } from '@playwright/test'

import {
  capture,
  installLocalRuntimeTestPage,
  logRowSetSize,
  processVisualStyle
} from './helpers/local-runtime-logs'

test.beforeEach(async ({ page }) => {
  await installLocalRuntimeTestPage(page)
})

test('PLC-Sim 与领域侧 Edge 按各自运行状态独立着色', async ({ page }) => {
  const scenarios = [
    { key: 'idle', plc: 'idle', edge: 'idle' },
    { key: 'plc', plc: 'running', edge: 'idle' },
    { key: 'edge', plc: 'idle', edge: 'running' },
    { key: 'both', plc: 'running', edge: 'running' }
  ] as const
  const visuals = new Map<string, {
    plc: { background: string; color: string }
    edge: { background: string; color: string }
  }>()

  for (const scenario of scenarios) {
    await page.goto(`/?runtimeStatus=${scenario.key}`)
    const connectionBar = page.getByRole('group', {
      name: 'Edge 连接配置'
    })
    await connectionBar.locator('button[data-runtime-phase]').click()
    const runtimeDialog = page.getByRole('dialog', {
      name: '领域侧 Edge（以 sz_lab 为例）'
    })
    const plcState = runtimeDialog.locator('[data-status]').filter({
      hasText: 'PLC-Sim'
    })
    const edgeState = runtimeDialog.locator('[data-status]').filter({
      hasText: '领域侧 Edge'
    })
    await expect(plcState).toHaveAttribute('data-status', scenario.plc)
    await expect(edgeState).toHaveAttribute('data-status', scenario.edge)
    visuals.set(scenario.key, {
      plc: await processVisualStyle(plcState),
      edge: await processVisualStyle(edgeState)
    })
  }

  const idle = visuals.get('idle')
  const plcOnly = visuals.get('plc')
  const edgeOnly = visuals.get('edge')
  const both = visuals.get('both')
  expect(idle).toBeDefined()
  expect(plcOnly).toBeDefined()
  expect(edgeOnly).toBeDefined()
  expect(both).toBeDefined()
  expect(plcOnly?.plc.background).not.toBe(plcOnly?.edge.background)
  expect(plcOnly?.plc.color).not.toBe(plcOnly?.edge.color)
  expect(edgeOnly?.edge.background).not.toBe(edgeOnly?.plc.background)
  expect(edgeOnly?.edge.color).not.toBe(edgeOnly?.plc.color)
  expect(plcOnly?.plc).toEqual(both?.plc)
  expect(edgeOnly?.edge).toEqual(both?.edge)
  expect(idle?.plc).toEqual(plcOnly?.edge)
  expect(idle?.edge).toEqual(edgeOnly?.plc)
  expect(idle?.plc.background).not.toBe('rgba(0, 0, 0, 0)')
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
