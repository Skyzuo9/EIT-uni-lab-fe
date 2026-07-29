import { expect, test } from '@playwright/test'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'

import { startOfflineLocalBridge } from './helpers/offline-local-bridge'

test('Cloud 导出 JSON 自动迁移为 Canonical v2 并可完整运行', async ({
  page
}) => {
  test.setTimeout(90_000)
  const fixturePath = process.env.UNILAB_WORKFLOW_IMPORT_FIXTURE
  const source = fixturePath && existsSync(fixturePath)
    ? readFileSync(fixturePath, 'utf8')
    : JSON.stringify(FALLBACK_CLOUD_EXPORT)
  const fileName = fixturePath
    ? basename(fixturePath)
    : 'cloud-workflow-export.json'
  const document = JSON.parse(source) as {
    data?: { nodes?: unknown[]; edges?: unknown[] }
  }
  const expectedNodes = document.data?.nodes?.length || 0
  const expectedEdges = document.data?.edges?.length || 0
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

  const profilePath = resolve(
    process.cwd(),
    'e2e/fixtures/host-node-test-latency/profile.yaml'
  )
  const bridge = await startOfflineLocalBridge(0, [profilePath])
  try {
    await page.goto(`/?localOsUrl=${encodeURIComponent(bridge.url)}`)
    await page.getByText('工作流', { exact: true }).first().click()
    await page.locator('input[type="file"]').setInputFiles({
      name: fileName,
      mimeType: 'application/json',
      buffer: Buffer.from(source)
    })

    await expect(
      page.getByText('完整控制流 DAG', { exact: true })
    ).toBeVisible()
    await expect(page.getByText(/已自动迁移并通过 OS 校验/)).toBeVisible()
    await expect(page.locator('.workflow-runtime__stage-header')).toContainText(
      `${expectedNodes} 个节点 · ${expectedEdges} 条控制边`
    )
    await expect(page.locator('.react-flow__node-wfNode')).toHaveCount(
      expectedNodes
    )
    await expect(page.locator('.cm-content')).toContainText(
      '"schema_version": "2"'
    )
    await expect(page.locator('.cm-content')).not.toContainText(
      '"target_lab_uuid"'
    )
    await expect(
      page.getByRole('button', { name: 'Python', exact: true })
    ).toBeEnabled()
    await expect(
      page.getByRole('button', { name: '校验', exact: true })
    ).toBeEnabled()
    await expect(
      page.getByRole('button', { name: '保存修订版本' })
    ).toBeEnabled()
    await expect(
      page.getByRole('button', { name: /调试启动/ })
    ).toBeEnabled()

    await page.getByRole('button', { name: '整图运行', exact: true }).click()
    await page.getByRole('button', { name: /整图执行/ }).click()
    await expect(page.locator('.workflow-runtime__run-state')).toHaveText(
      '整体：已完成',
      { timeout: 30_000 }
    )
    await expect(
      page.locator('.workflow-runtime__node-list button')
    ).toHaveCount(expectedNodes)
    await expect(
      page.locator('.workflow-runtime__node-list button[data-node-state="success"]')
    ).toHaveCount(expectedNodes)

    const artifactDir = resolve(process.cwd(), '../e2e-artifacts')
    mkdirSync(artifactDir, { recursive: true })
    await page.screenshot({
      path: resolve(
        artifactDir,
        'workflow-cloud-import-canonical-completed.png'
      ),
      fullPage: false
    })

    expect(
      apiCalls.some(
        (call) =>
          call.method === 'POST' &&
          call.status === 200 &&
          call.url.endsWith('/api/v1/workflows:validate')
      )
    ).toBe(true)
    expect(
      apiCalls.some(
        (call) =>
          call.method === 'POST' &&
          call.status === 200 &&
          call.url.endsWith('/api/v1/runtime/runs')
      )
    ).toBe(true)
    expect(browserErrors).toEqual([])
  } finally {
    await bridge.stop()
  }
})

const FALLBACK_CLOUD_EXPORT = {
  name: 'Cloud import fixture',
  target_lab_uuid: 'fixture-lab',
  data: {
    workflow_uuid: 'fixture-cloud-workflow',
    workflow_name: 'Cloud import fixture',
    nodes: [
      cloudNode('first', 0, 0),
      cloudNode('second', 280, -120),
      cloudNode('third', 280, 120)
    ],
    edges: [
      cloudEdge('first', 'second'),
      cloudEdge('first', 'third')
    ]
  }
}

function cloudNode(uuid: string, x: number, y: number) {
  return {
    uuid,
    name: 'test_latency',
    type: 'ILab',
    pose: { position: { x, y, z: 0 } },
    param: {},
    lab_node_type: 'Device',
    template_name: 'test_latency',
    device_name: 'host_node'
  }
}

function cloudEdge(source: string, target: string) {
  return {
    source_node_uuid: source,
    target_node_uuid: target,
    source_handle_key: 'ready',
    source_handle_io: 'source',
    target_handle_key: 'ready',
    target_handle_io: 'target'
  }
}
