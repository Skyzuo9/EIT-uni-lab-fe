import { expect, test, type Page } from '@playwright/test'

import {
  F05_MOUNT_MATERIAL_UUID,
  startF05MaterialSourceRealOs,
  type F05MaterialSourceRealOs
} from './helpers/f05-material-source-real-os'
import { installWorkflowPanel } from './helpers/workflow-runtime-ui'

let os: F05MaterialSourceRealOs

test.describe.configure({ mode: 'serial', timeout: 240_000 })

/** 启动包含真实物料来源（MaterialSource）目录的隔离操作系统（OS）。 */
test.beforeAll(async () => {
  os = await startF05MaterialSourceRealOs()
}, 150_000)

/** 停止隔离操作系统（OS）并回收临时工作区。 */
test.afterAll(async () => {
  await os?.stop()
})

test(
  '候选先于物料目录更新时运行入口自动重读并进入任务输入',
  runMaterialSourceRefreshAcceptance
)

/**
 * 令首次公共物料图缺少候选挂载点，证明启动时会重读而非永久关闭。
 *
 * @param page 连接真实前端与真实操作系统（OS）的浏览器页面。
 * @returns 不创建工作流任务（WorkflowTask），只保留已应用工作流修订。
 */
async function runMaterialSourceRefreshAcceptance({
  page
}: { page: Page }): Promise<void> {
  let materialGraphReads = 0
  await page.route('**/api/v1/materials/graph*', async (route) => {
    materialGraphReads += 1
    const response = await route.fetch()
    if (materialGraphReads !== 1) {
      await route.fulfill({ response })
      return
    }
    const envelope = await response.json() as {
      data?: { nodes?: unknown[] }
    }
    if (Array.isArray(envelope.data?.nodes)) {
      envelope.data.nodes = envelope.data.nodes.filter(
        (node) => !JSON.stringify(node).includes(F05_MOUNT_MATERIAL_UUID)
      )
    }
    await route.fulfill({ response, json: envelope })
  })

  await installWorkflowPanel(page, os.workflowUuid)
  await page.goto(
    `/?section=workflow&localOsUrl=${encodeURIComponent(os.url)}`
  )
  const panel = page.locator(
    '[data-panel-type="workflow-dag"][data-panel-instance-id="runtime-workflow"]'
  )
  await expect(panel.getByText('完整控制流 DAG')).toBeVisible()
  await panel.getByRole('button', {
    name: /^(开始运行|应用并运行)$/
  }).click()

  const fullSourceDiff = page.getByRole('dialog', {
    name: '完整 Python 差异'
  })
  const taskInput = page.getByLabel('工作流运行输入表单')
  await expect(fullSourceDiff.or(taskInput)).toBeVisible()
  if (await fullSourceDiff.isVisible()) {
    await fullSourceDiff.getByRole('button', {
      name: '接受完整差异并保存',
      exact: true
    }).click()
  }

  await expect(taskInput).toBeVisible()
  expect(materialGraphReads).toBeGreaterThanOrEqual(2)
  await expect(page.getByText(/物料来源目录.*引用已失效/)).toBeHidden()
  await taskInput.getByRole('button', { name: '取消', exact: true }).click()
}
