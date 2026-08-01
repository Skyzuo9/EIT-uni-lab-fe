import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { expect, test, type APIRequestContext } from '@playwright/test'

const API_URL =
  process.env.UNILAB_E2E_DEVICE_API_URL ?? 'http://127.0.0.1:8014'
const DEVICE_ID = 'TestAction1'
const ACTION_NAME = 'test_hold'
const ACTION_REF = `${DEVICE_ID}.${ACTION_NAME}`

interface CatalogAction {
  actionRef: string
  busy: boolean
  currentJobId: string | null
}

interface CatalogDevice {
  id: string
  actions: CatalogAction[]
}

interface DeviceCatalog {
  items: CatalogDevice[]
}

async function readTargetAction(
  request: APIRequestContext
): Promise<CatalogAction | null> {
  const response = await request.get(`${API_URL}/api/v1/devices`)
  if (!response.ok()) return null
  const catalog = (await response.json()) as DeviceCatalog
  return catalog.items
    .find((device) => device.id === DEVICE_ID)
    ?.actions.find((action) => action.actionRef === ACTION_REF) ?? null
}

test('operator detects and manually unlocks a real Edge action lock', async ({
  page,
  request
}) => {
  const artifactDirectory = resolve(
    process.env.UNILAB_E2E_ARTIFACT_DIR
      || resolve(process.cwd(), '../e2e-artifacts/device-manual-unlock')
  )
  mkdirSync(artifactDirectory, { recursive: true })
  const browserErrors: string[] = []
  const apiRequests: Array<{ method: string; path: string }> = []
  const commandBodies: unknown[] = []

  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('pageerror', (error) => browserErrors.push(error.message))
  page.on('request', (incoming) => {
    if (!incoming.url().startsWith(API_URL)) return
    const path = new URL(incoming.url()).pathname
    apiRequests.push({
      method: incoming.method(),
      path
    })
    if (incoming.method() === 'POST' && path.endsWith('/commands')) {
      commandBodies.push(incoming.postDataJSON())
    }
  })

  const initialAction = await readTargetAction(request)
  expect(initialAction, `${ACTION_REF} must exist in the real OS catalog`).not.toBeNull()
  expect(initialAction?.busy).toBe(false)

  const runResponse = await request.post(`${API_URL}/api/v1/runtime/runs`, {
    data: {
      source: {
        format: 'workflow_revision_v2',
        revision: {
          schema_version: '2',
          revision_id: 'device-manual-unlock-e2e-rev',
          workflow_id: 'device-manual-unlock-e2e',
          invocations: [
            {
              node_id: 'test-hold-lock-holder',
              action_ref: ACTION_REF,
              name: '设备锁真实链路 E2E',
              input_bindings: {
                duration_seconds: { kind: 'literal', value: 30 }
              }
            }
          ],
          control_edges: []
        }
      }
    }
  })
  expect(runResponse.ok(), await runResponse.text()).toBe(true)

  await expect.poll(async () => {
    const action = await readTargetAction(request)
    return action?.busy && action.currentJobId
      ? action.currentJobId
      : null
  }, {
    message: `${ACTION_REF} should expose a full lock holder through GET /api/v1/devices`,
    timeout: 10_000
  }).toBe('test-hold-lock-holder')

  await page.goto(
    `/?section=device&localOsUrl=${encodeURIComponent(API_URL)}`
  )

  const devicePanel = page.locator('.edge-device')
  const deviceList = page.getByRole('complementary', {
    name: 'Edge 设备列表'
  })
  const workspace = page.locator('.edge-device__workspace')
  const deviceButton = deviceList.getByRole('button', {
    name: new RegExp(DEVICE_ID)
  })
  await expect(deviceButton).toBeVisible()

  await page.screenshot({
    path: join(artifactDirectory, '01-locked-device-detected.png'),
    fullPage: true,
    animations: 'disabled'
  })
  await deviceButton.screenshot({
    path: join(artifactDirectory, '02-device-list-lock-badge.png'),
    animations: 'disabled'
  })

  await deviceButton.click()
  await expect(
    workspace.getByText('已锁定 · 1 个动作', { exact: true })
  ).toBeVisible()
  await workspace.locator('.edge-device__identity').screenshot({
    path: join(artifactDirectory, '03-device-header-lock-state.png'),
    animations: 'disabled'
  })

  const actionButton = workspace.getByRole('button', {
    name: new RegExp(`${ACTION_NAME} 动作节点`)
  })
  await expect(actionButton).toContainText('占用中')
  await actionButton.click()
  await workspace.locator('.edge-device__action-section').screenshot({
    path: join(artifactDirectory, '04-action-catalog-busy-state.png'),
    animations: 'disabled'
  })

  const lockPanel = workspace.getByLabel('设备动作锁状态')
  await expect(lockPanel.getByText('此动作被设备锁占用')).toBeVisible()
  await expect(lockPanel.getByText('Job test-hol')).toBeVisible()
  await expect(
    lockPanel.getByRole('button', { name: '手动解锁' })
  ).toBeVisible()
  await lockPanel.screenshot({
    path: join(artifactDirectory, '05-lock-holder-and-manual-action.png'),
    animations: 'disabled'
  })

  await lockPanel.getByRole('button', { name: '手动解锁' }).click()
  const dialog = page.getByRole('dialog', { name: '确认手动解锁' })
  const confirmButton = dialog.getByRole('button', { name: '确认并解锁' })
  await expect(dialog.getByText(ACTION_REF, { exact: true })).toBeVisible()
  await expect(
    dialog.getByText('test-hold-lock-holder', { exact: true })
  ).toBeVisible()
  await expect(confirmButton).toBeDisabled()
  await dialog.screenshot({
    path: join(artifactDirectory, '06-safety-confirmation-required.png'),
    animations: 'disabled'
  })

  await dialog.getByRole('checkbox').check()
  await expect(confirmButton).toBeEnabled()
  await dialog.screenshot({
    path: join(artifactDirectory, '07-safety-confirmation-accepted.png'),
    animations: 'disabled'
  })

  await confirmButton.click()
  await expect(dialog).not.toBeVisible()
  await expect(
    workspace.getByText('动作锁已释放', { exact: true })
  ).toBeVisible()
  await expect(actionButton).toContainText('空闲')
  await page.screenshot({
    path: join(artifactDirectory, '08-os-confirmed-unlocked.png'),
    fullPage: true,
    animations: 'disabled'
  })
  await workspace.locator('.edge-device__debug-section').screenshot({
    path: join(artifactDirectory, '09-action-ready-after-refetch.png'),
    animations: 'disabled'
  })

  await expect.poll(async () => {
    const action = await readTargetAction(request)
    return action
      ? { busy: action.busy, currentJobId: action.currentJobId }
      : null
  }).toEqual({ busy: false, currentJobId: null })

  const commandPath =
    `/api/v1/devices/${DEVICE_ID}/actions/${ACTION_NAME}/commands`
  expect(apiRequests).toEqual(expect.arrayContaining([
    { method: 'GET', path: '/api/v1/devices' },
    { method: 'POST', path: commandPath }
  ]))
  expect(commandBodies).toEqual([{
    command: 'force_unlock',
    expectedJobId: 'test-hold-lock-holder',
    reason: 'operator_confirmed_device_safe'
  }])
  expect(browserErrors).toEqual([])

  writeFileSync(
    join(artifactDirectory, 'network-ledger.json'),
    `${JSON.stringify({
      apiUrl: API_URL,
      actionRef: ACTION_REF,
      requests: apiRequests,
      commandBodies
    }, null, 2)}\n`
  )
})
