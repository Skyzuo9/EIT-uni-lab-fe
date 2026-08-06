import { expect, type Locator, type Page } from '@playwright/test'

/**
 * 把指定工作流（Workflow）安装到当前浏览器工作台布局。
 *
 * @param page Playwright 浏览器页面。
 * @param workflowUuid 待打开工作流的稳定 UUID。
 * @returns 浏览器初始化脚本安装完成后的 Promise。
 */
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

/**
 * 通过“更多”菜单仅保存工作流源码（Workflow Source），不应用候选或创建任务。
 *
 * @param panel 工作流面板定位器。
 * @returns 保存按钮完成点击后的 Promise；调用方继续处理可能出现的源码差异。
 */
export async function saveWorkflowDraftOnly(panel: Locator): Promise<void> {
  await panel.locator('details.persistent-authoring__more > summary').click()
  await panel.getByRole('menu', { name: '更多工作流操作' })
    .getByRole('menuitem', { name: /仅保存草稿/ })
    .click()
}

/**
 * 等待工作流任务（WorkflowTask）输入侧栏完成退场动画。
 *
 * @param page Playwright 浏览器页面。
 * @returns 侧栏容器不可见后的 Promise，避免截图记录半完成过渡态。
 */
export async function waitForTaskInputDrawerClosed(
  page: Page
): Promise<void> {
  const dialog = page.locator(
    '[role="dialog"][aria-label="本次工作流运行参数"]'
  )
  await expect(dialog.locator('..')).toHaveCSS('visibility', 'hidden')
}

/**
 * 应用已保存候选并在任务输入出现后取消，不创建工作流任务（WorkflowTask）。
 *
 * @param panel 工作流面板定位器。
 * @param page Playwright 浏览器页面。
 * @returns 已应用修订保留且动态主入口恢复“开始运行”后的 Promise。
 */
export async function applyWorkflowCandidateWithoutTask(
  panel: Locator,
  page: Page
): Promise<void> {
  await panel.getByRole('button', {
    name: '应用并运行',
    exact: true
  }).click()
  const taskInput = page.getByLabel('工作流运行输入表单')
  await expect(taskInput).toBeVisible()
  await taskInput.getByRole('button', { name: '取消', exact: true }).click()
  await expect(page.getByRole('dialog', {
    name: '本次工作流运行参数'
  })).toBeHidden()
  await waitForTaskInputDrawerClosed(page)
  await expect(panel.getByRole('button', {
    name: '开始运行',
    exact: true
  })).toBeEnabled()
}

/**
 * 使用动态单入口准备已应用工作流图（Applied Workflow Graph），但不创建任务。
 *
 * @param panel 工作流面板定位器。
 * @param page Playwright 浏览器页面。
 * @returns 规范化确认、候选应用和任务输入取消完成后的 Promise。
 */
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
    name: /^(保存并运行|应用并运行)$/
  }).click()
  const normalizedDiff = page.getByRole('dialog', {
    name: '完整 Python 差异'
  })
  await expect(normalizedDiff).toBeVisible()
  await normalizedDiff.getByRole('button', {
    name: '接受完整差异并保存',
    exact: true
  }).click()
  const taskInput = page.getByLabel('工作流运行输入表单')
  await expect(taskInput).toBeVisible()
  await taskInput.getByRole('button', { name: '取消', exact: true }).click()
  await expect(page.getByRole('dialog', {
    name: '本次工作流运行参数'
  })).toBeHidden()
  await waitForTaskInputDrawerClosed(page)
  await expect(panel.getByRole('button', {
    name: '开始运行',
    exact: true
  })).toBeEnabled()
}
