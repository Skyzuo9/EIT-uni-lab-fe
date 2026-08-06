import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  startSzlabCompositeMaterialWorkflowOs,
  SZLAB_COMPOSITE_MATERIAL_CHILD_WORKFLOW_UUID,
  SZLAB_COMPOSITE_MATERIAL_WORKFLOW_UUID,
  type SzlabMaterialWorkflowOs
} from './helpers/szlab-action-catalog-os'

let os: SzlabMaterialWorkflowOs

test.describe.configure({ mode: 'serial', timeout: 300_000 })
test.use({
  launchOptions: {
    args: [
      '--enable-unsafe-swiftshader',
      '--use-gl=angle',
      '--use-angle=swiftshader-webgl'
    ]
  }
})

/** 启动真实操作系统（OS）HTTP/SSE 夹具，但不连接或启动物理设备。 */
test.beforeAll(async () => {
  os = await startSzlabCompositeMaterialWorkflowOs()
}, 120_000)

/** 停止隔离操作系统（OS），并删除它生成的临时数据库。 */
test.afterAll(async () => {
  await os?.stop()
})

/**
 * 验证真实 OS 编译图到 Pascal 3D 路线的完整前端投影。
 *
 * @param page 连接真实 OS HTTP/SSE 的 Chromium 页面。
 * @returns 五张验收截图，并验证图层关闭、普通工作流切换及隐藏面板归属。
 */
test('projects a real OS material-transfer workflow without cross-panel leakage', async ({
  page
}) => {
  const artifacts = resolve(
    process.env.UNILAB_E2E_ARTIFACT_DIR ??
      resolve(process.cwd(), '../e2e-artifacts/material-transfer-scene-real-os')
  )
  mkdirSync(artifacts, { recursive: true })
  const requests: string[] = []
  const browserErrors: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (request.url().startsWith(os.url) && url.pathname.startsWith('/api/v1/')) {
      requests.push(`${request.method()} ${url.pathname}${url.search}`)
    }
  })
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('pageerror', (error) => browserErrors.push(error.message))

  await installSceneAndWorkflowTabs(page)
  await page.goto(`/?section=material&localOsUrl=${encodeURIComponent(os.url)}`)
  const viewer = page.locator('[data-pascal-viewer-3d]')
  await expect(viewer).toBeVisible({ timeout: 30_000 })
  const transferToggle = page.getByRole('button', {
    name: '物料转运',
    exact: true
  })
  await expect(transferToggle).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('.pascal-transfer-executor')).toHaveCount(0)
  await capture(page, resolve(artifacts, '01-layer-disabled.png'))

  const disabledTransferAuthoringReads = authoringReads(
    requests,
    SZLAB_COMPOSITE_MATERIAL_WORKFLOW_UUID
  )
  expect(disabledTransferAuthoringReads).toBe(
    authoringReads(requests, SZLAB_COMPOSITE_MATERIAL_CHILD_WORKFLOW_UUID)
  )
  const runtimeEventReadsBeforeLayer = runtimeEventReads(requests)
  await transferToggle.click()
  await expect(transferToggle).toHaveAttribute('aria-pressed', 'true')
  const routeSummary = page.locator('.pascal-lab-toolbar__transfer-status')
  await expect(routeSummary).toContainText(
    /^\d+ 条物料转运路线$/,
    { timeout: 30_000 }
  )
  const routeCount = Number((await routeSummary.textContent())?.match(/^\d+/)?.[0])
  expect(routeCount).toBeGreaterThan(0)
  await expect(page.locator('.pascal-transfer-executor')).toHaveCount(routeCount)
  expect(authoringReads(requests, SZLAB_COMPOSITE_MATERIAL_WORKFLOW_UUID))
    .toBe(disabledTransferAuthoringReads)
  expect(runtimeEventReads(requests)).toBe(runtimeEventReadsBeforeLayer)
  await capture(page, resolve(artifacts, '02-real-os-route.png'))

  await page.getByRole('button', { name: '顶视图', exact: true }).click()
  await page.waitForTimeout(600)
  const topViewScreenshot = await capture(
    page,
    resolve(artifacts, '03-top-view.png')
  )
  expect(await screenshotMeanLuminance(page, topViewScreenshot))
    .toBeGreaterThanOrEqual(0.55)

  const runtimeEventReadsBeforePanelSwitch = runtimeEventReads(requests)
  await page.getByRole('tab', { name: '普通工作流', exact: true }).click()
  await expect(page.getByText('选择工作流以显示转运路线', { exact: true }))
    .toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.pascal-transfer-executor')).toHaveCount(0)
  expect(runtimeEventReads(requests)).toBe(runtimeEventReadsBeforePanelSwitch)
  await capture(page, resolve(artifacts, '04-route-free-workflow.png'))

  await page.getByRole('tab', { name: '物料转运工作流', exact: true }).click()
  await expect(routeSummary).toHaveText(`${routeCount} 条物料转运路线`, {
    timeout: 30_000
  })
  await expect(page.locator('.pascal-transfer-executor')).toHaveCount(routeCount)
  await page.getByRole('button', { name: '适配场景', exact: true }).click()
  await page.waitForTimeout(800)
  await capture(page, resolve(artifacts, '05-active-panel-restored.png'))

  expect(requests.some((request) =>
    /^GET \/api\/v1\/workflow-tasks\/[^/?]+\/jobs$/.test(request)
  )).toBe(false)
  expect(browserErrors).toEqual([])
})

