import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { _electron as electron, expect, test } from '@playwright/test'

import {
  activateDomain,
  artifactDirectory,
  captureElectronWindow,
  deviceCardText,
  isInvalidWorkflowSseError,
  openWorkflow,
  readRuntimeSession
} from './helpers/ptlc-robot-workbench'

const workspacePath = process.env.UNILAB_E2E_DOMAIN_ROOT ?? ''

/**
 * 证明领域包定制卡片从仪器设备入口打开，并可与通用动作互相切换。
 *
 * 测试只读取现有 ROS2/MoveIt 运行状态，不创建工作流任务（WorkflowTask），
 * 也不发送机械臂动作（Action）。
 */
test('opens the pTLC custom card from instruments by default', async () => {
  test.skip(!workspacePath, '需要 UNILAB_E2E_DOMAIN_ROOT')
  test.setTimeout(180_000)
  mkdirSync(artifactDirectory, { recursive: true })

  const electronApp = await electron.launch({
    args: ['--no-sandbox', resolve('apps/desktop/out/main/index.js')],
    env: {
      ...process.env,
      ELECTRON_RENDERER_URL: '',
      THEIA_WORKSPACE: workspacePath,
      UNILAB_DESKTOP_SURFACE: 'workbench',
      UNILAB_DESKTOP_RENDERER_URL: 'http://127.0.0.1:3100/',
      UNILABOS_TRACE_ENABLED: '0',
      XDG_CONFIG_HOME: resolve(artifactDirectory, 'electron-config')
    }
  })

  try {
    await electronApp.evaluate(({ BrowserWindow, dialog }) => {
      dialog.showMessageBox = async () => ({
        response: 0,
        checkboxChecked: false
      })
      BrowserWindow.getAllWindows()[0]?.setSize(1880, 1100)
    })
    let page = await electronApp.firstWindow()
    const browserErrors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') browserErrors.push(message.text())
    })
    page.on('pageerror', (error) => browserErrors.push(error.message))
    await expect.poll(() => {
      page = electronApp.windows().find((candidate) =>
        candidate.url().startsWith('http://127.0.0.1:3100/')
      ) ?? page
      return electronApp.windows().map((candidate) => candidate.url()).join('\n')
    }, { timeout: 60_000 }).toContain('http://127.0.0.1:3100/')
    page.on('dialog', (dialog) => { void dialog.accept().catch(() => undefined) })
    const workbench = page.locator('.unilab-workbench')
    await expect(workbench).toBeVisible({ timeout: 60_000 })

    const trustWorkspace = page.getByRole('button', {
      name: /是，我信任此作者/
    })
    if (await trustWorkspace.isVisible().catch(() => false)) {
      await trustWorkspace.click()
    }
    const startButton = page.getByRole('button', { name: '校验并启动' })
    if (await startButton.isVisible().catch(() => false)) {
      await startButton.click()
    }
    await expect(workbench).toHaveAttribute(
      'data-workspace-backend-phase',
      'ready',
      { timeout: 120_000 }
    )
    if (await workbench.getAttribute('data-edge-runtime-phase') !== 'ready') {
      await page.getByRole('button', { name: '环境管理' }).click()
      await page.getByRole('button', { name: '启动 OS' }).click()
    }
    await expect(workbench).toHaveAttribute(
      'data-edge-runtime-phase',
      'ready',
      { timeout: 120_000 }
    )
    const runtimeSession = readRuntimeSession(workspacePath)
    const graphResponse = await fetch(
      `${runtimeSession.components.backend.address}/api/v1/materials/graph`
    )
    expect(graphResponse.ok).toBe(true)
    const graphPayload = await graphResponse.json() as {
      data: {
        nodes: Array<{
          material: {
            meta_data: { source_node_id?: string }
            data?: { orientation_source?: string }
          }
          relative_position: { rotation_z: number }
        }>
      }
    }
    const developStation = graphPayload.data.nodes.find(
      (node) => node.material.meta_data.source_node_id === 'develop'
    )
    expect(developStation?.relative_position.rotation_z).toBe(90)
    expect(developStation?.material.data?.orientation_source)
      .toBe('user_confirmed_z_quarter_turn_20260816')
    writeFileSync(
      resolve(artifactDirectory, 'develop-station-world-pose.json'),
      `${JSON.stringify(developStation, null, 2)}\n`
    )
    const environmentOverlay = page.locator('.unilab-environment-manager__overlay')
    if (await environmentOverlay.isVisible().catch(() => false)) {
      await page.locator('.unilab-environment-manager__backdrop').click({ force: true })
      await expect(environmentOverlay).toBeHidden()
    }
    await captureElectronWindow(electronApp, '00-instrument-entry-ready.png')

    await activateDomain(page, 'material')
    const viewGroup = page.getByRole('group', { name: '实验室视图' })
    await viewGroup.getByRole('button', { name: '3D' }).click()
    await expect(page.locator('[data-lab-view-mode="3d"]')).toBeVisible()
    await page.getByRole('button', { name: '适配场景' }).click()
    await new Promise(resolve => setTimeout(resolve, 1_000))
    const modelFailures = await page.locator('[data-unilab-model-failure="true"]')
      .evaluateAll((elements) => elements.map((element) => {
        const html = element as HTMLElement
        return {
          nodeId: html.dataset.nodeId ?? '',
          modelPath: html.dataset.modelPath ?? '',
          error: html.dataset.modelError ?? ''
        }
      }))
    expect(modelFailures).toEqual([])
    writeFileSync(
      resolve(artifactDirectory, 'model-load-failures.json'),
      `${JSON.stringify(modelFailures, null, 2)}\n`
    )
    await captureElectronWindow(electronApp, '00a-develop-station-yaw-90.png')

    const materialWorkflowMode = await page.locator('[data-workbench-view]')
      .first()
      .getAttribute('data-workbench-view')
    if (materialWorkflowMode !== 'workflow' && materialWorkflowMode !== 'split') {
      await activateDomain(page, 'workflow')
    }
    await openWorkflow(page, 'pTLC 整架物料转移验收')
    await expect(page.getByText('pTLC 整架物料转移验收', {
      exact: true
    }).first()).toBeVisible()
    await expect(page.locator(
      '[data-workflow-node-uuid][data-workflow-node-kind]:visible'
    )).toHaveCount(2, { timeout: 60_000 })
    await expect(page.getByText('正在读取 OS 工作流编辑数据…', {
      exact: true
    })).toBeHidden()
    await captureElectronWindow(
      electronApp,
      '00b-material-transfer-workflow-readonly.png'
    )

    await activateDomain(page, 'device')
    await expect(page.getByText('仪器设备 + 物料', { exact: true })).toBeVisible()

    const tabs = page.getByRole('tablist', { name: '仪器设备调试视图' })
    const genericActionsTab = tabs.getByRole('tab', { name: '通用动作' })
    const customCardTab = tabs.getByRole('tab', { name: '定制卡片' })
    await expect(genericActionsTab).toBeVisible()
    await expect(customCardTab).toHaveAttribute('aria-selected', 'true', {
      timeout: 90_000
    })
    const card = page.getByRole('region', { name: '机械臂设备卡片' })
    await expect(card).toHaveAttribute('data-package-card-state', 'ready', {
      timeout: 90_000
    })
    await expect.poll(
      () => deviceCardText(electronApp).catch(() => ''),
      { timeout: 90_000, intervals: [250, 500, 1_000] }
    ).toContain('已读取 59 个 PointSet 目标')
    await captureElectronWindow(electronApp, '01-instrument-custom-card-default.png')

    await genericActionsTab.click()
    await expect(genericActionsTab).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('[data-device-management="panel"]')).toBeVisible({
      timeout: 30_000
    })
    await expect(page.getByRole('heading', {
      name: 'pTLC DOBOT CR5'
    })).toBeVisible({ timeout: 60_000 })
    await expect(page.locator(
      '[data-device-management="action-node"]:visible'
    ).first()).toBeVisible({ timeout: 60_000 })
    await captureElectronWindow(electronApp, '02-instrument-generic-actions.png')

    await customCardTab.click()
    await expect(customCardTab).toHaveAttribute('aria-selected', 'true')
    await expect(card).toHaveAttribute('data-package-card-state', 'ready', {
      timeout: 90_000
    })
    await expect.poll(
      () => deviceCardText(electronApp).catch(() => ''),
      { timeout: 90_000, intervals: [250, 500, 1_000] }
    ).toContain('已读取 59 个 PointSet 目标')
    await captureElectronWindow(electronApp, '03-instrument-custom-card-return.png')
    writeFileSync(
      resolve(artifactDirectory, 'browser-errors.json'),
      `${JSON.stringify(browserErrors, null, 2)}\n`
    )
    expect(browserErrors.filter(isInvalidWorkflowSseError)).toEqual([])
  } finally {
    await electronApp.close()
  }
})
