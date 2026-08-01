import { expect, test } from '@playwright/test'

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

test('existing Workflow workbench exposes the WorkflowTask runtime seam', async ({
  page
}) => {
  test.setTimeout(90_000)
  await installWorkflowPanel(page, os.workflowUuid)

  await page.goto(
    `/?section=workflow&localOsUrl=${encodeURIComponent(os.url)}`
  )
  const panel = page.locator('[data-panel-instance-id="runtime-workflow"]')

  await expect(panel.getByText('完整控制流 DAG')).toBeVisible()
  await expect(panel.getByRole('button', {
    name: '开始运行',
    exact: true
  })).toBeVisible()
})

async function installWorkflowPanel(
  page: import('@playwright/test').Page,
  workflowUuid: string
): Promise<void> {
  await page.addInitScript((configuredWorkflowUuid) => {
    localStorage.setItem(
      'unilab.panel-layout.workflow.v1',
      JSON.stringify({
        version: 1,
        layout: {
          id: 'runtime-root',
          type: 'group',
          panels: [{
            id: 'runtime-workflow',
            panelType: 'workflow-dag',
            title: 'Workflow Runtime',
            config: { workflow_uuid: configuredWorkflowUuid }
          }],
          activePanelId: 'runtime-workflow'
        }
      })
    )
  }, workflowUuid)
}
