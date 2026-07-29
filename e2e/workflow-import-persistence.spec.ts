import { expect, test } from '@playwright/test'
import { resolve } from 'node:path'

import { startOfflineLocalBridge } from './helpers/offline-local-bridge'

test('已保存的导入工作流在切换模块后仍然保留', async ({ page }) => {
  const profilePath = resolve(
    process.cwd(),
    'e2e/fixtures/host-node-test-latency/profile.yaml'
  )
  const bridge = await startOfflineLocalBridge(0, [profilePath])

  try {
    await page.goto(`/?localOsUrl=${encodeURIComponent(bridge.url)}`)
    await page.getByText('工作流', { exact: true }).first().click()
    await page.locator('input[type="file"]').setInputFiles({
      name: 'persisted-workflow.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(IMPORTED_WORKFLOW))
    })

    await expect(page.locator('.cm-content')).toContainText(
      '"workflow_id": "persistence-e2e"'
    )
    await page.getByRole('button', { name: '保存修订版本' }).click()
    await expect(page.getByText(/已保存修订版本/)).toBeVisible()

    await page.getByText('物料', { exact: true }).first().click()
    await expect(
      page.locator('[data-panel-type="layout-unified"]')
    ).toBeVisible()

    await page.getByText('工作流', { exact: true }).first().click()
    await expect(
      page.locator('[data-panel-type="workflow-dag"]')
    ).toBeVisible()
    await expect(page.locator('.cm-content')).toContainText(
      '"workflow_id": "persistence-e2e"'
    )
  } finally {
    await bridge.stop()
  }
})

const IMPORTED_WORKFLOW = {
  name: 'Persistence E2E',
  target_lab_uuid: 'fixture-lab',
  data: {
    workflow_uuid: 'persistence-e2e',
    workflow_name: 'Persistence E2E',
    nodes: [
      {
        uuid: 'persisted-node',
        name: 'test_latency',
        type: 'ILab',
        pose: { position: { x: 120, y: 80, z: 0 } },
        param: {},
        lab_node_type: 'Device',
        template_name: 'test_latency',
        device_name: 'host_node'
      }
    ],
    edges: []
  }
}
