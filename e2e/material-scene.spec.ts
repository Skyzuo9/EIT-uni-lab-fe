import { expect, test, type Page } from '@playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import {
  createWriteStream,
  mkdirSync,
  writeFileSync
} from 'node:fs'
import { resolve } from 'node:path'

const CORE_ROOT = resolve(process.cwd(), '..')
const OS_ROOT = resolve(CORE_ROOT, 'Uni-Lab-OS')
const ARTIFACT_ROOT = resolve(
  CORE_ROOT,
  'e2e-artifacts',
  'materials'
)
const OS_PYTHON =
  process.env.UNILAB_OS_PYTHON ||
  '/home/changjunhan/.micromamba/envs/unilab/bin/python'
const API_URL = 'http://127.0.0.1:8014'
// Xvfb/SwiftShader cannot execute Pascal 0.9.2's native WebGPU post-FX
// pipeline reliably. This is a test-only escape hatch; product URLs keep the
// native Pascal pipeline enabled. Hardware-backed CI can opt in to it.
const MATERIAL_SCENE_URL =
  process.env.UNILAB_E2E_NATIVE_POSTFX === '1'
    ? '/'
    : '/?disable=postFx'

interface Scenario {
  id: string
  title: string
  graph: string
  expectedCodes: readonly string[]
  expectedStackCodes?: readonly string[]
}

const SCENARIOS: readonly Scenario[] = [
  {
    id: 'liquid-handler-original',
    title: '原始 liquid_handler',
    graph: 'plr_test.json',
    expectedCodes: [
      'PLR_STATION',
      'deck',
      'trash',
      'trash_core96',
      'teaching_carrier',
      'teaching_tip_rack',
      'tip_rack',
      'plate'
    ]
  },
  {
    id: 'plr-test-converted',
    title: 'plr_test_converted.json',
    graph: 'plr_test_converted.json',
    expectedCodes: [
      'liquid_handler',
      'deck',
      'tip_rack',
      'plate_well',
      'arm_slider',
      'hotel'
    ],
    expectedStackCodes: ['hotel']
  }
]

test.describe.configure({ mode: 'serial' })

