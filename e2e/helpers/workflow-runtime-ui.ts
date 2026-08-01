import { expect, type Locator, type Page } from '@playwright/test'

export async function installWorkflowPanel(
  page: Page,
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

export async function prepareAppliedWorkflow(
  panel: Locator,
  page: Page
): Promise<void> {
  await expect(panel.getByText('完整控制流 DAG')).toBeVisible()
  await panel.getByRole('button', {
    name: '画布模式',
    exact: true
  }).click()
  await panel.getByRole('button', {
    name: '保存草稿',
    exact: true
  }).click()
  const normalizedDiff = page.getByRole('dialog', {
    name: '完整 Python 差异'
  })
  await expect(normalizedDiff).toBeVisible()
  await normalizedDiff.getByRole('button', {
    name: '接受完整差异并保存',
    exact: true
  }).click()
  await panel.getByRole('button', {
    name: '应用工作流',
    exact: true
  }).click()
  await expect(panel.getByText(/(?:工作流|源码)已应用/)).toBeVisible()
  await expect(panel.getByRole('button', {
    name: '开始运行',
    exact: true
  })).toBeEnabled()
}
