import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { expect, test, type Page, type TestInfo } from '@playwright/test'

const enabled = process.env.UNILAB_E2E_WORKBENCH_BACKEND_ONLY === '1'
const workbenchUrl = process.env.UNILAB_WORKBENCH_URL

test.skip(
  !enabled || !workbenchUrl,
  '需要显式启动只有 Workspace Backend、没有 Edge Runtime 的 Workbench'
)

test('renders Workflow and Material canvases before Edge starts', async ({
  page
}, testInfo) => {
  test.setTimeout(120_000)
  const browserErrors: string[] = []
  page.on('console', message => {
    if (
      message.type() === 'error'
      && !message.text().startsWith('Failed to load resource:')
    ) browserErrors.push(message.text())
  })
  page.on('pageerror', error => browserErrors.push(error.message))

  await page.goto(workbenchUrl!, { waitUntil: 'domcontentloaded' })
  const workbench = page.locator('.unilab-workbench')
  await expect(workbench).toHaveAttribute('data-workspace-backend-phase', 'ready')
  await expect(workbench).toHaveAttribute('data-edge-runtime-phase', 'idle')
  await expect(workbench).toHaveAttribute('data-plc-simulator-phase', 'idle')
  await expect(workbench).toHaveAttribute('data-connection-mode', 'local')
  await expect(workbench).toHaveAttribute(
    'data-workspace-graph-fingerprint',
    /^[0-9a-f]{64}$/
  )

  const workflow = page.getByRole('region', { name: '工作流窗口' })
  await expect(workflow.getByText('完整控制流 DAG')).toBeVisible()
  await expect(workflow.locator('.react-flow__node').first()).toBeVisible()
  await expect(workflow.locator('.react-flow__edge').first()).toBeVisible()
  await capture(page, testInfo, '01-workflow-backend-only')

  await page.locator('[id="shell-tab-unilab:material-navigation"]').click()
  await expect(page.locator('main[data-workbench-view]')).toHaveAttribute(
    'data-workbench-view',
    'split'
  )
  const material = page.getByRole('region', { name: '物料窗口' })
  await expect(material).toBeVisible()
  await expect(material.getByText(/\([1-9]\d*\)/).first()).toBeVisible()
  await expect(material.getByRole('group', { name: '实验室视图' })).toBeVisible()
  const threeDimensionalView = material.getByRole('button', {
    name: '3D',
    exact: true
  })
  await threeDimensionalView.click()
  await expect(threeDimensionalView).toHaveAttribute('aria-pressed', 'true')
  await expect(material.locator('canvas:visible').first()).toBeVisible({
    timeout: 45_000
  })
  await expect(page.getByRole('region', { name: '工作流窗口' })).toBeVisible()
  await capture(page, testInfo, '02-workflow-material-backend-only')

  expect(browserErrors).toEqual([])
})

async function capture(
  page: Page,
  testInfo: TestInfo,
  name: string
): Promise<void> {
  const image = await page.screenshot({
    animations: 'disabled',
    fullPage: true
  })
  await testInfo.attach(name, { body: image, contentType: 'image/png' })
  const outputDirectory = process.env.UNILAB_UI_PHASE_SCREENSHOT_DIR
  if (!outputDirectory) return
  mkdirSync(resolve(outputDirectory), { recursive: true })
  await page.screenshot({
    animations: 'disabled',
    fullPage: true,
    path: join(resolve(outputDirectory), `${name}.png`)
  })
}
