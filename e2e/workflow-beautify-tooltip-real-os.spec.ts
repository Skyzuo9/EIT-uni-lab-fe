import { expect, test } from '@playwright/test'

import {
  startPersistentAuthoringOs,
  type PersistentAuthoringOs
} from './helpers/persistent-authoring-os'

let os: PersistentAuthoringOs

/** 启动带固定工作流身份的真实本地 OS 创作服务。 */
test.beforeAll(async () => {
  os = await startPersistentAuthoringOs()
})

/** 停止本次测试拥有的 OS 进程并清理临时数据。 */
test.afterAll(async () => {
  await os?.stop()
})

/** 证明禁用提示只有一份，且在窄视口中完整留在可视区域内。 */
test('禁用的美化布局提示不重复且完整展示', async ({ page }, testInfo) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 900, height: 720 })

  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('pageerror', (error) => browserErrors.push(error.message))

  // 固定当前工作流（Workflow）身份，确保测试直接进入目标画布。
  const activeWorkflowStorageKey = `unilab.workflow.active.${
    encodeURIComponent(`local-python:${os.url}`)
  }.v1`
  await page.addInitScript(
    ({ storageKey, workflowUuid }) => {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ version: 1, workflowId: workflowUuid })
      )
    },
    {
      storageKey: activeWorkflowStorageKey,
      workflowUuid: os.workflowUuid
    }
  )

  await page.goto(
    `/?section=workflow&localOsUrl=${encodeURIComponent(os.url)}`
  )
  const panel = page.getByRole('tabpanel', { name: '工作流' })
  const beautifyButton = panel.getByRole('button', {
    name: '应用减少交叉布局'
  })
  const tooltip = page.locator('.workflowDisabledButtonTooltip')

  await expect(beautifyButton).toBeDisabled()
  await expect(beautifyButton).not.toHaveAttribute('title')
  await beautifyButton.hover()
  await expect(tooltip).toHaveCount(1)
  await expect(tooltip).toBeVisible()
  await expect(tooltip).toHaveText('当前模式只允许查看工作流画布')

  const bounds = await tooltip.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const html = element as HTMLElement
    return {
      left: rect.left,
      right: rect.right,
      scrollWidth: html.scrollWidth,
      clientWidth: html.clientWidth,
      scrollHeight: html.scrollHeight,
      clientHeight: html.clientHeight
    }
  })
  expect(bounds.left).toBeGreaterThanOrEqual(0)
  expect(bounds.right).toBeLessThanOrEqual(900)
  expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.clientWidth + 1)
  expect(bounds.scrollHeight).toBeLessThanOrEqual(bounds.clientHeight + 1)

  await page.screenshot({
    path: testInfo.outputPath('workflow-beautify-disabled-tooltip.png'),
    animations: 'disabled'
  })
  expect(browserErrors).toEqual([])
})
