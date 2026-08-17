import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { _electron as electron, expect, test } from '@playwright/test'

import {
  activateDomain,
  artifactDirectory,
  captureElectronWindow,
  captureSucceededSubworkflows,
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
  workflowTaskSnapshot,
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

type MaterialGraphNode = {
  material: {
    uuid: string
    meta_data?: { source_node_id?: string }
  }
  current_site_uuid?: string | null
  sites?: Array<{ uuid: string; name?: string; id?: string }>
}

type WorkflowGraph = {
  nodes: Array<{
    name?: string
    parent_uuid?: string | null
    type?: string
  }>
  edges: unknown[]
}

async function materialGraph(backendAddress: string): Promise<MaterialGraphNode[]> {
  const response = await fetch(`${backendAddress}/api/v1/materials/graph`)
  if (!response.ok) throw new Error(`读取物料图失败：HTTP ${response.status}`)
  const payload = await response.json() as { data: { nodes: MaterialGraphNode[] } }
  return payload.data.nodes
}

async function workflowGraph(
  backendAddress: string,
  workflowUuid: string
): Promise<WorkflowGraph> {
  const response = await fetch(
    `${backendAddress}/api/v1/workflows/${workflowUuid}/graph`
  )
  if (!response.ok) throw new Error(`读取工作流图失败：HTTP ${response.status}`)
  const payload = await response.json() as { data: WorkflowGraph }
  return payload.data
}

async function resetMaterialPlacement(
  backendAddress: string,
  materialUuid: string,
  parentUuid: string,
  site: string
): Promise<void> {
  const response = await fetch(`${backendAddress}/api/v1/inventory/commands`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      command_id: `ptlc-e2e-reset-${Date.now()}`,
      type: 'material.move',
      payload: {
        edge_uuid: materialUuid,
        parent_uuid: parentUuid,
        slot_id: site
      },
      actor: 'ptlc-workbench-e2e'
    })
  })
  if (!response.ok) {
    throw new Error(`重置物料库位失败：HTTP ${response.status}`)
  }
  const payload = await response.json() as { status?: string; error?: string }
  if (payload.status !== 'completed') {
    throw new Error(`重置物料库位失败：${payload.error ?? JSON.stringify(payload)}`)
  }
}

function rosEnvironmentForEdge(edgePid: number | null): NodeJS.ProcessEnv {
  if (!edgePid) throw new Error('Edge Runtime 尚未提供 PID')
  const variables = readFileSync(`/proc/${edgePid}/environ`)
    .toString('utf8')
    .split('\0')
  const domain = variables.find((value) => value.startsWith('ROS_DOMAIN_ID='))
    ?.slice('ROS_DOMAIN_ID='.length)
  if (!domain) throw new Error('Edge Runtime 未声明 ROS_DOMAIN_ID')
  return { ...process.env, ROS_DOMAIN_ID: domain }
}

async function submitWorkflow(
  page: import('@playwright/test').Page,
  backendAddress: string,
  workflowUuid: string
): Promise<string> {
  const existing = await workflowTaskIds(backendAddress, workflowUuid)
  await visibleWorkflowStartButton(page).click()
  const form = visibleWorkflowInputForm(page)
  await expect(form).toBeVisible({ timeout: 60_000 })
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const taskResponse = page.waitForResponse((response) =>
      response.request().method() === 'POST'
      && new URL(response.url()).pathname.endsWith('/api/v1/workflow-tasks'),
    { timeout: 10_000 }).catch(() => null)
    await form.getByRole('button', { name: '使用以上参数运行' }).click()
    const response = await taskResponse
    if (response) {
      expect(response.status()).toBe(201)
      return waitForNewWorkflowTask(backendAddress, workflowUuid, existing)
    }
    const problem = await form.getByRole('alert').textContent().catch(() => null)
    if (problem?.includes('表单已重投影')) continue
    throw new Error(
      `工作流任务未提交到本地后端：${problem ?? await form.innerText()}`
    )
  }
  throw new Error('工作流已应用版本持续变化，三次确认后仍无法创建任务')
}

