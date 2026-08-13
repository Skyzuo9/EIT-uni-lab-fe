import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const API_URL = 'http://127.0.0.1:18019'
const ARTIFACT_DIR = resolve(
  process.env.UNILAB_E2E_ARTIFACT_DIR ??
    'e2e-artifacts/local-190-material-workflow-visibility'
)

test.beforeAll(() => {
  mkdirSync(ARTIFACT_DIR, { recursive: true })
})

/**
 * 验证物料（Material）工作台折叠工作流（Workflow）后仍保留挂载，并可恢复。
 *
 * @param page Playwright 隔离页面。
 * @returns 无返回值；通过桌面持久化和窄屏整块面板折叠断言验收。
 * @safety 仅使用只读 HTTP 路由夹具，不创建工作流任务（WorkflowTask）或设备动作。
 */
test('material workspace hides and restores the mounted workflow panel', async ({
  page
}) => {
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('pageerror', (error) => browserErrors.push(error.message))
  await installReadOnlyApi(page)
  await page.addInitScript(() => {
    if (sessionStorage.getItem('local-190-storage-initialized')) return
    localStorage.removeItem('unilab.panel-layout.lab.v1')
    localStorage.removeItem(
      'unilab.panel-layout.lab.workflow-visible.v1'
    )
    sessionStorage.setItem('local-190-storage-initialized', 'true')
  })

  await page.goto(`/?section=material&localOsUrl=${encodeURIComponent(API_URL)}`)
  const workspace = page.locator('.lab-panel-workspace--lab')
  const materialRegion = workspace.locator(
    '[data-panel-layout-node-id="default-layout-group"]'
  )
  const workflowRegion = workspace.locator(
    '[data-panel-layout-node-id="default-workflow-group"]'
  )
  await expect(workspace).toHaveAttribute(
    'data-workflow-panel-visible',
    'true'
  )
  await expect(materialRegion).toBeVisible()
  await expect(workflowRegion).toBeVisible()
  await expect(
    workflowRegion.locator('[data-panel-type="workflow-dag-picker"]')
  ).toHaveCount(1)
  await page.screenshot({
    path: resolve(ARTIFACT_DIR, 'desktop-workflow-visible.png'),
    animations: 'disabled'
  })

  await workflowRegion.getByRole('button', {
    name: '隐藏整个工作流面板'
  }).click()
  await expect(workflowRegion).toBeHidden()
  await expect(workflowRegion).toHaveCount(1)
  await expect(
    workflowRegion.locator('[data-panel-type="workflow-dag-picker"]')
  ).toHaveCount(1)
  await expect(page.getByRole('separator')).toBeHidden()
  await expect(page.getByRole('button', { name: '显示整个工作流面板' }))
    .toBeVisible()
  await page.screenshot({
    path: resolve(ARTIFACT_DIR, 'desktop-workflow-hidden.png'),
    animations: 'disabled'
  })

  await page.reload()
  await expect(workspace).toHaveAttribute(
    'data-workflow-panel-visible',
    'false'
  )
  await expect(workflowRegion).toBeHidden()
  await page.getByRole('button', { name: '显示整个工作流面板' }).click()
  await expect(workflowRegion).toBeVisible()

  await page.setViewportSize({ width: 680, height: 820 })
  await expect(materialRegion).toBeVisible()
  await expect(workflowRegion).toBeVisible()
  const materialBounds = await materialRegion.boundingBox()
  const workflowBounds = await workflowRegion.boundingBox()
  expect(materialBounds).not.toBeNull()
  expect(workflowBounds).not.toBeNull()
  expect(workflowBounds!.y).toBeGreaterThan(materialBounds!.y)
  expect(Math.abs(workflowBounds!.x - materialBounds!.x)).toBeLessThan(2)
  await page.screenshot({
    path: resolve(ARTIFACT_DIR, 'compact-workflow-visible.png'),
    animations: 'disabled'
  })
  await workflowRegion.getByRole('button', {
    name: '隐藏整个工作流面板'
  }).click()
  await expect(materialRegion).toBeVisible()
  await expect(workflowRegion).toBeHidden()
  await page.getByRole('button', { name: '显示整个工作流面板' }).click()
  await expect(materialRegion).toBeVisible()
  await expect(workflowRegion).toBeVisible()

  expect(browserErrors).toEqual([])
})

/**
 * 安装物料与工作流空目录所需的只读 OS HTTP 夹具。
 *
 * @param page Playwright 隔离页面。
 * @returns 所有路由注册完成后返回。
 * @safety 不接触真实设备或运行接口，未声明路径明确返回 404。
 */
async function installReadOnlyApi(page: Page): Promise<void> {
  await page.route(`${API_URL}/api/v1/**`, async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/v1/health') {
      await route.fulfill({ json: { code: 0, data: { status: 'ok' } } })
      return
    }
    if (url.pathname === '/api/v1/materials/graph') {
      await route.fulfill({ json: { code: 0, data: { nodes: [] } } })
      return
    }
    if (url.pathname === '/api/v1/material-shapes') {
      await route.fulfill({ json: { code: 0, data: { items: [] } } })
      return
    }
    if (url.pathname === '/api/v1/resource-templates') {
      await route.fulfill({
        json: { code: 0, data: { revision: 'fixture-1', items: [] } }
      })
      return
    }
    if (url.pathname === '/api/v1/workflow-node-templates') {
      await route.fulfill({
        json: {
          code: 0,
          data: {
            authority: { authority_id: 'fixture', kind: 'local' },
            catalog_fingerprint: `sha256:${'a'.repeat(64)}`,
            total: 0,
            page: 1,
            page_size: 100,
            items: []
          }
        }
      })
      return
    }
    if (url.pathname === '/api/v1/workflows') {
      await route.fulfill({
        json: {
          code: 0,
          data: { items: [], total: 0, page: 1, page_size: 100 }
        }
      })
      return
    }
    if (
      url.pathname === '/api/v1/monitor/events' ||
      url.pathname === '/api/v1/events'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: 'retry: 60000\n\n'
      })
      return
    }
    await route.fulfill({
      status: 404,
      json: { code: 404, message: `未配置测试路由：${url.pathname}` }
    })
  })
}
