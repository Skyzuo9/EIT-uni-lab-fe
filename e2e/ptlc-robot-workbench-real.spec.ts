import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { _electron as electron, expect, test } from '@playwright/test'

import {
  activateDomain,
  artifactDirectory,
  captureElectronWindow,
  clickDeviceCard,
  deviceCardText,
  deviceCardWebContents,
  evidenceNamedJointValues,
  isInvalidWorkflowSseError,
  latestEvidenceJointDegrees,
  openWorkflow,
  readRuntimeSession,
  selectDeviceCardPoint,
  startEvidenceProcess,
  visibleWorkflowInputForm,
  visibleWorkflowStartButton,
  waitForNewWorkflowTask,
  workflowTaskIds,
  workflowTaskStatus
} from './helpers/ptlc-robot-workbench'

const workspacePath = process.env.UNILAB_E2E_DOMAIN_ROOT ?? ''
const targetPoint = process.env.UNILAB_E2E_ROBOT_TARGET_POINT ?? 'P12'
const targetJointName = process.env.UNILAB_E2E_ROBOT_TARGET_JOINT_NAME
  ?? 'robot_cr5_joint_1'
const targetJointDegrees = Number.parseFloat(
  process.env.UNILAB_E2E_ROBOT_TARGET_JOINT_DEGREES ?? '-154.341157'
)
const railJointName = process.env.UNILAB_E2E_RAIL_JOINT_NAME
  ?? 'rail_rail_joint'
const railTargetSi = Number.parseFloat(
  process.env.UNILAB_E2E_RAIL_TARGET_SI ?? '0.6'
)
const ros2Cli = process.env.UNILAB_E2E_ROS2_CLI ?? 'ros2'