test('starts the pTLC workspace and loads its robot device card', async () => {
  test.skip(!workspacePath, '需要 UNILAB_E2E_DOMAIN_ROOT')
  test.setTimeout(360_000)
  mkdirSync(artifactDirectory, { recursive: true })

  const evidenceProcesses: ReturnType<typeof startEvidenceProcess>[] = []
  let exclusiveAcquired = false

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
    const rosEnvironment = rosEnvironmentForEdge(runtimeSession.components.edge.pid)
    writeFileSync(
      resolve(artifactDirectory, 'ros-domain-id.txt'),
      `${rosEnvironment.ROS_DOMAIN_ID}\n`
    )
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
        'joint-states.log',
        rosEnvironment
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
    exclusiveAcquired = true
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
    if (exclusiveAcquired) {
      await clickDeviceCard(electronApp, '[data-exclusive="release"]')
        .catch(() => undefined)
    }
    await electronApp.close()
    await Promise.all(evidenceProcesses.map(process => process.stop()))
  }
})

test('runs material transfer and the longest production workflow through Workbench', async () => {
  test.skip(!workspacePath, '需要 UNILAB_E2E_DOMAIN_ROOT')
  test.setTimeout(900_000)
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
    if (await workbench.getAttribute('data-edge-runtime-phase') !== 'ready') {
      await page.getByRole('button', { name: '环境管理' }).click()
      await page.getByRole('button', { name: '启动 OS' }).click()
    }
    await expect(workbench).toHaveAttribute('data-edge-runtime-phase', 'ready', {
      timeout: 180_000
    })
    const normalRuntime = readRuntimeSession(workspacePath)
    backendAddress = normalRuntime.components.backend.address
    const rosEnvironment = rosEnvironmentForEdge(normalRuntime.components.edge.pid)
    writeFileSync(
      resolve(artifactDirectory, 'workflow-ros-domain-id.txt'),
      `${rosEnvironment.ROS_DOMAIN_ID}\n`
    )
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
        'workflow-joint-states.log',
        rosEnvironment
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

    const materialWorkflowUuid = 'df246e55-8a70-54ee-87fb-4c660fe6fa32'
    const beforeMaterialGraph = await materialGraph(backendAddress)
    const collectorRack = beforeMaterialGraph.find(
      (node) => node.material.meta_data?.source_node_id === 'debug_collector_rack'
    )
    const groupRack = beforeMaterialGraph.find(
      (node) => node.material.meta_data?.source_node_id === 'group_rack_warehouse'
    )
    const stagingRack = beforeMaterialGraph.find(
      (node) => node.material.meta_data?.source_node_id === 'staging_a_stack'
    )
    const sourceSiteUuid = groupRack?.sites?.find(
      (site) => (site.name ?? site.id) === 'collector-rack-1'
    )?.uuid
    const targetSiteUuid = stagingRack?.sites?.find(
      (site) => (site.name ?? site.id) === 'rack'
    )?.uuid
    if (
      collectorRack?.current_site_uuid !== sourceSiteUuid
      && collectorRack?.material.uuid
      && groupRack?.material.uuid
    ) {
      await resetMaterialPlacement(
        backendAddress,
        collectorRack.material.uuid,
        groupRack.material.uuid,
        'collector-rack-1'
      )
    }
    await expect.poll(async () => {
      const preparedGraph = await materialGraph(backendAddress)
      return preparedGraph.find(
        (node) => node.material.uuid === collectorRack?.material.uuid
      )?.current_site_uuid
    }, { timeout: 30_000, intervals: [100, 250, 500] }).toBe(sourceSiteUuid)
    expect(targetSiteUuid).toBeTruthy()
    writeFileSync(
      resolve(artifactDirectory, 'material-graph-before.json'),
      `${JSON.stringify(await materialGraph(backendAddress), null, 2)}\n`
    )

    await openWorkflow(page, 'pTLC 整架物料转移验收', materialWorkflowUuid)
    await expect(page.locator(
      '[data-workflow-node-uuid][data-workflow-node-kind]:visible'
    )).toHaveCount(2, { timeout: 60_000 })
    await captureElectronWindow(electronApp, '05-material-transfer-overall-start.png')
    const initialWorkflowJointSamples = evidenceNamedJointValues(
      'workflow-joint-states.log',
      targetJointName
    ).length
    const materialTaskUuid = await submitWorkflow(
      page,
      backendAddress,
      materialWorkflowUuid
    )
    await expect.poll(
      () => workflowTaskStatus(backendAddress, materialTaskUuid),
      { timeout: 30_000, intervals: [100, 250, 500] }
    ).toMatch(/^(running|succeeded)$/)
    await captureElectronWindow(electronApp, '06-material-transfer-overall-process.png')
    await expect.poll(
      () => workflowTaskStatus(backendAddress, materialTaskUuid),
      { timeout: 240_000, intervals: [250, 500, 1_000] }
    ).toBe('succeeded')
    await new Promise(resolveDelay => setTimeout(resolveDelay, 750))
    await captureElectronWindow(electronApp, '07-material-transfer-overall-passed.png')
    const materialChildren = await captureSucceededSubworkflows(
      page,
      electronApp,
      '08-material-transfer-child-passed'
    )
    expect(materialChildren).toHaveLength(1)
    const afterMaterialGraph = await materialGraph(backendAddress)
    const movedCollectorRack = afterMaterialGraph.find(
      (node) => node.material.uuid === collectorRack?.material.uuid
    )
    expect(movedCollectorRack?.current_site_uuid).toBe(targetSiteUuid)
    const materialJointSamples = evidenceNamedJointValues(
      'workflow-joint-states.log',
      targetJointName
    )
    expect(materialJointSamples.length - initialWorkflowJointSamples)
      .toBeGreaterThan(10)
    writeFileSync(
      resolve(artifactDirectory, 'material-transfer-evidence.json'),
      `${JSON.stringify({
        workflowTask: await workflowTaskSnapshot(backendAddress, materialTaskUuid),
        collectorRackUuid: collectorRack?.material.uuid,
        sourceSiteUuid,
        targetSiteUuid,
        finalSiteUuid: movedCollectorRack?.current_site_uuid,
        childWorkflows: materialChildren,
        jointSampleDelta: materialJointSamples.length - initialWorkflowJointSamples
      }, null, 2)}\n`
    )
    writeFileSync(
      resolve(artifactDirectory, 'material-graph-after.json'),
      `${JSON.stringify(afterMaterialGraph, null, 2)}\n`
    )

    await page.getByRole('button', { name: '环境管理' }).click()
    const runtimeMode = page.getByRole('group', { name: 'OS 运行模式' })
    await runtimeMode.getByRole('button', { name: 'Dry-run' }).click()
    await expect(runtimeMode.getByRole('button', { name: 'Dry-run（当前）' }))
      .toHaveAttribute('aria-pressed', 'true', { timeout: 240_000 })
    await expect.poll(() => {
      const current = readRuntimeSession(workspacePath)
      return current.components.backend.phase === 'ready'
        && current.components.edge.phase === 'ready'
        && current.components.backend.generation
          !== normalRuntime.components.backend.generation
        && current.components.edge.generation
          !== normalRuntime.components.edge.generation
        && current.components.backend.metadata.runtimeMode === 'dry-run'
        && current.components.edge.metadata.runtimeMode === 'dry-run'
    }, { timeout: 240_000, intervals: [250, 500, 1_000] }).toBe(true)
    await expect(workbench).toHaveAttribute('data-edge-runtime-phase', 'ready', {
      timeout: 60_000
    })
    const dryRunOverlay = page.locator('.unilab-environment-manager__overlay')
    if (await dryRunOverlay.isVisible().catch(() => false)) {
      await page.locator('.unilab-environment-manager__backdrop').click({ force: true })
      await expect(dryRunOverlay).toBeHidden()
    }
    backendAddress = readRuntimeSession(workspacePath).components.backend.address

    // The runtime-mode change replaces both backend processes and therefore their
    // loopback ports. Reload the Workbench shell so every domain client is rebuilt
    // from the new authoritative workspace session before submitting another task.
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(workbench).toBeVisible({ timeout: 60_000 })
    await expect(workbench).toHaveAttribute('data-workspace-backend-phase', 'ready', {
      timeout: 180_000
    })
    await expect(workbench).toHaveAttribute('data-edge-runtime-phase', 'ready', {
      timeout: 180_000
    })
    const reloadedOverlay = page.locator('.unilab-environment-manager__overlay')
    if (await reloadedOverlay.isVisible().catch(() => false)) {
      await page.locator('.unilab-environment-manager__backdrop').click({ force: true })
      await expect(reloadedOverlay).toBeHidden()
    }
    if (await page.locator('[data-workbench-view]').getAttribute(
      'data-workbench-view'
    ) !== 'workflow') {
      await activateDomain(page, 'workflow')
    }

    const productionWorkflowUuid = 'd14321bc-c776-5978-86f2-f487161a047e'
    await openWorkflow(page, 'pTLC 全流程 v2', productionWorkflowUuid)
    const productionGraph = await workflowGraph(
      backendAddress,
      productionWorkflowUuid
    )
    const topLevelProductionNodes = productionGraph.nodes.filter(
      (node) => !node.parent_uuid
    )
    const compositeNodeCount = productionGraph.nodes.filter(
      (node) => node.type === 'workflow'
    ).length
    expect(productionGraph.nodes).toHaveLength(261)
    expect(productionGraph.edges).toHaveLength(195)
    expect(topLevelProductionNodes).toHaveLength(29)
    expect(topLevelProductionNodes.map((node) => node.name)).toEqual(
      expect.arrayContaining(['pTLC 整架物料转移', 'Material Source'])
    )
    await expect(page.locator(
      '.persistent-authoring__stage-header:visible'
    )).toContainText('261 个节点 · 195 条边', { timeout: 90_000 })
    const productionTaskUuid = await submitWorkflow(
      page,
      backendAddress,
      productionWorkflowUuid
    )
    const fullBranches = page.getByRole('button', { name: '完整支线' })
    if (await fullBranches.getAttribute('aria-pressed') !== 'true') {
      await fullBranches.click()
    }
    await expect(fullBranches).toHaveAttribute('aria-pressed', 'true')
    await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find((candidate) =>
        (candidate.getAttribute('aria-label') ?? candidate.textContent ?? '')
          .includes('适应完整工作流视图')
      ) as HTMLButtonElement | undefined
      button?.click()
    })
    await expect.poll(() => page.locator(
      '[data-workflow-node-uuid][data-workflow-node-kind]:visible'
    ).count(), { timeout: 90_000, intervals: [100, 250, 500] })
      .toBeGreaterThan(10)
    await captureElectronWindow(electronApp, '09-production-overall-start.png')
    await expect.poll(
      () => workflowTaskStatus(backendAddress, productionTaskUuid),
      { timeout: 300_000, intervals: [250, 500, 1_000] }
    ).toBe('succeeded')
    await new Promise(resolveDelay => setTimeout(resolveDelay, 1_000))
    await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find((candidate) =>
        (candidate.getAttribute('aria-label') ?? candidate.textContent ?? '')
          .includes('适应完整工作流视图')
      ) as HTMLButtonElement | undefined
      button?.click()
    })
    await captureElectronWindow(electronApp, '10-production-overall-passed.png')
    const productionChildren = await captureSucceededSubworkflows(
      page,
      electronApp,
      '11-production-child-passed'
    )
    expect(productionChildren).toHaveLength(compositeNodeCount)
    expect(productionChildren.map((child) => child.name))
      .toContain('pTLC 整架物料转移')
    const productionSnapshot = await workflowTaskSnapshot(
      backendAddress,
      productionTaskUuid
    ) as {
      data: {
        execution_plan: {
          nodes: Array<{
            action_name?: string
            device_id?: string
            param?: Record<string, unknown>
          }>
        }
      }
    }
    const siteDrivenRobotActions = productionSnapshot.data.execution_plan.nodes
      .filter((node) => node.device_id === 'robot'
        && (node.action_name === 'pick' || node.action_name === 'place'))
      .map((node) => ({ action: node.action_name, site: node.param?.site }))
    expect(siteDrivenRobotActions).toEqual(expect.arrayContaining([
      { action: 'pick', site: 'group_rack_warehouse/collector-rack-1' },
      { action: 'place', site: 'staging_a_stack/rack' }
    ]))
    const productionMaterialGraph = await materialGraph(backendAddress)
    const productionCollectorRack = productionMaterialGraph.find(
      (node) => node.material.uuid === collectorRack?.material.uuid
    )
    writeFileSync(
      resolve(artifactDirectory, 'production-workflow-evidence.json'),
      `${JSON.stringify({
        workflowTask: productionSnapshot,
        publishedNodeCount: 261,
        publishedEdgeCount: 195,
        topLevelNodeCount: 29,
        compositeNodeCount,
        childWorkflowCount: productionChildren.length,
        childWorkflows: productionChildren,
        siteDrivenRobotActions,
        materialTransfer: {
          collectorRackUuid: collectorRack?.material.uuid,
          sourceSite: 'group_rack_warehouse/collector-rack-1',
          targetSite: 'staging_a_stack/rack',
          sourceSiteUuid,
          targetSiteUuid,
          finalSiteUuid: productionCollectorRack?.current_site_uuid
        }
      }, null, 2)}\n`
    )

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
