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

interface Scenario {
  id: string
  title: string
  graph: string
  expectedCodes: readonly string[]
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
    ]
  }
]

test.describe.configure({ mode: 'serial' })

for (const scenario of SCENARIOS) {
  test(`${scenario.title} 同屏显示 2D 与 3D 物料`, async ({
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
      await page.goto('/?disable=postFx')
      await page.getByRole('button', { name: /物料/ }).click()
      await connectToOs(page)

      const nodes = page.locator('.material-flow-node')
      await expect(nodes).toHaveCount(scenario.expectedCodes.length)
      for (const code of scenario.expectedCodes) {
        await expect(
          page
            .locator('.material-flow-node header')
            .getByText(code, { exact: true })
        ).toHaveCount(1)
      }

      await expect(page.locator('.pascal-editor-host')).toBeVisible()
      await expect(
        page.locator('.pascal-lab-toolbar__status')
      ).toHaveText(`${scenario.expectedCodes.length} 个物料 · 只读`)
      await expect(
        page.locator('.pascal-editor-host canvas').first()
      ).toBeVisible()
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
      await page.locator('.lab-unified-layout').screenshot({
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
  })
}

async function connectToOs(page: Page): Promise<void> {
  const mode = page.locator('.connbar__mode')
  await expect(mode).toHaveText('离线')
  await mode.click()
  await expect(mode).toHaveText('在线')
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
