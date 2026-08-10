import {
  expect,
  test,
  type Locator,
  type Page,
  type TestInfo
} from '@playwright/test'

import {
  startPersistentAuthoringOs,
  type PersistentAuthoringOs
} from './helpers/persistent-authoring-os'
import { installWorkflowPanel } from './helpers/workflow-runtime-ui'

let os: PersistentAuthoringOs

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  os = await startPersistentAuthoringOs()
})

test.afterAll(async () => {
  await os?.stop()
})

/**
 * 验证紧凑工作流（Workflow）画布在桌面和窄视口下保持可用，并尊重用户缩放。
 *
 * @param page 连接真实 OS 创作接口的浏览器页面。
 * @param testInfo 提供不写入源码树的截图输出目录。
 * @returns 两种视口的视觉证据以及布局、筛选和缩放断言。
 */
async function verifyWorkflowCanvasUx(
  page: Page,
  testInfo: TestInfo
): Promise<void> {
  testInfo.setTimeout(120_000)
  await installWorkflowPanel(page, os.workflowUuid)
  await page.goto(
    `/?section=workflow&localOsUrl=${encodeURIComponent(os.url)}`
  )
  const workflowPanel = page.locator(
    '[data-panel-type="workflow-dag"]' +
      '[data-panel-instance-id="runtime-workflow"]'
  )
  await expect(workflowPanel.getByText('完整控制流 DAG')).toBeVisible()
  const canvasMode = workflowPanel.getByRole('button', {
    name: '画布模式',
    exact: true
  })
  await canvasMode.click()
  await expect(canvasMode).toHaveAttribute('aria-pressed', 'true')

  const toolbar = workflowPanel.locator('.persistent-authoring__toolbar')
  const stageHeader = workflowPanel.locator(
    '.persistent-authoring__stage-header'
  )
  const runtime = workflowPanel.locator('.persistent-authoring__runtime')
  const toolbarHeight = Number.parseFloat(
    await toolbar.evaluate((element) => getComputedStyle(element).height)
  )
  const stageHeaderHeight = Number.parseFloat(
    await stageHeader.evaluate((element) => getComputedStyle(element).height)
  )
  const runtimeBox = await runtime.boundingBox()
  expect(toolbarHeight).toBeLessThanOrEqual(55)
  expect(stageHeaderHeight).toBeLessThanOrEqual(52)
  expect(runtimeBox?.height).toBeLessThanOrEqual(100)

  const palette = workflowPanel.getByRole('complementary', {
    name: '工作流（Workflow）节点库'
  })
  const search = palette.getByPlaceholder('搜索名称或类型')
  const paletteKinds = palette.getByRole('group', {
    name: '节点模板分类'
  })
  await expect(search).toBeVisible()
  await expect(paletteKinds.getByRole('button', { name: /^全部 \d+$/ }))
    .toBeVisible()
  await expect(paletteKinds.getByRole('button', { name: /^物料 \d+$/ }))
    .toBeVisible()
  await expect(paletteKinds.getByRole('button', { name: /^操作 \d+$/ }))
    .toBeVisible()
  await expect(paletteKinds.getByRole('button', { name: /^子工作流 \d+$/ }))
    .toBeVisible()

  await search.fill('site')
  await expect(palette.getByRole('button', { name: /物料来源/ })).toBeVisible()
  await search.fill('')

  await workflowPanel.screenshot({
    path: testInfo.outputPath('workflow-canvas-desktop.png'),
    animations: 'disabled'
  })

  const viewport = workflowPanel.locator('.react-flow__viewport')
  const transformBeforeZoom = await viewport.getAttribute('style')
  await workflowPanel.locator('.react-flow__controls-zoomin').click()
  await expect.poll(() => viewport.getAttribute('style'))
    .not.toBe(transformBeforeZoom)
  const transformAfterZoom = await viewport.getAttribute('style')
  await workflowPanel.getByRole('button', {
    name: '隐藏节点库',
    exact: true
  }).click()
  await page.waitForTimeout(300)
  expect(await viewport.getAttribute('style')).toBe(transformAfterZoom)
  const closedCanvasLayout = await workflowPanel.locator(
    '.persistent-authoring__canvas-body'
  ).evaluate((element) => {
    const graphStage = element.querySelector(
      '.persistent-authoring__graph-stage'
    )
    if (!(graphStage instanceof HTMLElement)) {
      throw new Error('节点库收起后缺少工作流画布区域')
    }
    return {
      bodyWidth: element.getBoundingClientRect().width,
      graphWidth: graphStage.getBoundingClientRect().width,
      columns: getComputedStyle(element).gridTemplateColumns
    }
  })
  expect(
    closedCanvasLayout.graphWidth,
    JSON.stringify(closedCanvasLayout)
  ).toBeGreaterThanOrEqual(closedCanvasLayout.bodyWidth - 2)

  await page.setViewportSize({ width: 720, height: 900 })
  await workflowPanel.getByRole('button', {
    name: '显示节点库',
    exact: true
  }).click()
  await expect(search).toBeVisible()
  const narrowPaletteBox = await palette.boundingBox()
  expect(narrowPaletteBox?.width).toBeLessThanOrEqual(280)
  await workflowPanel.screenshot({
    path: testInfo.outputPath('workflow-canvas-narrow.png'),
    animations: 'disabled'
  })
}

