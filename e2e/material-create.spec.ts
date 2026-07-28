import { expect, test } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ARTIFACT_ROOT = resolve(
  process.cwd(),
  '..',
  'e2e-artifacts',
  'materials',
  'create'
)

test('Cloud 结构的物料工作台完成单实例创建', async ({ page }) => {
  mkdirSync(ARTIFACT_ROOT, { recursive: true })
  const browserErrors: string[] = []
  page.on('pageerror', (error) => browserErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })

  await page.goto('/material-create-fixture.html')

  const workbench = page.locator('.material-workbench')
  await expect(workbench).toBeVisible()
  await expect(page.getByText('物料列表', { exact: true })).toBeVisible()
  await expect(page.getByText('(4)', { exact: true })).toBeVisible()
  await expect(
    page.locator('.material-tree-sidebar__label', {
      hasText: 'host_node'
    })
  ).toBeVisible()
  await expect(
    page.locator('.material-tree-sidebar__label', {
      hasText: 'PRCXI'
    })
  ).toBeVisible()
  await expect(page.locator('.material-flow-node')).toHaveCount(4)
  await expect(
    page.locator('.material-flow-node[data-material-code="host_node"]')
  ).toBeVisible()
  const hostNode = page.locator(
    '.material-flow-node[data-material-code="host_node"]'
  )
  await expect(hostNode).toHaveAttribute(
    'data-default-node-kind',
    'control'
  )
  await expect(hostNode.getByText('控制节点')).toBeVisible()
  await expect(
    hostNode.locator('[data-default-node-icon="control"]')
  ).toBeVisible()
  const deviceNode = page.locator(
    '.material-flow-node[data-material-code="PRCXI"]'
  )
  await expect(deviceNode).toHaveAttribute(
    'data-default-node-kind',
    'equipment'
  )
  await expect(deviceNode.getByText('仪器设备')).toBeVisible()
  await expect(
    deviceNode.locator('[data-default-node-icon="equipment"]')
  ).toBeVisible()
  await expect(
    page.locator('.material-flow-node[data-material-code="PRCXI_Deck"]')
  ).toBeVisible()
  await expect(
    page.locator('.material-flow-node[data-material-code="PCR_PLATE"]')
  ).toBeVisible()
  await expect(
    page.locator('.material-flow-node__physical-label', {
      hasText: /mm/
    })
  ).toHaveCount(0)

  const resourceLauncher = page.getByRole('button', {
    name: /物料耗材\s*2/
  })
  await expect(
    page.getByRole('button', { name: /仪器设备\s*2/ })
  ).toBeVisible()
  await expect(resourceLauncher).toBeVisible()
  await page.screenshot({
    path: resolve(ARTIFACT_ROOT, '00-cloud-material-workbench.png'),
    animations: 'disabled'
  })
  await hostNode.screenshot({
    path: resolve(ARTIFACT_ROOT, '00-default-control-node.png'),
    animations: 'disabled',
    scale: 'css'
  })
  await deviceNode.screenshot({
    path: resolve(ARTIFACT_ROOT, '00-default-equipment-node.png'),
    animations: 'disabled',
    scale: 'css'
  })

  await resourceLauncher.click()
  const templateLibrary = page
    .locator('.material-template-library')
    .filter({ has: page.getByRole('heading', { name: '物料耗材' }) })
  await expect(templateLibrary).toBeVisible()
  await templateLibrary
    .getByRole('button', { name: /96 孔板/ })
    .click()
  await templateLibrary
    .getByRole('button', { name: '从该模板创建' })
    .click()

  const dialog = page.getByRole('dialog', { name: '96 孔板' })
  const nameInput = dialog.getByRole('textbox', { name: '实例名称' })
  const createButton = dialog.getByRole('button', {
    name: '创建物料'
  })

  await expect(dialog).toBeVisible()
  await expect(nameInput).toHaveValue('96 孔板')
  await expect(createButton).toBeEnabled()
  await expect(page.getByText(/Water 500/i)).toHaveCount(0)
  await expect(page.getByText(/默认 Water/i)).toHaveCount(0)
  await page.screenshot({
    path: resolve(ARTIFACT_ROOT, '01-clean-template-dialog.png'),
    animations: 'disabled'
  })

  await nameInput.fill('ＰＣＲ　Ｐｌａｔｅ')
  await expect(
    dialog.getByText('当前物料图中已存在同名物料')
  ).toBeVisible()
  await expect(nameInput).toHaveAttribute('aria-invalid', 'true')
  await expect(createButton).toBeDisabled()
  await page.screenshot({
    path: resolve(ARTIFACT_ROOT, '02-duplicate-name-blocked.png'),
    animations: 'disabled'
  })

  await nameInput.fill('   Run Plate 01   ')
  await expect(createButton).toBeEnabled()
  await createButton.click()

  await expect(dialog).toHaveCount(0)
  await expect(page.getByText('(5)', { exact: true })).toBeVisible()
  await expect(
    page.locator('.material-tree-sidebar__label', {
      hasText: 'Run Plate 01'
    })
  ).toBeVisible()
  const command = await page.evaluate(
    () => window.__UNILAB_MATERIAL_CREATE_COMMAND__
  )
  expect(command).toEqual({
    templateId: 'template-96-well-plate',
    name: 'Run Plate 01',
    placement: { kind: 'unplaced' },
    initialContents: []
  })
  await page.screenshot({
    path: resolve(ARTIFACT_ROOT, '03-created-material-workbench.png'),
    animations: 'disabled'
  })

  writeFileSync(
    resolve(ARTIFACT_ROOT, 'material-create-result.json'),
    JSON.stringify(
      {
        outcome: 'passed',
        assertions: {
          legacyWaterNotCopied: true,
          duplicateNameBlocked: true,
          normalizedName: command.name,
          placement: command.placement,
          initialContents: command.initialContents
        },
        browserErrors
      },
      null,
      2
    )
  )
  expect(browserErrors).toEqual([])
})
