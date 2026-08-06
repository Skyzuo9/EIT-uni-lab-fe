import { expect, test, type Page } from '@playwright/test'

import {
  startPersistentAuthoringOs,
  type PersistentAuthoringOs
} from './helpers/persistent-authoring-os'

let os: PersistentAuthoringOs

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  os = await startPersistentAuthoringOs()
})

test.afterAll(async () => {
  await os?.stop()
})

test('工作流未修改时切换模块不显示保存提示', async ({ page }) => {
  const dialogMessages: string[] = []
  page.on('dialog', (dialog) => {
    dialogMessages.push(dialog.message())
    void dialog.dismiss()
  })

  await openApplication(page)
  const navigation = page.getByRole('navigation', { name: '主导航' })
  const workflowButton = navigation.getByRole('button', { name: '工作流' })
  const materialButton = navigation.getByRole('button', { name: '物料' })

  await workflowButton.click()
  await expect(page.getByRole('tabpanel', { name: '工作流' })).toBeVisible()
  await materialButton.click()

  expect(dialogMessages).toEqual([])
  await expect(materialButton).toHaveAttribute('aria-current', 'page')
})

test('工作流有修改时切换模块不弹窗，离开页面仍提示保存', async ({ page }) => {
  const dialogMessages: string[] = []
  page.on('dialog', (dialog) => {
    dialogMessages.push(dialog.message())
    void dialog.dismiss()
  })

  await openApplication(page)
  const navigation = page.getByRole('navigation', { name: '主导航' })
  const workflowButton = navigation.getByRole('button', { name: '工作流' })
  const materialButton = navigation.getByRole('button', { name: '物料' })
  const deviceButton = navigation.getByRole('button', { name: '仪器设备' })

  await workflowButton.click()
  await editWorkflow(page)
  await materialButton.click()
  await expect(materialButton).toHaveAttribute('aria-current', 'page')

  await deviceButton.click()
  await expect(deviceButton).toHaveAttribute('aria-current', 'page')

  await workflowButton.click()
  await expect(workflowButton).toHaveAttribute('aria-current', 'page')
  await expect(
    page.locator('span:visible', { hasText: /^● 未保存$/ })
  ).toBeVisible()
  expect(dialogMessages).toEqual([])

  const beforeUnloadPrevented = await page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true })
    return {
      dispatchResult: globalThis.dispatchEvent(event),
      defaultPrevented: event.defaultPrevented
    }
  })
  expect(beforeUnloadPrevented).toEqual({
    dispatchResult: false,
    defaultPrevented: true
  })
})

async function openApplication(page: Page) {
  const activeWorkflowStorageKey = `unilab.workflow.active.${
    encodeURIComponent(`local-python:${os.url}`)
  }.v1`
  await page.addInitScript(
    ({ storageKey, workflowUuid }) => {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ version: 1, workflowId: workflowUuid })
      )
    },
    {
      storageKey: activeWorkflowStorageKey,
      workflowUuid: os.workflowUuid
    }
  )
  await page.goto(
    `/?enable=materialNav&localOsUrl=${encodeURIComponent(os.url)}`
  )
}

async function editWorkflow(page: Page) {
  const codeViewButton = page.getByRole('button', {
    name: '代码',
    exact: true
  })
  if (await codeViewButton.isVisible()) {
    await codeViewButton.click()
  }
  const editor = page.locator('.cm-content:visible')
  await editor.click()
  await page.keyboard.press('Control+End')
  await page.keyboard.insertText('\n ')
  await expect(
    page.locator('span:visible', { hasText: /^● 未保存$/ })
  ).toBeVisible()
}