/**
 * 读取 React Flow 视口当前的缩放比例。
 *
 * @param viewport 工作流（Workflow）画布的 React Flow 视口元素。
 * @returns 内联 transform 中冻结的有限正数缩放比例。
 * @throws 视口尚未产生可解析缩放时抛出诊断错误。
 */
async function readWorkflowViewportZoom(viewport: Locator): Promise<number> {
  const transform = await viewport.getAttribute('style')
  const match = transform?.match(/scale\(([-\d.]+)\)/)
  const zoom = Number(match?.[1])
  if (!Number.isFinite(zoom) || zoom <= 0) {
    throw new Error(`工作流画布缺少有效缩放：${transform ?? '<null>'}`)
  }
  return zoom
}

/**
 * 验证用户放大画布后，预览和应用物料泳道布局都不会再次自动适应整图。
 *
 * @param page 连接真实 OS 创作接口的浏览器页面。
 * @returns 布局切换与持久化完成后的缩放稳定性断言。
 */
async function verifyLayoutPreservesUserZoom(page: Page): Promise<void> {
  await installWorkflowPanel(page, os.workflowUuid)
  await page.goto(
    `/?section=workflow&localOsUrl=${encodeURIComponent(os.url)}`
  )
  const workflowPanel = page.locator(
    '[data-panel-type="workflow-dag"]' +
      '[data-panel-instance-id="runtime-workflow"]'
  )
  await expect(workflowPanel.getByText('完整控制流 DAG')).toBeVisible()
  const canvasMode = workflowPanel.getByRole('button', {
    name: '画布模式',
    exact: true
  })
  await canvasMode.click()
  await expect(canvasMode).toHaveAttribute('aria-pressed', 'true')
  const viewport = workflowPanel.locator('.react-flow__viewport')
  await page.waitForTimeout(500)
  const initialZoom = await readWorkflowViewportZoom(viewport)
  await workflowPanel.locator('.react-flow__controls-zoomin').click()
  await expect.poll(() => readWorkflowViewportZoom(viewport))
    .toBeGreaterThan(initialZoom)
  const userZoom = await readWorkflowViewportZoom(viewport)

  await workflowPanel.getByLabel('布局策略')
    .selectOption('material-swimlanes')
  await expect(workflowPanel.locator('.react-flow'))
    .toHaveClass(/wf-layout--material-swimlanes/)
  await page.waitForTimeout(700)
  expect(await readWorkflowViewportZoom(viewport)).toBeCloseTo(userZoom, 5)

  await workflowPanel.getByRole('button', {
    name: '应用纵向物料泳道布局'
  }).click()
  await expect(
    workflowPanel.getByText('已应用物料泳道（纵向）布局')
  ).toBeVisible()
  await page.waitForTimeout(700)
  expect(await readWorkflowViewportZoom(viewport)).toBeCloseTo(userZoom, 5)
}

test(
  '画布布局、节点库和用户缩放在真实 OS 下保持稳定',
  async ({ page }, testInfo) => verifyWorkflowCanvasUx(page, testInfo)
)

test(
  '预览并应用布局时保留用户缩放',
  async ({ page }) => verifyLayoutPreservesUserZoom(page)
)