/**
 * 安装一个 3D 场景与两个非单例工作流面板的实验室布局。
 *
 * @param page Playwright 页面；初始化脚本会在应用读取本地存储前执行。
 * @returns 无；物料转运图层初始关闭，用来证明关闭态不额外读取编写图。
 */
async function installSceneAndWorkflowTabs(page: Page): Promise<void> {
  await page.addInitScript(({ transferWorkflowUuid, ordinaryWorkflowUuid }) => {
    localStorage.setItem('unilab.panel-layout.lab.v1', JSON.stringify({
      version: 1,
      layout: {
        id: 'real-os-transfer-root',
        type: 'split',
        direction: 'horizontal',
        sizes: [72, 28],
        children: [{
          id: 'real-os-scene-group',
          type: 'group',
          panels: [{
            id: 'real-os-scene',
            panelType: 'layout-unified',
            title: '真实 OS 三维场景'
          }],
          activePanelId: 'real-os-scene'
        }, {
          id: 'real-os-workflow-group',
          type: 'group',
          panels: [{
            id: 'real-os-transfer-workflow',
            panelType: 'workflow-dag',
            title: '物料转运工作流',
            config: { workflow_uuid: transferWorkflowUuid }
          }, {
            id: 'real-os-ordinary-workflow',
            panelType: 'workflow-dag',
            title: '普通工作流',
            config: { workflow_uuid: ordinaryWorkflowUuid }
          }],
          activePanelId: 'real-os-transfer-workflow'
        }]
      }
    }))
    localStorage.setItem('unilab.lab.view-mode', '3d')
    localStorage.setItem('unilab.lab.site-layer-visible', 'true')
    localStorage.setItem('unilab.lab.material-transfer-layer-visible', 'false')
  }, {
    transferWorkflowUuid: SZLAB_COMPOSITE_MATERIAL_WORKFLOW_UUID,
    ordinaryWorkflowUuid: SZLAB_COMPOSITE_MATERIAL_CHILD_WORKFLOW_UUID
  })
}

/**
 * 统计指定工作流（Workflow）的权威编写聚合读取次数。
 *
 * @param requests 浏览器捕获的 OS 请求列表。
 * @param workflowUuid 工作流稳定身份。
 * @returns 精确 authoring GET 次数，不把 SSE 路径计入。
 */
function authoringReads(requests: readonly string[], workflowUuid: string): number {
  return requests.filter((request) =>
    request === `GET /api/v1/workflows/${workflowUuid}/authoring`
  ).length
}

/**
 * 统计工作流运行态全局 SSE 连接请求。
 *
 * @param requests 浏览器捕获的 OS 请求列表。
 * @returns 当前累计连接次数，用于证明图层和标签切换没有新建第二订阅。
 */
function runtimeEventReads(requests: readonly string[]): number {
  return requests.filter((request) => request === 'GET /api/v1/events').length
}

/**
 * 截取统一实验室视图作为 E2E 可视证据。
 *
 * @param page 当前浏览器页面。
 * @param path PNG 目标绝对路径。
 * @returns 写入文件的同一份 PNG 字节，用于可视回归断言。
 */
async function capture(page: Page, path: string): Promise<Buffer> {
  return page.locator('.lab-unified-viewport').screenshot({
    path,
    animations: 'disabled'
  })
}

/**
 * 计算验收截图的平均感知亮度，防止顶视相机只留下 Pascal 深色背景与 HTML 标签。
 *
 * @param page 用于浏览器原生 PNG 解码的 Playwright 页面。
 * @param screenshot 实际统一实验室视图的 PNG 字节。
 * @returns 归一化到 0–1 的平均感知亮度；真实 studio 场景应明显高于深色空场景。
 */
async function screenshotMeanLuminance(
  page: Page,
  screenshot: Buffer
): Promise<number> {
  const dataUrl = `data:image/png;base64,${screenshot.toString('base64')}`
  return page.evaluate(async (source) => {
    const image = new Image()
    image.src = source
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('无法创建截图亮度检测画布')
    context.drawImage(image, 0, 0)
    const pixels = context.getImageData(
      0,
      0,
      canvas.width,
      canvas.height
    ).data
    let luminance = 0
    for (let index = 0; index < pixels.length; index += 4) {
      luminance += (
        0.2126 * pixels[index]!
        + 0.7152 * pixels[index + 1]!
        + 0.0722 * pixels[index + 2]!
      ) / 255
    }
    return luminance / (pixels.length / 4)
  }, dataUrl)
}