for (const scenario of SCENARIOS) {
  test(`${scenario.title} 在同一场景切换 2D / 2.5D / 3D / Split`, async ({
    page
  }) => {
    mkdirSync(ARTIFACT_ROOT, { recursive: true })
    const os = await startOs(scenario)
    try {
      const apiCalls: Array<{
        method: string
        status: number
        url: string
      }> = []
      const browserErrors: string[] = []
      page.on('response', (response) => {
        if (!response.url().startsWith(API_URL)) return
        apiCalls.push({
          method: response.request().method(),
          status: response.status(),
          url: response.url()
        })
      })
      page.on('pageerror', (error) => {
        browserErrors.push(error.message)
      })
      page.on('console', (message) => {
        if (message.type() === 'error') {
          browserErrors.push(message.text())
        }
      })

      await installReviewLayout(page)
      await page.goto(MATERIAL_SCENE_URL)
      await page.getByRole('button', { name: /物料/ }).click()
      await connectToOs(page)

      await expect(
        page.locator('.lab-unified-viewport')
      ).toHaveAttribute('data-lab-view-mode', '2d')
      await expect(page.locator('.pascal-editor-host')).toHaveCount(1)
      await expect(page.locator('.pascal-editor-host')).toBeVisible()
      await expect(
        page.locator(
          '.floorplan-registry-base .floorplan-registry-entry[data-node-id^="lab-"]'
        )
      ).toHaveCount(scenario.expectedCodes.length)
      await expect(
        page.locator('[data-pascal-floorplan-overlay]')
      ).toBeVisible()
      await expect(
        page.locator('.pascal-lab-toolbar__actions')
      ).toHaveCount(0)
      await expect(page.locator('.material-flow-node')).toHaveCount(
        scenario.expectedCodes.length
      )
      await expect(page.locator('.material-flow-node').first()).toBeVisible()
      for (const code of scenario.expectedCodes) {
        await expect(
          page
            .locator('.material-flow-node header')
            .getByText(code, { exact: true })
        ).toHaveCount(1)
      }
      await captureViewport(page, scenario.id, '2d')

      await page.getByRole('button', { name: '2.5D', exact: true }).click()
      await expect(
        page.locator('.lab-unified-viewport')
      ).toHaveAttribute('data-lab-view-mode', '2.5d')
      await expect(page.locator('[data-material-oblique-view]')).toBeVisible()
      await expect(page.locator('.material-oblique-object')).toHaveCount(
        scenario.expectedCodes.length
      )
      for (const code of scenario.expectedCodes) {
        await expect(
          page.locator(
            `.material-oblique-object[data-material-code="${code}"]`
          )
        ).toHaveCount(1)
      }
      await expect(
        page.locator('.material-oblique-labware__rim').first()
      ).toBeVisible()
      expect(
        await page.locator('.material-oblique-site').count()
      ).toBeGreaterThanOrEqual(96)
      expect(
        await page.locator('[data-site-label]').count()
      ).toBeGreaterThan(0)
      await expect(
        page.locator('[data-site-label]').first()
      ).not.toHaveAttribute('data-site-label', '')
      for (const code of scenario.expectedStackCodes ?? []) {
        const stack = page.locator(
          `.material-oblique-object[data-material-code="${code}"][data-oblique-render-style="stack"]`
        )
        await expect(stack).toHaveCount(1)
        expect(
          await stack.locator('.material-oblique-stack__shelf').count()
        ).toBeGreaterThanOrEqual(4)
      }
      await captureViewport(page, scenario.id, '2.5d')

      await page.getByRole('button', { name: 'Split', exact: true }).click()
      await expect(
        page.locator('.lab-unified-viewport')
      ).toHaveAttribute('data-lab-view-mode', 'split')
      await expect(page.locator('.pascal-editor-host')).toBeVisible()
      await expect(page.locator('.floorplan-registry-layer')).toBeVisible()
      await expect(
        page.locator('[data-pascal-floorplan-overlay]')
      ).toBeVisible()
      await expect(
        page.locator('.pascal-lab-toolbar__status')
      ).toHaveText(`${scenario.expectedCodes.length} 个物料 · 只读`)
      await expect(
        page.locator('.pascal-editor-host canvas').first()
      ).toBeVisible()
      await resizeNativeSplitPane(page)
      const dismissCameraHint = page.getByRole('button', {
        name: 'Dismiss camera controls hint'
      })
      if (await dismissCameraHint.isVisible()) {
        await dismissCameraHint.dispatchEvent('click')
      }
      await page
        .getByRole('button', { name: '适配场景' })
        .click()
      await page.waitForTimeout(2_000)
      await captureViewport(page, scenario.id, 'split')

      await page.getByRole('button', { name: '3D', exact: true }).click()
      await expect(
        page.locator('.lab-unified-viewport')
      ).toHaveAttribute('data-lab-view-mode', '3d')
      await expect(page.locator('.pascal-editor-host')).toBeVisible()
      await expect(page.locator('.floorplan-registry-layer')).toBeHidden()
      await expect(
        page.locator('[data-pascal-floorplan-overlay]')
      ).toBeHidden()
      await captureViewport(page, scenario.id, '3d')

      await page.getByRole('button', { name: 'Split', exact: true }).click()

      const materialResponse = await page.request.get(
        `${API_URL}/api/v1/materials?page=1&page_size=100`
      )
      expect(materialResponse.status()).toBe(200)
      const materialPage = await materialResponse.json()
      expect(
        materialPage.data.items
          .map((item: { code: string }) => item.code)
          .sort()
      ).toEqual([...scenario.expectedCodes].sort())

      const screenshot = resolve(
        ARTIFACT_ROOT,
        `${scenario.id}-2d-3d.png`
      )
      await page.locator('.lab-unified-viewport').screenshot({
        path: screenshot,
        animations: 'disabled'
      })
      const result = {
        outcome: 'passed',
        scenario,
        screenshot,
        os: {
          pid: os.process.pid,
          command: os.command,
          log: os.log
        },
        apiCalls,
        browserErrors
      }
      writeFileSync(
        resolve(ARTIFACT_ROOT, `${scenario.id}-result.json`),
        JSON.stringify(result, null, 2)
      )

      expect(
        apiCalls.some(
          (call) =>
            call.method === 'GET' &&
            call.status === 200 &&
            call.url.includes('/api/v1/materials')
        )
      ).toBe(true)
      expect(browserErrors).toEqual([])
    } finally {
      await stopOs(os.process)
    }
  })
}

