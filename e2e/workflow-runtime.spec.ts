import { expect, test } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('full control DAG edit, dispatch, node feedback and debugger', async ({
  page
}) => {
  const browserErrors: string[] = []
  const apiCalls: Array<{ method: string; status: number; url: string }> = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('pageerror', (error) => browserErrors.push(error.message))
  page.on('response', (response) => {
    if (!response.url().includes('/api/v1/')) return
    apiCalls.push({
      method: response.request().method(),
      status: response.status(),
      url: response.url()
    })
  })

  const osUrl = process.env.UNILAB_OS_E2E_URL
  await page.goto(
    osUrl ? `/?localOsUrl=${encodeURIComponent(osUrl)}` : '/'
  )
  await page.getByText('工作流', { exact: true }).first().click()
  await expect(page.getByText('完整控制流 DAG')).toBeVisible()
  await expect(page.locator('.react-flow__node-wfNode')).toHaveCount(6)
  await expect(page.getByText('TRUE', { exact: true })).toBeVisible()
  await expect(page.getByText('FALSE', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: '校验', exact: true }).click()
  await expect(page.getByText(/校验通过/)).toBeVisible()

  await page.getByRole('button', { name: '保存修订版本' }).click()
  await expect(page.getByText(/已保存修订版本/)).toBeVisible()

  await page.getByRole('button', { name: /调试启动/ }).click()
  const debugStatus = page.locator('.workflow-runtime__debug-status strong')
  await expect(debugStatus).toHaveText('已暂停')
  await expect(debugStatus).toHaveAttribute('data-debug-status', 'paused')
  await expect(page.locator('.workflow-runtime__run-state'))
    .toHaveText('整体：等待执行')
  await expect(page.locator('.workflow-runtime__run-state'))
    .toHaveAttribute('data-run-status', 'pending')

  await page.getByRole('button', { name: /单步/ }).click()
  await expect(debugStatus).toHaveText('已暂停')
  await expect(
    page.locator('.workflow-runtime__node-list button', { hasText: 'measure' })
  ).toHaveAttribute('data-node-state', 'success')
  await expect(page.getByText(/暂停于 branch 执行之前/)).toBeVisible()

  await page.getByRole('button', { name: /单步/ }).click()
  await expect(debugStatus).toHaveText('已暂停')
  await expect(
    page.locator('.workflow-runtime__node-list button', { hasText: 'branch' })
  ).toHaveAttribute('data-node-state', 'success')
  await expect(
    page.locator('.workflow-runtime__node-list button', { hasText: 'inspect' })
  ).toHaveAttribute('data-node-state', 'skipped')

  await page.getByRole('button', { name: /继续/ }).click()
  await expect(page.locator('.workflow-runtime__run-state'))
    .toHaveText('整体：已完成')
  await expect(debugStatus).toHaveText('已完成')
  await expect(
    page.locator('.workflow-runtime__node-list button', { hasText: 'heat' })
  ).toHaveAttribute('data-node-state', 'success')
  await expect(page.locator('.workflow-runtime__events')).toContainText(
    'run.status'
  )

  const artifactDir = resolve(process.cwd(), '../e2e-artifacts')
  mkdirSync(artifactDir, { recursive: true })
  const screenshot = resolve(
    artifactDir,
    'workflow-runtime-e2e-completed.png'
  )
  const stageScreenshot = resolve(
    artifactDir,
    'workflow-runtime-e2e-stage.png'
  )
  await page.screenshot({
    path: screenshot,
    fullPage: false
  })
  await page.locator('.workflow-runtime__stage').screenshot({
    path: stageScreenshot
  })

  const pythonMode = page.getByRole('button', { name: 'Python', exact: true })
  await pythonMode.click()
  await expect(pythonMode).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.cm-content')).toContainText(
    "device('balance-1').measure()"
  )
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+End')
  await page.keyboard.insertText('\n# e2e authoring compile')
  await page.getByRole('button', { name: '编译 Python' }).click()
  await expect(page.getByText(/Python 已编译/)).toBeVisible()
  await expect(page.locator('.wf-flow-node--breakpoint')).toHaveCount(1)
  await page.getByRole('button', { name: '校验', exact: true }).click()
  await expect(page.getByText(/校验通过/)).toBeVisible()
  await page.getByRole('button', { name: '保存修订版本' }).click()
  await expect(page.getByText(/已保存修订版本/)).toBeVisible()

  const pythonScreenshot = resolve(
    artifactDir,
    'workflow-authoring-python-e2e.png'
  )
  await page.screenshot({
    path: pythonScreenshot,
    fullPage: false
  })

  const jsonMode = page.getByRole('button', { name: 'JSON', exact: true })
  await jsonMode.click()
  await expect(jsonMode).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.react-flow__node-wfNode')).toHaveCount(6)

  writeFileSync(
    resolve(artifactDir, 'workflow-runtime-e2e-result.json'),
    JSON.stringify(
      {
        outcome: 'passed',
        screenshot,
        stageScreenshot,
        pythonScreenshot,
        apiCalls,
        browserErrors
      },
      null,
      2
    )
  )

  expect(
    apiCalls.some(
      (call) =>
        call.method === 'POST' &&
        call.status === 200 &&
        call.url.endsWith('/api/v1/runtime/runs')
    )
  ).toBe(true)
  expect(
    apiCalls.filter((call) => call.url.endsWith('/commands')).length
  ).toBeGreaterThanOrEqual(3)
  expect(
    apiCalls.some(
      (call) =>
        call.method === 'POST' &&
        call.status === 200 &&
        call.url.endsWith('/api/v1/authoring/generate-python')
    )
  ).toBe(true)
  expect(
    apiCalls.some(
      (call) =>
        call.method === 'POST' &&
        call.status === 200 &&
        call.url.endsWith('/api/v1/authoring/compile')
    )
  ).toBe(true)
  expect(browserErrors).toEqual([])
})
