import { expect, test } from '@playwright/test'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'

import { startOfflineLocalBridge } from './helpers/offline-local-bridge'

test('Cloud 导出 JSON 自动转换为标准工作流格式并可完整运行', async ({
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
  const artifactDir = resolve(process.cwd(), '../e2e-artifacts')
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
    await page.addInitScript(
      ({ content, name }) => {
        const fileWrites: string[] = []
        Object.assign(window, {
          __workflowFileWrites: fileWrites,
          showOpenFilePicker: async () => [
            {
              kind: 'file',
              name,
              getFile: async () => new File(
                [content],
                name,
                { type: 'application/json' }
              ),
              createWritable: async () => ({
                write: async (nextContent: string) => {
                  fileWrites.push(nextContent)
                },
                close: async () => {}
              })
            }
          ]
        })
      },
      { content: source, name: fileName }
    )
    await page.goto(`/?localOsUrl=${encodeURIComponent(bridge.url)}`)
    await page.getByText('工作流', { exact: true }).first().click()
    await page.getByRole('button', { name: '导入 JSON' }).click()

    await expect(
      page.getByText('完整控制流 DAG', { exact: true })
    ).toBeVisible()
    await expect(
      page.getByText(/已转换为标准工作流格式并通过 OS 校验/)
    ).toBeVisible()
    await expect(page.locator('.workflow-runtime__stage-header')).toContainText(
      `${expectedNodes} 个节点 · ${expectedEdges} 条控制边`
    )
    await expect(page.locator('.react-flow__node-wfNode')).toHaveCount(
      expectedNodes
    )
    await expect(
      page.locator('.wf-node__id').first()
    ).toHaveAttribute('title', 'test_latency')
    const operationHelp = page.locator('.workflow-runtime__help')
    await operationHelp.locator('summary').click()
    await expect(operationHelp).not.toContainText('双击')
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
      page.getByRole('button', { name: /整图执行/ })
    ).toBeEnabled()

    const saveButton = page.getByRole('button', {
      name: '保存修订版本'
    })
    await saveButton.click()
    const savePrompt = page.getByRole('dialog', {
      name: '是否同时保存更新后的文件？'
    })
    await expect(savePrompt).toBeVisible()
    await expect(savePrompt).toContainText(fileName)
    mkdirSync(artifactDir, { recursive: true })
    await savePrompt.screenshot({
      path: resolve(artifactDir, 'workflow-save-prompt.png'),
      animations: 'disabled'
    })
    await savePrompt.getByRole('button', {
      name: '仅保存修订'
    }).click()
    await expect(savePrompt).toBeHidden()
    await expect(page.getByText(/已保存修订版本/)).toBeVisible()
    expect(await workflowFileWrites(page)).toEqual([])

    await saveButton.click()
    await expect(savePrompt).toBeVisible()
    await savePrompt.getByRole('button', {
      name: '保存到原文件'
    }).click()
    await expect(
      page.getByText(
        new RegExp(
          `已保存修订版本.*已更新 ${escapeRegex(fileName)}`
        )
      )
    ).toBeVisible()
    const [savedContent] = await workflowFileWrites(page)
    const savedRevision = JSON.parse(
      savedContent
    ) as { schema_version?: string }
    expect(savedRevision.schema_version).toBe('2')

    await page.locator('input[type="file"]').setInputFiles({
      name: fileName,
      mimeType: 'application/json',
      buffer: Buffer.from(source)
    })
    await expect(
      page.getByText(/已转换为标准工作流格式并通过 OS 校验/)
    ).toBeVisible()
    await saveButton.click()
    await expect(savePrompt).toBeVisible()
    await expect(savePrompt).toContainText(
      '没有原文件写入权限，将下载更新后的同名文件'
    )
    const downloadPromise = page.waitForEvent('download')
    await savePrompt.getByRole('button', {
      name: '下载更新文件'
    }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe(fileName)
    const downloadPath = await download.path()
    expect(downloadPath).not.toBeNull()
    const downloadedRevision = JSON.parse(
      readFileSync(downloadPath as string, 'utf8')
    ) as { schema_version?: string }
    expect(downloadedRevision.schema_version).toBe('2')
    await expect(
      page.getByText(new RegExp(`已下载 ${escapeRegex(fileName)}`))
    ).toBeVisible()

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

    await page.getByRole('tab', { name: /事件流/ }).click()
    const firstNodeEvents = page.locator(
      '.workflow-runtime__events em[data-node-id="first"]'
    )
    await expect(firstNodeEvents.first()).toHaveText('test_latency')
    await expect(firstNodeEvents.first()).toHaveAttribute(
      'title',
      '节点 ID：first'
    )

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
    expect(
      apiCalls.filter(
        (call) =>
          call.method === 'PUT' &&
          call.status === 200 &&
          call.url.includes('/api/v1/workflows/')
      )
    ).toHaveLength(3)
    expect(await workflowFileWrites(page)).toHaveLength(1)
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

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function workflowFileWrites(page: import('@playwright/test').Page) {
  return page.evaluate(() => (
    window as unknown as {
      __workflowFileWrites: string[]
    }
  ).__workflowFileWrites)
}