async function resizeNativeSplitPane(page: Page): Promise<void> {
  const editor = page.locator('.pascal-lab-editor')
  const overlay = page.locator('[data-pascal-floorplan-overlay]')
  const divider = editor.locator('.cursor-col-resize:visible').first()
  await expect(divider).toBeVisible()

  const [editorBox, overlayBefore, dividerBox] = await Promise.all([
    editor.boundingBox(),
    overlay.boundingBox(),
    divider.boundingBox()
  ])
  expect(editorBox).not.toBeNull()
  expect(overlayBefore).not.toBeNull()
  expect(dividerBox).not.toBeNull()
  if (!editorBox || !overlayBefore || !dividerBox) return

  const targetRatio = 0.42
  await page.mouse.move(
    dividerBox.x + dividerBox.width - 1,
    dividerBox.y + dividerBox.height / 2
  )
  await page.mouse.down()
  await page.mouse.move(
    editorBox.x + editorBox.width * targetRatio,
    dividerBox.y + dividerBox.height / 2,
    { steps: 8 }
  )
  await page.mouse.up()

  await expect
    .poll(async () => {
      const box = await overlay.boundingBox()
      return box ? box.width / editorBox.width : 0
    })
    .toBeCloseTo(targetRatio, 1)
}

async function captureViewport(
  page: Page,
  scenarioId: string,
  mode: '2d' | '2.5d' | '3d' | 'split'
): Promise<void> {
  await page.locator('.lab-unified-viewport').screenshot({
    path: resolve(ARTIFACT_ROOT, `${scenarioId}-${mode}.png`),
    animations: 'disabled'
  })
}

async function installReviewLayout(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem(
      'unilab.panel-layout.lab.v1',
      JSON.stringify({
        version: 1,
        layout: {
          id: 'material-e2e-group',
          type: 'group',
          panels: [
            {
              id: 'material-e2e-unified',
              panelType: 'layout-unified'
            }
          ],
          activePanelId: 'material-e2e-unified'
        }
      })
    )
    localStorage.setItem('unilab.lab.view-mode', '2d')
  })
}

async function connectToOs(page: Page): Promise<void> {
  await page.getByRole('button', { name: '离线', exact: true }).click()
  await expect(
    page.getByRole('button', { name: '在线', exact: true })
  ).toBeVisible()
  await expect(
    page.getByText('已连接', { exact: true })
  ).toBeVisible()
}

async function startOs(scenario: Scenario): Promise<{
  process: ChildProcess
  command: readonly string[]
  log: string
}> {
  const graphPath = resolve(
    OS_ROOT,
    'unilabos',
    'test',
    'experiments',
    scenario.graph
  )
  const journalPath = resolve(
    ARTIFACT_ROOT,
    `${scenario.id}-runtime.sqlite`
  )
  const logPath = resolve(
    ARTIFACT_ROOT,
    `${scenario.id}-os.log`
  )
  const args = [
    '-m',
    'unilabos.app.local_bridge.server',
    '--offline',
    '--host',
    '127.0.0.1',
    '--api-port',
    '8014',
    '--schedule-port',
    '18890',
    '--workflow-port',
    '18891',
    '--journal-path',
    journalPath,
    '--material-graph',
    graphPath
  ] as const
  const log = createWriteStream(logPath, { flags: 'w' })
  const child = spawn(OS_PYTHON, args, {
    cwd: OS_ROOT,
    env: {
      ...process.env,
      PYTHONPATH: OS_ROOT
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  child.stdout?.pipe(log)
  child.stderr?.pipe(log)

  try {
    await waitForHealth(child)
  } catch (error) {
    await stopOs(child)
    log.end()
    throw error
  }
  return {
    process: child,
    command: [OS_PYTHON, ...args],
    log: logPath
  }
}

async function waitForHealth(child: ChildProcess): Promise<void> {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    if (child.exitCode != null) {
      throw new Error(
        `Uni-Lab-OS exited before health check: ${child.exitCode}`
      )
    }
    try {
      const response = await fetch(`${API_URL}/health`)
      if (response.ok) return
    } catch {
      // The OS process is still binding its three local transports.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100))
  }
  throw new Error('Timed out waiting for Uni-Lab-OS /health')
}

async function stopOs(child: ChildProcess): Promise<void> {
  if (child.exitCode != null) return
  child.kill('SIGINT')
  await Promise.race([
    once(child, 'exit'),
    new Promise((resolveWait) => setTimeout(resolveWait, 5_000))
  ])
  if (child.exitCode == null) {
    child.kill('SIGKILL')
    await once(child, 'exit')
  }
}
