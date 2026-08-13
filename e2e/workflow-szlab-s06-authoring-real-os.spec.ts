import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, test } from '@playwright/test'

import {
  startSzlabS06AuthoringOs,
  type SzlabMaterialWorkflowOs
} from './helpers/szlab-action-catalog-os'
import { saveWorkflowDraftOnly } from './helpers/workflow-runtime-ui'

let os: SzlabMaterialWorkflowOs

test.describe.configure({ mode: 'serial', timeout: 120_000 })

/** 在整组回归前启动只服务于 S06 工作流创作的隔离 OS。 */
test.beforeAll(async () => {
  os = await startSzlabS06AuthoringOs()
})

/** 在回归结束后停止隔离 OS，避免残留端口和后台进程。 */
test.afterAll(async () => {
  await os?.stop()
})

/** 验证 S06 Python 草稿与只读 JSON 投影切换时保持三个稳定节点。 */
test('S06 Python and JSON projections switch and keep the three-node topology', async ({
  page,
  request
}, testInfo) => {
  const authoringResponse = await request.get(
    `${os.url}/api/v1/workflows/${os.workflowUuid}/authoring`
  )
  expect(authoringResponse.ok(), os.logs()).toBe(true)
  const authoringEnvelope = await authoringResponse.json() as {
    code: number
    data: {
      candidate: {
        graph: {
          nodes: Array<{ uuid: string }>
        }
        normalized_python_source: string
      } | null
    }
  }
  expect(authoringEnvelope.code, os.logs()).toBe(0)
  expect(authoringEnvelope.data.candidate, os.logs()).not.toBeNull()
  expect(authoringEnvelope.data.candidate?.graph.nodes.map(({ uuid }) => uuid))
    .toEqual([
      'd22f090e-63c7-513e-89eb-6a634dbec638',
      'a31553c3-8a3d-5c1c-aa16-b759faf6894e',
      '2be817c5-3147-5199-b93d-be6e2ce045f8'
    ])

  const storageKey = `unilab.workflow.active.${
    encodeURIComponent(`local-python:${os.url}`)
  }.v1`
  await page.addInitScript(({ key, workflowUuid }) => {
    localStorage.setItem(
      key,
      JSON.stringify({ version: 1, workflowId: workflowUuid })
    )
  }, { key: storageKey, workflowUuid: os.workflowUuid })

  await page.goto(
    `/?section=workflow&localOsUrl=${encodeURIComponent(os.url)}`
  )
  const panel = page.getByRole('tabpanel', { name: '工作流' })
  await expect(panel.locator('.react-flow__node-wfNode')).toHaveCount(3)
  await expect(panel.getByText(
    '当前 JSON 未定义节点，无法生成拓扑图',
    { exact: true }
  )).toHaveCount(0)

  await panel.getByRole('button', {
    name: '代码模式',
    exact: true
  }).click()
  const pythonProjection = panel.getByRole('button', {
    name: 'Python',
    exact: true
  })
  const jsonProjection = panel.getByRole('button', {
    name: 'JSON',
    exact: true
  })
  await expect(pythonProjection).toBeVisible()
  await expect(jsonProjection).toBeVisible()

  const s06Source = readFileSync(resolve(
    process.env.UNILAB_SZLAB_REPOSITORY || '',
    'szlab_poly_studio/workflows/s06_robot.py'
  ), 'utf8')
  const importedSource = `# S06 Python/JSON 切换回归\n${s06Source}`
  await panel.locator('input[type="file"]').setInputFiles({
    name: 's06_robot.py',
    mimeType: 'text/x-python',
    buffer: Buffer.from(importedSource)
  })

  await pythonProjection.click()
  await expect(panel.locator('.cm-content:visible'))
    .toContainText('S06 Python/JSON 切换回归')

  await jsonProjection.click()
  const jsonEditor = panel.locator('.cm-content:visible')
  await expect(jsonEditor).toContainText('"nodes"')
  await expect(jsonEditor).toContainText(
    'd22f090e-63c7-513e-89eb-6a634dbec638'
  )

  await pythonProjection.click()
  await expect(panel.locator('.cm-content:visible'))
    .toContainText('S06 Python/JSON 切换回归')

  await saveWorkflowDraftOnly(panel)
  const normalizationDiff = page.getByRole('dialog', {
    name: '完整 Python 差异'
  })
  const applyButton = panel.getByRole('button', {
    name: '应用此版本',
    exact: true
  })
  await expect.poll(async () => (
    await normalizationDiff.isVisible() || await applyButton.isEnabled()
  )).toBe(true)
  if (await normalizationDiff.isVisible()) {
    await normalizationDiff.getByRole('button', {
      name: '接受完整差异并保存'
    }).click()
  }
  await expect(applyButton).toBeEnabled()
  await expect(panel.locator('.react-flow__node-wfNode')).toHaveCount(3)

  const savedResponse = await request.get(
    `${os.url}/api/v1/workflows/${os.workflowUuid}/authoring`
  )
  expect(savedResponse.ok(), os.logs()).toBe(true)
  const savedEnvelope = await savedResponse.json() as typeof authoringEnvelope
  expect(savedEnvelope.data.candidate?.graph.nodes.map(({ uuid }) => uuid))
    .toEqual([
      'd22f090e-63c7-513e-89eb-6a634dbec638',
      'a31553c3-8a3d-5c1c-aa16-b759faf6894e',
      '2be817c5-3147-5199-b93d-be6e2ce045f8'
    ])

  await page.setViewportSize({ width: 900, height: 720 })
  await jsonProjection.click()
  await expect(jsonProjection).toHaveAttribute('aria-pressed', 'true')
  const projectionSwitchFits = await panel.getByRole('group', {
    name: '代码视图格式'
  }).evaluate((element) => {
    const toolbar = element.closest(
      '.persistent-authoring__projection-toolbar'
    )
    if (!(toolbar instanceof HTMLElement)) return false
    const switchRect = element.getBoundingClientRect()
    const toolbarRect = toolbar.getBoundingClientRect()
    return (
      toolbar.scrollWidth <= toolbar.clientWidth + 1 &&
      switchRect.left >= toolbarRect.left &&
      switchRect.right <= toolbarRect.right
    )
  })
  expect(projectionSwitchFits).toBe(true)
  await panel.screenshot({
    path: testInfo.outputPath('s06-json-projection-900px.png'),
    animations: 'disabled'
  })
})