test('starts the pTLC workspace and loads its robot device card', async () => {
  test.skip(!workspacePath, '需要 UNILAB_E2E_DOMAIN_ROOT')
  test.setTimeout(360_000)
  mkdirSync(artifactDirectory, { recursive: true })

  const evidenceProcesses: ReturnType<typeof startEvidenceProcess>[] = []

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
      const window = BrowserWindow.getAllWindows()[0]
      window?.setSize(1880, 1100)
    })
    const page = await electronApp.firstWindow()
    const browserErrors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') browserErrors.push(message.text())
    })
    page.on('pageerror', (error) => browserErrors.push(error.message))
    page.on('dialog', (dialog) => { void dialog.accept().catch(() => undefined) })

    const workbench = page.locator('.unilab-workbench')
    await expect(workbench).toBeVisible({ timeout: 60_000 })
    const trustWorkspace = page.getByRole('button', {
      name: /是，我信任此作者/
    })
    if (await trustWorkspace.isVisible().catch(() => false)) {
      await trustWorkspace.click()
    }
    writeFileSync(
      resolve(artifactDirectory, 'startup-surface.txt'),
      `${await page.locator('body').innerText()}\n`
    )
    await captureElectronWindow(electronApp, '00-startup-gate.png')
    const startButton = page.getByRole('button', { name: '校验并启动' })
    if (await startButton.isVisible().catch(() => false)) {
      await startButton.click()
    }
    await expect(workbench).toHaveAttribute('data-workspace-backend-phase', 'ready', {
      timeout: 180_000
    })
    if (await workbench.getAttribute('data-edge-runtime-phase') !== 'ready') {
      await page.getByRole('button', { name: '环境管理' }).click()
      await page.getByRole('button', { name: '启动 OS' }).click()
    }
    await expect(workbench).toHaveAttribute('data-edge-runtime-phase', 'ready', {
      timeout: 180_000
    })
    const runtimeSession = readRuntimeSession(workspacePath)
    evidenceProcesses.push(
      startEvidenceProcess(
        'curl',
        ['--no-buffer', '--silent', '--show-error',
          `${runtimeSession.components.backend.address}/api/v1/device-telemetry/events`],
        'device-telemetry.sse.log'
      ),
      startEvidenceProcess(
        ros2Cli,
        ['topic', 'echo', '/joint_states', 'sensor_msgs/msg/JointState'],
        'joint-states.log'
      )
    )
    const environmentOverlay = page.locator('.unilab-environment-manager__overlay')
    if (await environmentOverlay.isVisible().catch(() => false)) {
      await page.locator('.unilab-environment-manager__backdrop').click({ force: true })
      await expect(environmentOverlay).toBeHidden()
    }
    await expect(workbench).not.toHaveAttribute('data-package-mount-count', '0')

    await activateDomain(page, 'material')
    await activateDomain(page, 'device')
    await expect(page.getByText('仪器设备 + 物料', { exact: true })).toBeVisible()
    const deviceTabs = page.getByRole('tablist', { name: '仪器设备调试视图' })
    await expect(deviceTabs.getByRole('tab', { name: '通用动作' })).toBeVisible()
    await expect(deviceTabs.getByRole('tab', { name: '定制卡片' })).toHaveAttribute(
      'aria-selected',
      'true',
      { timeout: 90_000 }
    )
    const viewGroup = page.getByRole('group', { name: '实验室视图' })
    await viewGroup.getByRole('button', { name: '3D' }).click()
    await expect(page.locator('[data-lab-view-mode="3d"]')).toBeVisible()
    await page.getByRole('button', { name: '适配场景' }).click()
    await new Promise(resolve => setTimeout(resolve, 1_000))

    const cardHost = page.getByRole('region', { name: '机械臂设备卡片' })
    await expect(cardHost).toHaveAttribute('data-package-card-state', 'ready', {
      timeout: 90_000
    })
    await expect(cardHost).toHaveAttribute(
      'data-package-card-id',
      'community.ptlc_station.robot.card'
    )
    await expect(cardHost).toContainText('已加载 pTLC CR5 Mock / Live 调试卡片')
    await expect.poll(
      () => deviceCardText(electronApp),
      { timeout: 90_000, intervals: [250, 500, 1_000] }
    ).toContain('已读取 59 个 PointSet 目标')
    const modelFailures = await page.locator('[data-unilab-model-failure="true"]')
      .evaluateAll((elements) => elements.map((element) => {
        const html = element as HTMLElement
        return {
          nodeId: html.dataset.nodeId ?? '',
          materialId: html.dataset.materialId ?? '',
          modelPath: html.dataset.modelPath ?? '',
          modelFormat: html.dataset.modelFormat ?? '',
          error: html.dataset.modelError ?? ''
        }
      }))
    writeFileSync(
      resolve(artifactDirectory, 'model-load-failures.json'),
      `${JSON.stringify(modelFailures, null, 2)}\n`
    )
    expect(modelFailures).toEqual([])
    await captureElectronWindow(electronApp, '01-card-loaded-material-3d.png')

    const cardContents = await deviceCardWebContents(electronApp)
    writeFileSync(
      resolve(artifactDirectory, 'device-card-webcontents.json'),
      `${JSON.stringify(cardContents, null, 2)}\n`
    )
    expect(cardContents.url).toMatch(/^file:/)
    expect(cardContents.text).toContain('pTLC 机械臂 Mock / Live 调试卡片')
    expect(cardContents.text).toContain('PointSet 目标')
    expect(cardContents.text).toContain('移动到 P9')

    await clickDeviceCard(electronApp, '[data-exclusive="acquire"]')
    await expect.poll(
      () => deviceCardText(electronApp),
      { timeout: 30_000 }
    ).toContain('已取得调试控制')
    let initialJointDegrees = Number.NaN
    let initialRailSi = Number.NaN
    await expect.poll(() => {
      initialJointDegrees = latestEvidenceJointDegrees(
        'joint-states.log',
        targetJointName
      )
      return Number.isFinite(initialJointDegrees)
    }, { timeout: 30_000, intervals: [100, 250, 500] }).toBe(true)
    await expect.poll(() => {
      initialRailSi = evidenceNamedJointValues(
        'joint-states.log',
        railJointName
      ).at(-1) ?? Number.NaN
      return Number.isFinite(initialRailSi)
    }, { timeout: 30_000, intervals: [100, 250, 500] }).toBe(true)
    expect(Math.abs(targetJointDegrees - initialJointDegrees)).toBeGreaterThan(5)
    expect(Math.abs(railTargetSi - initialRailSi)).toBeGreaterThan(0.1)
    await selectDeviceCardPoint(electronApp, targetPoint)
    await captureElectronWindow(electronApp, '02-card-move-start.png')
    await clickDeviceCard(electronApp, '[data-move-to-point]')
    await expect.poll(
      () => deviceCardText(electronApp),
      { timeout: 10_000 }
    ).toContain('MoveIt 正在规划并执行')
    await expect.poll(() => {
      const railSi = evidenceNamedJointValues(
        'joint-states.log',
        railJointName
      ).at(-1) ?? Number.NaN
      return (railSi - initialRailSi) / (railTargetSi - initialRailSi)
    }, { timeout: 30_000, intervals: [50, 100, 150] }).toBeGreaterThan(0.15)
    await expect.poll(() => {
      const railSi = evidenceNamedJointValues(
        'joint-states.log',
        railJointName
      ).at(-1) ?? Number.NaN
      return (railSi - initialRailSi) / (railTargetSi - initialRailSi)
    }, { timeout: 10_000, intervals: [50, 100] }).toBeLessThan(0.85)
    await captureElectronWindow(electronApp, '03-card-rail-process.png')
    await expect.poll(() => Math.abs(
      (evidenceNamedJointValues('joint-states.log', railJointName).at(-1)
        ?? Number.NaN) - railTargetSi
    ), { timeout: 30_000, intervals: [50, 100, 250] }).toBeLessThan(0.005)
    await expect.poll(() => {
      const degrees = latestEvidenceJointDegrees(
        'joint-states.log',
        targetJointName
      )
      const progress = (degrees - initialJointDegrees)
        / (targetJointDegrees - initialJointDegrees)
      return progress > 0.15 && progress < 0.85
    }, { timeout: 30_000, intervals: [100, 150, 200] }).toBe(true)
    await captureElectronWindow(electronApp, '03a-card-arm-process.png')
    await expect.poll(
      () => deviceCardText(electronApp),
      { timeout: 180_000, intervals: [250, 500, 1_000] }
    ).toContain(`已移动到 ${targetPoint}`)
    await expect.poll(() => Math.abs(
      latestEvidenceJointDegrees('joint-states.log', targetJointName)
        - targetJointDegrees
    ), { timeout: 30_000, intervals: [100, 250, 500] }).toBeLessThan(1)
    await captureElectronWindow(electronApp, '04-card-move-end.png')
    const railSamples = evidenceNamedJointValues('joint-states.log', railJointName)
    const armSamples = evidenceNamedJointValues('joint-states.log', targetJointName)
    expect(new Set(railSamples.map((value) => value.toFixed(4))).size)
      .toBeGreaterThan(10)
    writeFileSync(
      resolve(artifactDirectory, 'joint-evidence-summary.json'),
      `${JSON.stringify({
        rail: {
          jointName: railJointName,
          sampleCount: railSamples.length,
          distinctRoundedSamples: new Set(
            railSamples.map((value) => value.toFixed(4))
          ).size,
          initialSi: initialRailSi,
          targetSi: railTargetSi,
          finalSi: railSamples.at(-1)
        },
        arm: {
          jointName: targetJointName,
          sampleCount: armSamples.length,
          initialDegrees: initialJointDegrees,
          targetDegrees: targetJointDegrees,
          finalDegrees: latestEvidenceJointDegrees(
            'joint-states.log',
            targetJointName
          )
        }
      }, null, 2)}\n`
    )
    if (process.env.UNILAB_E2E_SKIP_ROBOT_JOG !== '1') {
      await clickDeviceCard(electronApp, '[data-tab="jog"]')
      await expect.poll(
        () => deviceCardText(electronApp),
        { timeout: 10_000 }
      ).toContain('有限 Jog')
      await clickDeviceCard(electronApp, '[data-jog-joint="cr5_joint_1"][data-direction="positive"]')
      await expect.poll(
        () => deviceCardText(electronApp),
        { timeout: 180_000, intervals: [250, 500, 1_000] }
      ).toContain('关节 Jog 已完成')
      await expect.poll(
        () => deviceCardText(electronApp),
        { timeout: 30_000, intervals: [100, 250, 500] }
      ).not.toContain('规划执行中')
      await captureElectronWindow(electronApp, '04a-card-jog-complete.png')
    }
    await clickDeviceCard(electronApp, '[data-exclusive="release"]')
    await expect.poll(
      () => deviceCardText(electronApp),
      { timeout: 30_000 }
    ).toContain('已释放调试控制')
    expect(browserErrors.filter(isInvalidWorkflowSseError)).toEqual([])
  } finally {
    await electronApp.close()
    await Promise.all(evidenceProcesses.map(process => process.stop()))
  }
})

