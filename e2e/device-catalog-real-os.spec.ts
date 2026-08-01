import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { expect, test } from '@playwright/test'

const API_URL =
  process.env.UNILAB_E2E_DEVICE_API_URL ?? 'http://127.0.0.1:8014'

test('existing device UI reads the Edge-owned catalog through the real OS bridge', async ({
  page,
  request
}) => {
  const artifactDirectory = resolve(
    process.env.UNILAB_E2E_ARTIFACT_DIR ||
      resolve(process.cwd(), '../e2e-artifacts/device-catalog-v1')
  )
  mkdirSync(artifactDirectory, { recursive: true })
  const browserErrors: string[] = []
  const apiRequests: Array<{ method: string; path: string }> = []

  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('pageerror', (error) => browserErrors.push(error.message))
  page.on('request', (incoming) => {
    if (!incoming.url().startsWith(API_URL)) return
    apiRequests.push({
      method: incoming.method(),
      path: new URL(incoming.url()).pathname
    })
  })

  const health = await request.get(`${API_URL}/api/v1/health`)
  expect(health.ok()).toBe(true)
  expect(await health.json()).toEqual({ status: 'ok' })
  const catalog = await request.get(`${API_URL}/api/v1/devices`)
  expect(catalog.ok()).toBe(true)
  const catalogBody = (await catalog.json()) as {
    schemaVersion?: string
    source?: string
    items?: unknown[]
  }
  expect(catalogBody.schemaVersion).toBe('device-catalog/v1')
  expect(catalogBody.source).toBe('edge')
  expect(catalogBody.items?.length).toBeGreaterThan(0)

  await page.goto(
    `/?section=device&localOsUrl=${encodeURIComponent(API_URL)}`
  )

  const devicePanel = page.locator('.edge-device')
  const deviceList = page.getByRole('complementary', {
    name: 'Edge 设备列表'
  })
  const workspace = page.locator('.edge-device__workspace')
  await expect(
    devicePanel.getByText('Edge 已连接', { exact: true })
  ).toBeVisible()
  await expect(deviceList.getByText(/1 台设备 · Edge 实时上报/)).toBeVisible()
  await expect(deviceList.getByText('host_node', { exact: true })).toBeVisible()
  await expect(workspace.getByText('本地', { exact: true })).toBeVisible()
  await expect(workspace.getByText('在线', { exact: true })).toBeVisible()
  await expect(
    workspace.locator('.edge-device__action-node').first()
  ).toBeVisible()

  await page.screenshot({
    path: join(artifactDirectory, '01-device-catalog-loaded.png'),
    fullPage: true,
    animations: 'disabled'
  })
  await deviceList.screenshot({
    path: join(artifactDirectory, '02-edge-device-list.png'),
    animations: 'disabled'
  })
  await workspace.locator('.edge-device__identity').screenshot({
    path: join(artifactDirectory, '03-device-identity-and-online-state.png'),
    animations: 'disabled'
  })
  await workspace.locator('.edge-device__action-section').screenshot({
    path: join(artifactDirectory, '04-edge-action-catalog.png'),
    animations: 'disabled'
  })

  const actionNodes = workspace.locator('.edge-device__action-node')
  expect(await actionNodes.count()).toBeGreaterThan(1)
  await actionNodes.nth(1).click()
  const parameterSection = workspace.locator('.edge-device__debug-section')
  await expect(
    parameterSection.getByText('动作参数预览', { exact: true })
  ).toBeVisible()
  await expect(
    parameterSection.getByRole('button', { name: '请在工作流中运行' })
  ).toBeDisabled()
  await parameterSection.screenshot({
    path: join(artifactDirectory, '05-action-parameter-form.png'),
    animations: 'disabled'
  })

  await deviceList.getByRole('button', { name: '刷新' }).click()
  await expect(deviceList.getByRole('button', { name: '刷新' })).toBeEnabled()
  await page.screenshot({
    path: join(artifactDirectory, '06-catalog-refreshed.png'),
    fullPage: true,
    animations: 'disabled'
  })

  expect(apiRequests).toEqual(
    expect.arrayContaining([
      { method: 'GET', path: '/api/v1/health' },
      { method: 'GET', path: '/api/v1/devices' }
    ])
  )
  expect(
    apiRequests.some(
      (entry) => entry.path === '/api/v1/workflow-node-templates'
    )
  ).toBe(false)
  expect(browserErrors).toEqual([])

  writeFileSync(
    join(artifactDirectory, 'network-ledger.json'),
    `${JSON.stringify({ apiUrl: API_URL, requests: apiRequests }, null, 2)}\n`
  )
})
