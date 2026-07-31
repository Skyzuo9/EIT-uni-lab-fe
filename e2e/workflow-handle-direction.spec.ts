import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { startOfflineLocalBridge } from './helpers/offline-local-bridge'

test('节点连线端点跟随工作流布局方向', async ({ page }) => {
  const profilePath = resolve(
    process.cwd(),
    'e2e/fixtures/host-node-test-latency/profile.yaml'
  )
  const bridge = await startOfflineLocalBridge(0, [profilePath])
  const artifactDir = resolve(process.cwd(), '../e2e-artifacts')

  try {
    await page.goto(`/?localOsUrl=${encodeURIComponent(bridge.url)}`)
    await page.getByText('工作流', { exact: true }).first().click()

    await importWorkflow(page, horizontalWorkflow)
    await expect(page.locator('.react-flow__handle-left')).toHaveCount(2)
    await expect(page.locator('.react-flow__handle-right')).toHaveCount(2)
    await expect(page.locator('.react-flow__handle-top')).toHaveCount(0)
    await expect(page.locator('.react-flow__handle-bottom')).toHaveCount(0)

    mkdirSync(artifactDir, { recursive: true })
    await page.locator('.workflow-runtime__stage').screenshot({
      path: resolve(artifactDir, 'workflow-handles-horizontal.png'),
      animations: 'disabled'
    })

    await importWorkflow(page, verticalWorkflow)
    await expect(page.locator('.react-flow__handle-top')).toHaveCount(2)
    await expect(page.locator('.react-flow__handle-bottom')).toHaveCount(2)
    await expect(page.locator('.react-flow__handle-left')).toHaveCount(0)
    await expect(page.locator('.react-flow__handle-right')).toHaveCount(0)
    await page.locator('.workflow-runtime__stage').screenshot({
      path: resolve(artifactDir, 'workflow-handles-vertical.png'),
      animations: 'disabled'
    })
  } finally {
    await bridge.stop()
  }
})

async function importWorkflow(
  page: Page,
  workflow: typeof horizontalWorkflow
): Promise<void> {
  await page.locator('input[type="file"]').setInputFiles({
    name: `${workflow.workflow_id}.json`,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(workflow))
  })
  await expect(page.locator('.react-flow__node-wfNode')).toHaveCount(2)
}

const workflowBase = {
  schema_version: '2',
  revision_id: 'handle-direction-revision',
  invocations: [
    {
      node_id: 'first',
      action_ref: 'host_node.test_latency',
      name: '第一个节点'
    },
    {
      node_id: 'second',
      action_ref: 'host_node.test_latency',
      name: '第二个节点'
    }
  ],
  control_edges: [
    {
      edge_id: 'first-to-second',
      source: 'first',
      target: 'second'
    }
  ]
}

const horizontalWorkflow = {
  ...workflowBase,
  workflow_id: 'horizontal-handles',
  layout: {
    nodes: {
      first: { x: 40, y: 120 },
      second: { x: 420, y: 120 }
    }
  }
}

const verticalWorkflow = {
  ...workflowBase,
  workflow_id: 'vertical-handles',
  layout: {
    nodes: {
      first: { x: 180, y: 40 },
      second: { x: 180, y: 340 }
    }
  }
}
