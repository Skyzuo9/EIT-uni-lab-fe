import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

import {
  startPersistentAuthoringOs,
  type PersistentAuthoringOs
} from './helpers/persistent-authoring-os'
import { saveWorkflowDraftOnly } from './helpers/workflow-runtime-ui'

let os: PersistentAuthoringOs

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  os = await startPersistentAuthoringOs()
})

test.afterAll(async () => {
  await os?.stop()
})

test('two configured Workflow panels keep mode, dirty state and saves isolated', async ({
  page
}) => {
  test.setTimeout(90_000)
  await page.addInitScript(({ firstWorkflowUuid, secondWorkflowUuid }) => {
    localStorage.setItem(
      'unilab.panel-layout.workflow.v1',
      JSON.stringify({
        version: 1,
        layout: {
          id: 'two-workflow-root',
          type: 'split',
          direction: 'horizontal',
          sizes: [50, 50],
          children: [
            {
              id: 'workflow-a-group',
              type: 'group',
              panels: [{
                id: 'workflow-a',
                panelType: 'workflow-dag',
                title: 'Workflow A',
                config: { workflow_uuid: firstWorkflowUuid }
              }],
              activePanelId: 'workflow-a'
            },
            {
              id: 'workflow-b-group',
              type: 'group',
              panels: [{
                id: 'workflow-b',
                panelType: 'workflow-dag',
                title: 'Workflow B',
                config: { workflow_uuid: secondWorkflowUuid }
              }],
              activePanelId: 'workflow-b'
            }
          ]
        }
      })
    )
  }, {
    firstWorkflowUuid: os.workflowUuid,
    secondWorkflowUuid: os.secondWorkflowUuid
  })

  await page.goto(
    `/?section=workflow&localOsUrl=${encodeURIComponent(os.url)}`
  )
  const panelA = page.locator('[data-panel-instance-id="workflow-a"]')
  const panelB = page.locator('[data-panel-instance-id="workflow-b"]')
  await expect(panelA.getByText('完整控制流 DAG')).toBeVisible()
  await expect(panelB.getByText('完整控制流 DAG')).toBeVisible()

  await panelA.getByRole('button', {
    name: '画布模式',
    exact: true
  }).click()
  await expect(panelA.getByRole('button', {
    name: '画布模式',
    exact: true
  })).toHaveAttribute('aria-pressed', 'true')
  await expect(panelB.locator('.cm-content:visible'))
    .toHaveAttribute('contenteditable', 'true')
  await expect(panelB.getByRole('button', {
    name: '代码模式',
    exact: true
  })).toHaveAttribute('aria-pressed', 'true')

  const panelANode = panelA.locator('.react-flow__node-wfNode').first()
  await panelANode.click()
  const panelAName = panelA.getByRole('textbox', { name: '节点名称' })
  await panelAName.fill('prepared_panel_a')

  const firstSourceBefore = readFileSync(os.sourcePath, 'utf8')
  const secondSourceBefore = readFileSync(os.secondSourcePath, 'utf8')
  const secondSourceAfter = secondSourceBefore.replace('= 3,', '= 4,')
  expect(secondSourceAfter).not.toBe(secondSourceBefore)
  const panelBEditor = panelB.locator('.cm-content:visible')
  await panelBEditor.click()
  await page.keyboard.press('Control+a')
  await page.keyboard.insertText(secondSourceAfter)
  await saveWorkflowDraftOnly(panelB)
  const panelBSourceDiff = page.getByRole('dialog', {
    name: '完整 Python 差异'
  })
  await expect(panelBSourceDiff).toBeVisible()
  await panelBSourceDiff.getByRole('button', {
    name: '接受完整差异并保存',
    exact: true
  }).evaluate((button) => (button as HTMLButtonElement).click())

  await expect(panelB.getByText(
    '草稿已保存，有尚未应用的工作流修改',
    { exact: true }
  )).toBeVisible()
  expect(readFileSync(os.secondSourcePath, 'utf8')).toContain('= 4,')
  expect(readFileSync(os.sourcePath, 'utf8')).toBe(firstSourceBefore)
  await expect(panelAName).toHaveValue('prepared_panel_a')
  await expect(panelA.getByRole('button', {
    name: '开始运行',
    exact: true
  })).toBeEnabled()
  await expect(page.getByRole('dialog', { name: '远端修改冲突' }))
    .toHaveCount(0)
})
