import { expect, test, type Page } from '@playwright/test'

test('工作流未修改时切换模块不显示保存提示', async ({ page }) => {
  const dialogMessages: string[] = []
  page.on('dialog', (dialog) => {
    dialogMessages.push(dialog.message())
    void dialog.dismiss()
  })

  await page.goto('/?enable=materialNav')
  const navigation = page.getByRole('navigation', { name: '主导航' })
  const workflowButton = navigation.getByRole('button', { name: '工作流' })
  const materialButton = navigation.getByRole('button', { name: '物料' })

  await workflowButton.click()
  await expect(page.getByText('完整控制流 DAG')).toBeVisible()
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

  await page.goto('/?enable=materialNav')
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
