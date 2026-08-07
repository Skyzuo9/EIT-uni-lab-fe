import { mkdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

import {
  startPersistentAuthoringOs,
  type PersistentAuthoringOs
} from './helpers/persistent-authoring-os'
import { saveWorkflowDraftOnly } from './helpers/workflow-runtime-ui'

const artifactDirectory = resolve(
  process.env.UNILAB_E2E_ARTIFACT_DIR ||
    resolve(process.cwd(), '../e2e-artifacts/workflow-import-mismatch')
)
let os: PersistentAuthoringOs

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  mkdirSync(artifactDirectory, { recursive: true })
  os = await startPersistentAuthoringOs()
})

test.afterAll(async () => {
  await os?.stop()
})

test('shows one actionable dialog and hands imported Python to its workflow', async ({
  page
}) => {
  test.setTimeout(90_000)
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('pageerror', (error) => browserErrors.push(error.message))
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showOpenFilePicker', {
      configurable: true,
      value: undefined
    })
  })
  await selectWorkflow(page, os.workflowUuid, os.url)

  const panel = page.getByRole('tabpanel', { name: '工作流' })
  const importedSource = `${readFileSync(os.secondSourcePath, 'utf8')}
# imported handoff regression
`
  const fileChooser = page.waitForEvent('filechooser')
  await panel.getByRole('button', {
    name: '导入 Python',
    exact: true
  }).click()
  await (await fileChooser).setFiles({
    name: 'another-workflow.py',
    mimeType: 'text/x-python',
    buffer: Buffer.from(importedSource)
  })
  await page.route(
    `${os.url}/api/v1/workflows/${os.workflowUuid}/authoring/draft`,
    async (route) => {
      await route.fulfill({
        status: 200,
        json: {
          code: 3003,
          error: {
            code: 'workflow_identity_mismatch',
            msg: `导入的 Python 声明工作流 ${os.secondWorkflowUuid}，当前编辑的是 ${os.workflowUuid}`
          }
        }
      })
    }
  )
  await saveWorkflowDraftOnly(panel)

  const dialog = page.getByRole('dialog', {
    name: '这个文件属于另一个工作流'
  })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('当前工作流没有被修改')
  await expect(dialog).toContainText(os.workflowUuid)
  await expect(dialog).toContainText(os.secondWorkflowUuid)
  await expect(page.locator('.workflow-runtime__problem')).toHaveCount(0)
  await expect(page.getByText('3003', { exact: true })).toHaveCount(0)
  await dialog.screenshot({
    path: join(artifactDirectory, '01-import-mismatch-desktop.png'),
    animations: 'disabled'
  })

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(dialog).toBeVisible()
  const dialogBounds = await dialog.boundingBox()
  expect(dialogBounds).not.toBeNull()
  expect(dialogBounds!.x).toBeGreaterThanOrEqual(0)
  expect(dialogBounds!.x + dialogBounds!.width).toBeLessThanOrEqual(390)
  await dialog.screenshot({
    path: join(artifactDirectory, '02-import-mismatch-mobile.png'),
    animations: 'disabled'
  })

  await dialog.getByRole('button', {
    name: /^打开「.+」并继续$/
  }).click()
  await expect(panel.getByText(
    'another-workflow.py 已导入为未保存的 Python 草稿',
    { exact: true }
  )).toBeVisible()
  const targetEditor = panel.locator('.cm-content:visible')
  await targetEditor.click()
  await targetEditor.press('Control+End')
  await expect(targetEditor).toContainText('imported handoff regression')
  await expect.poll(
    () => activeWorkflowUuid(page, os.url)
  ).toBe(os.secondWorkflowUuid)
  expect(browserErrors).toEqual([])
})

/** 打开指定工作流（Workflow）的持久编写面板。 */
async function selectWorkflow(
  page: Page,
  workflowUuid: string,
  osUrl: string
): Promise<void> {
  const storageKey = activeWorkflowStorageKey(osUrl)
  await page.addInitScript(
    ({ key, selectedWorkflowUuid }) => {
      localStorage.setItem(
        key,
        JSON.stringify({ version: 1, workflowId: selectedWorkflowUuid })
      )
    },
    { key: storageKey, selectedWorkflowUuid: workflowUuid }
  )
  await page.goto(
    `/?section=workflow&localOsUrl=${encodeURIComponent(osUrl)}`
  )
  await expect(page.getByText('完整控制流 DAG')).toBeVisible()
}

/** 读取浏览器当前持久选择的工作流（Workflow）编号。 */
async function activeWorkflowUuid(
  page: Page,
  osUrl: string
): Promise<string | null> {
  return page.evaluate((storageKey) => {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return null
    return (JSON.parse(raw) as { workflowId?: string }).workflowId ?? null
  }, activeWorkflowStorageKey(osUrl))
}

/** 生成指定本地 OS 连接的工作流（Workflow）选择存储键。 */
function activeWorkflowStorageKey(osUrl: string): string {
  return `unilab.workflow.active.${encodeURIComponent(`local-python:${osUrl}`)}.v1`
}
