import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const ARTIFACT_ROOT = resolve(
  process.cwd(),
  '../e2e-artifacts',
  'device-controls'
)

test.describe('robot and camera device controls', () => {
  test('operator can jog the robot and use the emergency stop locally', async ({
    page
  }) => {
    const browserErrors = observeBrowserErrors(page)
    const deviceRequests: string[] = []
    page.on('request', (request) => {
      if (['fetch', 'xhr', 'websocket'].includes(request.resourceType())) {
        deviceRequests.push(request.url())
      }
    })
    await mockOfflineOs(page)

    await page.goto('/')

    const detail = page.getByRole('main', { name: '设备控制详情' })
    await expect(detail).toBeVisible()
    await expect(
      detail.getByRole('heading', { name: '机械臂', exact: true })
    ).toBeVisible()

    await detail.getByRole('button', { name: '关节', exact: true }).click()
    const jointJog = detail.getByRole('button', {
      name: 'J1+',
      exact: true
    })
    await jointJog.click()
    await expect(detail.getByText('步进 J1+', { exact: true })).toBeVisible()

    await detail.getByRole('button', { name: '急停', exact: true }).click()
    await expect(
      detail.getByRole('button', { name: '释放急停', exact: true })
    ).toBeVisible()
    await expect(jointJog).toBeDisabled()

    await detail
      .getByRole('button', { name: '释放急停', exact: true })
      .click()
    await expect(jointJog).toBeEnabled()

    mkdirSync(ARTIFACT_ROOT, { recursive: true })
    await page.screenshot({
      path: resolve(ARTIFACT_ROOT, 'robot-controls.png'),
      animations: 'disabled',
      fullPage: false
    })

    expect(deviceRequests).toEqual([
      'http://127.0.0.1:8014/health'
    ])
    expect(browserErrors).toEqual([])
  })

  test('operator can configure the camera and capture an image locally', async ({
    page
  }) => {
    const browserErrors = observeBrowserErrors(page)
    await mockOfflineOs(page)

    await page.goto('/')
    await page
      .getByRole('button', { name: /^相机/ })
      .click()

    const detail = page.getByRole('main', { name: '设备控制详情' })
    await expect(
      detail.getByRole('heading', { name: '相机', exact: true })
    ).toBeVisible()

    await detail.getByRole('textbox', { name: '样品 ID' })
      .fill('PTLC-E2E-001')
    await detail.getByRole('textbox', { name: '文件名' })
      .fill('e2e-capture.jpg')
    await detail.getByRole('spinbutton', { name: '曝光时间 (µs)' })
      .fill('500000')
    await detail.getByRole('spinbutton', { name: '增益' }).fill('2')

    await detail
      .getByRole('button', { name: '采集图像', exact: true })
      .click()

    await expect(detail.getByRole('status'))
      .toHaveText(/已采集 · 共 1 张/)

    mkdirSync(ARTIFACT_ROOT, { recursive: true })
    await page.screenshot({
      path: resolve(ARTIFACT_ROOT, 'camera-controls.png'),
      animations: 'disabled',
      fullPage: false
    })

    expect(browserErrors).toEqual([])
  })
})

function observeBrowserErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

async function mockOfflineOs(page: Page): Promise<void> {
  await page.route('http://127.0.0.1:8014/health', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: 'offline fixture'
    })
  )
}
