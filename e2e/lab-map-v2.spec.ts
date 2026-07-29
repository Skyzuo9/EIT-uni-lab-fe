import { expect, test, type Page } from '@playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import {
  createWriteStream,
  mkdirSync,
  writeFileSync
} from 'node:fs'
import { resolve } from 'node:path'

const WORKSPACE_ROOT = resolve(process.cwd(), '..')
const OS_ROOT = resolve(WORKSPACE_ROOT, 'Uni-Lab-OS')
const ARTIFACT_ROOT = resolve(
  WORKSPACE_ROOT,
  'e2e-artifacts',
  'lab-map-v2'
)
const OS_PYTHON =
  process.env.UNILAB_OS_PYTHON ||
  '/home/changjunhan/.micromamba/envs/unilab/bin/python'
const API_URL = 'http://127.0.0.1:8014'
const GRAPH_PATH = resolve(
  OS_ROOT,
  'unilabos',
  'test',
  'experiments',
  'plr_test_converted.json'
)
const EXPERIMENT_URL =
  '/?disable=postFx&experimentalLabMapV2=1'

test.describe.configure({ mode: 'serial' })

test('Lab Map V2 使用真实 Material Graph 且不影响旧 2.5D', async ({
  page
}) => {
  mkdirSync(ARTIFACT_ROOT, { recursive: true })
  const os = await startOs()
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
    if (message.type() === 'error') browserErrors.push(message.text())
  })

  try {
    await page.goto(EXPERIMENT_URL)
    const materialGraphLoaded = page.waitForResponse(
      (response) =>
        response.url().startsWith(`${API_URL}/api/v1/materials?`) &&
        response.status() === 200
    )
    await page.getByRole('button', { name: /物料/ }).click()
    const offlineToggle = page.getByRole('button', {
      name: '离线',
      exact: true
    })
    if (await offlineToggle.isVisible()) {
      await offlineToggle.click()
    }
    await materialGraphLoaded

    const experimentTab = page.getByRole('tab', {
      name: '实验室地图（实验）'
    })
    await expect(experimentTab).toBeVisible()
    await experimentTab.click()

    const map = page.locator('[data-experimental-lab-map-v2]')
    await expect(map).toBeVisible()
    await expect(
      page.locator('[data-panel-type="experimental-lab-map-v2"]')
    ).toBeVisible()
    await expect(map.locator('[data-lab-map-zone]')).toHaveCount(3)
    await expect(map.locator('[data-lab-map-wall]')).toHaveCount(5)
    await expect(map.locator('[data-lab-map-opening]')).toHaveCount(1)
    await expect(map.locator('[data-lab-map-obstacle]')).toHaveCount(1)
    await expect(map.locator('[data-lab-map-utility]')).toHaveCount(3)
    await expect(
      map.locator('[data-lab-map-material-origin]')
    ).toHaveCount(1)

    const materialResponse = await page.request.get(
      `${API_URL}/api/v1/materials?page=1&page_size=100`
    )
    expect(materialResponse.status()).toBe(200)
    const materialPage = await materialResponse.json() as {
      data: {
        items: Array<{ uuid: string }>
      }
    }
    const modelResponse = await page.request.get(
      `${API_URL}/api/v1/material-models`
    )
    expect(modelResponse.status()).toBe(200)

    const materialObjects = map.locator('[data-material-id]')
    const mapObjectCount = await materialObjects.count()
    expect(mapObjectCount).toBeGreaterThan(0)
    expect(mapObjectCount).toBeLessThanOrEqual(
      materialPage.data.items.length
    )

    const overviewScreenshot = resolve(
      ARTIFACT_ROOT,
      'lab-map-v2-overview.png'
    )
    await map.screenshot({
      path: overviewScreenshot,
      animations: 'disabled'
    })

    await map.getByRole('button', { name: '添加设备' }).click()
    const equipmentCatalog = map.locator(
      '[data-lab-map-equipment-catalog]'
    )
    await expect(equipmentCatalog).toBeVisible()
    await expect(
      equipmentCatalog.locator('[data-equipment-template-id]')
    ).toHaveCount(6)
    await expect(
      equipmentCatalog.locator(
        '[data-equipment-preview="isometric"]'
      )
    ).toHaveCount(6)
    const equipmentLibraryScreenshot = resolve(
      ARTIFACT_ROOT,
      'lab-map-v2-equipment-library.png'
    )
    await map.screenshot({
      path: equipmentLibraryScreenshot,
      animations: 'disabled'
    })

    await equipmentCatalog
      .getByRole('button', { name: '添加液体工作站' })
      .click()
    const draftEquipment = map.locator(
      '[data-lab-map-draft-template-id="liquid-handler"]'
    )
    await expect(draftEquipment).toHaveCount(1)
    await expect(
      draftEquipment.locator(
        '[data-equipment-visual="liquid-handler"]'
      )
    ).toHaveCount(1)
    await expect(
      map.locator('[data-lab-map-draft-selection]')
    ).toBeVisible()
    await equipmentCatalog
      .getByRole('button', { name: '关闭设备库' })
      .click()

    const draftPositionBefore = [
      await draftEquipment.getAttribute('data-position-x'),
      await draftEquipment.getAttribute('data-position-y')
    ].join(',')
    const draftBox = await draftEquipment.boundingBox()
    expect(draftBox).not.toBeNull()
    if (!draftBox) throw new Error('Draft equipment has no bounding box')
    await page.mouse.move(
      draftBox.x + draftBox.width / 2,
      draftBox.y + draftBox.height / 2
    )
    await page.mouse.down()
    await page.mouse.move(
      draftBox.x + draftBox.width / 2 + 70,
      draftBox.y + draftBox.height / 2 + 45,
      { steps: 8 }
    )
    await page.mouse.up()
    await expect
      .poll(async () =>
        [
          await draftEquipment.getAttribute('data-position-x'),
          await draftEquipment.getAttribute('data-position-y')
        ].join(',')
      )
      .not.toBe(draftPositionBefore)

    const draftInspector = map.locator(
      '[data-lab-map-draft-selection]'
    )
    await draftInspector
      .getByRole('button', { name: '旋转 90°' })
      .click()
    await expect(draftEquipment).toHaveAttribute('data-rotation', '90')
    expect(
      await page.evaluate(() => {
        const value = localStorage.getItem(
          'unilab.lab-map-v2.demo-lab-map-v2.draft-equipment.v1'
        )
        return value ? JSON.parse(value).length : 0
      })
    ).toBe(1)

    const draftLayoutScreenshot = resolve(
      ARTIFACT_ROOT,
      'lab-map-v2-draft-layout.png'
    )
    await map.screenshot({
      path: draftLayoutScreenshot,
      animations: 'disabled'
    })

    await draftInspector
      .getByRole('button', { name: '删除草稿' })
      .click()
    await expect(map.locator('[data-lab-map-draft-id]')).toHaveCount(0)

    const selectedObject = materialObjects.first()
    const selectedMaterialId =
      await selectedObject.getAttribute('data-material-id')
    expect(selectedMaterialId).toBeTruthy()
    await selectedObject.click()
    await expect(
      map.locator(
        `[data-lab-map-selection="${selectedMaterialId}"]`
      )
    ).toBeVisible()

    const zoomIndicator = map.locator(
      '[data-lab-map-zoom-percent]'
    )
    const zoomBefore = Number(
      await zoomIndicator.getAttribute('data-lab-map-zoom-percent')
    )
    await map.getByRole('button', { name: '放大' }).click()
    await expect
      .poll(async () =>
        Number(
          await zoomIndicator.getAttribute(
            'data-lab-map-zoom-percent'
          )
        )
      )
      .toBeGreaterThan(zoomBefore)

    const selectedScreenshot = resolve(
      ARTIFACT_ROOT,
      'lab-map-v2-selected.png'
    )
    await map.screenshot({
      path: selectedScreenshot,
      animations: 'disabled'
    })

    await page.getByRole('tab', { name: '实验室视图' }).click()
    await page.getByRole('button', { name: '2.5D', exact: true }).click()
    const legacyViewport = page.locator('.lab-unified-viewport')
    await expect(legacyViewport).toHaveAttribute(
      'data-lab-view-mode',
      '2.5d'
    )
    await expect(page.locator('[data-material-oblique-view]')).toBeVisible()
    await expect(
      page.locator(
        `.material-oblique-object[data-material-id="${selectedMaterialId}"]`
      )
    ).toHaveClass(/is-selected/)

    const legacyScreenshot = resolve(
      ARTIFACT_ROOT,
      'legacy-2.5d-after-lab-map-v2.png'
    )
    await legacyViewport.screenshot({
      path: legacyScreenshot,
      animations: 'disabled'
    })

    expect(
      apiCalls.some(
        (call) =>
          call.method === 'GET' &&
          call.status === 200 &&
          call.url.includes('/api/v1/materials')
      )
    ).toBe(true)
    expect(browserErrors).toEqual([])

    writeFileSync(
      resolve(ARTIFACT_ROOT, 'result.json'),
      JSON.stringify(
        {
          outcome: 'passed',
          graph: GRAPH_PATH,
          selectedMaterialId,
          materialCount: materialPage.data.items.length,
          mapObjectCount,
          screenshots: [
            overviewScreenshot,
            equipmentLibraryScreenshot,
            draftLayoutScreenshot,
            selectedScreenshot,
            legacyScreenshot
          ],
          os: {
            pid: os.process.pid,
            command: os.command,
            log: os.log
          },
          apiCalls,
          browserErrors
        },
        null,
        2
      )
    )
  } finally {
    await stopOs(os.process)
  }
})

async function startOs(): Promise<{
  process: ChildProcess
  command: readonly string[]
  log: string
}> {
  const journalPath = resolve(
    ARTIFACT_ROOT,
    'runtime.sqlite'
  )
  const logPath = resolve(ARTIFACT_ROOT, 'os.log')
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
    '--journal-path',
    journalPath,
    '--graph',
    GRAPH_PATH
  ] as const
  const log = createWriteStream(logPath, { flags: 'w' })
  const child = spawn(OS_PYTHON, args, {
    cwd: OS_ROOT,
    env: {
      ...process.env,
      PYTHONPATH: OS_ROOT,
      PYTHONUNBUFFERED: '1'
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
  const deadline = Date.now() + 30_000
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
      // The local bridge is still binding its transports.
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
