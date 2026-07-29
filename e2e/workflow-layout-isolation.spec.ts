import { expect, test } from '@playwright/test'

const WORKFLOW_LAYOUT_KEY = 'unilab.panel-layout.workflow.v1'

test('工作流丢弃包含物料面板的旧布局', async ({ page }) => {
  await page.addInitScript(({ storageKey }) => {
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        version: 1,
        layout: {
          id: 'legacy-mixed-workflow-root',
          type: 'split',
          direction: 'horizontal',
          children: [
            {
              id: 'legacy-material-group',
              type: 'group',
              panels: [
                {
                  id: 'legacy-layout-unified',
                  panelType: 'layout-unified'
                }
              ],
              activePanelId: 'legacy-layout-unified'
            },
            {
              id: 'legacy-workflow-group',
              type: 'group',
              panels: [
                {
                  id: 'legacy-workflow-dag',
                  panelType: 'workflow-dag'
                }
              ],
              activePanelId: 'legacy-workflow-dag'
            }
          ]
        }
      })
    )
  }, { storageKey: WORKFLOW_LAYOUT_KEY })

  await page.goto('/')
  await page.getByText('工作流', { exact: true }).first().click()

  await expect(
    page.locator('[data-panel-type="workflow-dag"]')
  ).toBeVisible()
  await expect(page.locator('.material-tree-sidebar')).toHaveCount(0)
  await expect(page.locator('.material-workbench')).toHaveCount(0)
  await expect(page.locator('.lab-unified-viewport')).toHaveCount(0)
  await expect
    .poll(() =>
      page.evaluate((storageKey) => {
        const stored = localStorage.getItem(storageKey)
        return stored ? JSON.parse(stored) : null
      }, WORKFLOW_LAYOUT_KEY)
    )
    .toMatchObject({
      layout: {
        type: 'group',
        panels: [{ panelType: 'workflow-dag' }]
      }
    })
})