test('runs material-site and point robot workflows through Workbench', async () => {
  test.skip(!workspacePath, '需要 UNILAB_E2E_DOMAIN_ROOT')
  test.setTimeout(360_000)
  mkdirSync(artifactDirectory, { recursive: true })

  let backendAddress = ''
  const evidenceProcesses: ReturnType<typeof startEvidenceProcess>[] = []
  const electronApp = await electron.launch({
    args: ['--no-sandbox', resolve('apps/desktop/out/main/index.js')],
    env: {
      ...process.env,
      ELECTRON_RENDERER_URL: '',
      THEIA_WORKSPACE: workspacePath,
      UNILAB_DESKTOP_SURFACE: 'workbench',
      UNILAB_DESKTOP_RENDERER_URL: 'http://127.0.0.1:3100/',
      UNILABOS_TRACE_ENABLED: '0',
      XDG_CONFIG_HOME: resolve(artifactDirectory, 'electron-config-workflows')
    }
  })

  try {
    await electronApp.evaluate(({ BrowserWindow, dialog }) => {
      dialog.showMessageBox = async () => ({
        response: 0,
        checkboxChecked: false
      })
      const window = BrowserWindow.getAllWindows()[0]
      window?.setSize(1880, 1100)
      window?.webContents.setZoomFactor(0.85)
    })
    const page = await electronApp.firstWindow()
    const browserErrors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') browserErrors.push(message.text())
    })
    page.on('pageerror', (error) => browserErrors.push(error.message))
    page.on('dialog', (dialog) => { void dialog.accept().catch(() => undefined) })

    const workbench = page.locator('.unilab-workbench')
    await expect(workbench).toBeVisible({ timeout: 60_000 })
    const trustWorkspace = page.getByRole('button', {
      name: /是，我信任此作者/
    })
    if (await trustWorkspace.isVisible().catch(() => false)) {
      await trustWorkspace.click()
    }
    await expect(workbench).toHaveAttribute('data-workspace-backend-phase', 'ready', {
      timeout: 180_000
    })
    await expect(workbench).toHaveAttribute('data-edge-runtime-phase', 'ready', {
      timeout: 180_000
    })
    backendAddress = readRuntimeSession(workspacePath).components.backend.address
    evidenceProcesses.push(
      startEvidenceProcess(
        'curl',
        ['--no-buffer', '--silent', '--show-error',
          `${backendAddress}/api/v1/device-telemetry/events`],
        'workflow-device-telemetry.sse.log'
      ),
      startEvidenceProcess(
        ros2Cli,
        ['topic', 'echo', '/joint_states', 'sensor_msgs/msg/JointState'],
        'workflow-joint-states.log'
      )
    )
    const environmentOverlay = page.locator('.unilab-environment-manager__overlay')
    if (await environmentOverlay.isVisible().catch(() => false)) {
      await page.locator('.unilab-environment-manager__backdrop').click({ force: true })
      await expect(environmentOverlay).toBeHidden()
    }
    if (await page.locator('[data-workbench-view]').getAttribute(
      'data-workbench-view'
    ) !== 'workflow') {
      await activateDomain(page, 'workflow')
    }

    const materialWorkflowUuid = 'd0e23265-ae02-5d99-a94f-78c9f8f89cd4'
    await openWorkflow(page, '机械臂-物料与库位安全位')
    await visibleWorkflowStartButton(page).click()
    const materialForm = visibleWorkflowInputForm(page)
    await expect(materialForm).toBeVisible()
    await materialForm.getByLabel('material 输入状态').selectOption('value')
    const materialSlot = materialForm.getByLabel('material 资源位')
    await expect(materialSlot).not.toHaveValue('')
    await materialForm.getByLabel('site 输入状态').selectOption('value')
    await materialForm.getByLabel('site 明确值').fill(
      'staging_a_stack/item-1'
    )
    await captureElectronWindow(electronApp, '05-material-site-workflow-input.png')
    const materialExistingTasks = await workflowTaskIds(
      backendAddress,
      materialWorkflowUuid
    )
    await materialForm.getByRole('button', { name: '使用以上参数运行' }).click()
    const materialTaskUuid = await waitForNewWorkflowTask(
      backendAddress,
      materialWorkflowUuid,
      materialExistingTasks
    )
    await expect.poll(
      () => workflowTaskStatus(backendAddress, materialTaskUuid),
      { timeout: 30_000, intervals: [100, 250, 500] }
    ).toBe('running')
    await expect(materialForm).toBeHidden({ timeout: 30_000 })
    await expect(page.getByText('运行中', { exact: true }).first()).toBeVisible({
      timeout: 30_000
    })
    await new Promise(resolve => setTimeout(resolve, 2_000))
    await captureElectronWindow(electronApp, '06-material-site-workflow-process.png')
    await expect.poll(
      () => workflowTaskStatus(backendAddress, materialTaskUuid),
      { timeout: 180_000, intervals: [250, 500, 1_000] }
    ).toBe('succeeded')
    await new Promise(resolve => setTimeout(resolve, 500))
    await captureElectronWindow(electronApp, '07-material-site-workflow-end.png')

    const pointWorkflowUuid = 'ee50ad26-7c2c-54dc-9324-b62abb4d1237'
    await openWorkflow(page, '机械臂-MoveIt 点位移动')
    await visibleWorkflowStartButton(page).click()
    const pointForm = visibleWorkflowInputForm(page)
    await expect(pointForm).toBeVisible()
    await pointForm.getByLabel('point_id 输入状态').selectOption('value')
    await pointForm.getByLabel('point_id 明确值').fill('P12')
    await captureElectronWindow(electronApp, '08-point-workflow-input.png')
    const pointExistingTasks = await workflowTaskIds(
      backendAddress,
      pointWorkflowUuid
    )
    await pointForm.getByRole('button', { name: '使用以上参数运行' }).click()
    const pointTaskUuid = await waitForNewWorkflowTask(
      backendAddress,
      pointWorkflowUuid,
      pointExistingTasks
    )
    await expect.poll(
      () => workflowTaskStatus(backendAddress, pointTaskUuid),
      { timeout: 30_000, intervals: [100, 250, 500] }
    ).toBe('running')
    await expect(pointForm).toBeHidden({ timeout: 30_000 })
    await expect(page.getByText('运行中', { exact: true }).first()).toBeVisible({
      timeout: 30_000
    })
    await new Promise(resolve => setTimeout(resolve, 2_000))
    await captureElectronWindow(electronApp, '09-point-workflow-process.png')
    await expect.poll(
      () => workflowTaskStatus(backendAddress, pointTaskUuid),
      { timeout: 180_000, intervals: [250, 500, 1_000] }
    ).toBe('succeeded')
    await new Promise(resolve => setTimeout(resolve, 500))
    await captureElectronWindow(electronApp, '10-point-workflow-end.png')

    writeFileSync(
      resolve(artifactDirectory, 'workflow-browser-errors.json'),
      `${JSON.stringify(browserErrors, null, 2)}\n`
    )
    expect(browserErrors.filter(isInvalidWorkflowSseError)).toEqual([])
    expect(await page.locator('body').innerText()).not.toMatch(
      /workflow.*sse.*(?:无效|invalid)|(?:无效|invalid).*workflow.*sse/i
    )
  } finally {
    await electronApp.close()
    await Promise.all(evidenceProcesses.map(process => process.stop()))
  }
})
