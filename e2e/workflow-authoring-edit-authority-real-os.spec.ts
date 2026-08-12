import { expect, test } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'

import {
  startPersistentAuthoringOs,
  type PersistentAuthoringOs
} from './helpers/persistent-authoring-os'
import {
  clickNodeOutsideMiniMap,
  countRequests,
  dragNode,
  lastRequest,
  readWorkflowEnvelope,
  type AuthoringAggregate
} from './helpers/workflow-authoring-assertions'
import {
  applyWorkflowCandidateWithoutTask,
  saveWorkflowDraftOnly
} from './helpers/workflow-runtime-ui'

let os: PersistentAuthoringOs

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  os = await startPersistentAuthoringOs()
})

test.afterAll(async () => {
  await os?.stop()
})

/**
 * 读取当前真实操作系统（OS）的统一响应封装。
 *
 * @param url HTTP 资源地址。
 * @param init 可选请求参数。
 * @returns 响应中的权威 data。
 */
async function readEnvelope<Value>(
  url: string,
  init?: RequestInit
): Promise<Value> {
  return readWorkflowEnvelope<Value>(os, url, init)
}

test('kernel-web uses D-117 single edit authority through the real OS', async ({
  page
}) => {
  test.setTimeout(90_000)
  const browserErrors: string[] = []
  const authoringRequests: Array<{
    method: string
    url: string
    body: unknown
  }> = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('pageerror', (error) => browserErrors.push(error.message))
  page.on('request', (request) => {
    if (!request.url().startsWith(`${os.url}/api/v1/`)) return
    let body: unknown = null
    try {
      body = request.postDataJSON()
    } catch {
      body = request.postData()
    }
    authoringRequests.push({
      method: request.method(),
      url: request.url(),
      body
    })
  })

  const activeWorkflowStorageKey = `unilab.workflow.active.${
    encodeURIComponent(`local-python:${os.url}`)
  }.v1`
  await page.addInitScript(
    ({ storageKey, workflowUuid }) => {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ version: 1, workflowId: workflowUuid })
      )
    },
    {
      storageKey: activeWorkflowStorageKey,
      workflowUuid: os.workflowUuid
    }
  )

  await page.goto(
    `/?section=workflow&localOsUrl=${encodeURIComponent(os.url)}`
  )
  await expect(page.getByText('完整控制流 DAG')).toBeVisible()

  const codeMode = page.getByRole('button', {
    name: '代码模式',
    exact: true
  })
  const canvasMode = page.getByRole('button', {
    name: '画布模式',
    exact: true
  })
  await expect(codeMode).toBeVisible()
  await expect(canvasMode).toBeVisible()
  await expect(codeMode).toHaveAttribute('aria-pressed', 'true')
  await expect(canvasMode).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByText(/画布.*只读.*投影/)).toBeVisible()

  await expect.poll(() => countRequests(
    authoringRequests,
    'GET',
    `/workflows/${os.workflowUuid}/authoring`
  )).toBeGreaterThanOrEqual(1)
  await expect.poll(() => countRequests(
    authoringRequests,
    'GET',
    '/events'
  )).toBeGreaterThanOrEqual(1)

  const editor = page.locator('.cm-content:visible')
  await expect(editor).toHaveAttribute('contenteditable', 'true')
  const projectedNode = page.locator('.react-flow__node-wfNode').first()
  await expect(projectedNode).toBeVisible()
  const projectedPosition = await projectedNode.getAttribute('style')
  await dragNode(page, projectedNode, 80, 40)
  expect(await projectedNode.getAttribute('style')).toBe(projectedPosition)

  const initialEditorSource = readFileSync(os.sourcePath, 'utf8')
  const locallyEditedSource = initialEditorSource.replace('= 3,', '= 4,')
  expect(locallyEditedSource).not.toBe(initialEditorSource)
  await editor.click()
  await page.keyboard.press('Control+a')
  await page.keyboard.insertText(locallyEditedSource)
  const startFlowButton = page.getByRole('button', {
    name: '开始运行',
    exact: true
  })
  await expect(startFlowButton).toBeEnabled()

  await canvasMode.click()
  const dirtyGuard = page.getByRole('dialog', { name: /未保存.*切换/ })
  await expect(dirtyGuard).toBeVisible()
  await dirtyGuard.getByRole('button', { name: /取消/ }).click()
  await expect(codeMode).toHaveAttribute('aria-pressed', 'true')
  await expect(editor).toContainText('= 4,')

  const draftPutBeforeCodeSave = countRequests(
    authoringRequests,
    'PUT',
    `/workflows/${os.workflowUuid}/authoring/draft`
  )
  await saveWorkflowDraftOnly(page.locator('body'))
  const codeSourceDiff = page.getByRole('dialog', {
    name: '完整 Python 差异'
  })
  const codeSavedMessage = page.getByText(
    '草稿已保存，有尚未应用的工作流修改',
    { exact: true }
  )
  await expect.poll(async () =>
    await codeSourceDiff.isVisible() || await codeSavedMessage.isVisible()
  ).toBe(true)
  let expectedCodeDraftWrites = 1
  if (await codeSourceDiff.isVisible()) {
    await codeSourceDiff.getByRole('button', {
      name: '接受完整差异并保存',
      exact: true
    }).click()
    expectedCodeDraftWrites = 2
  }
  await expect.poll(() => countRequests(
    authoringRequests,
    'PUT',
    `/workflows/${os.workflowUuid}/authoring/draft`
  )).toBe(draftPutBeforeCodeSave + expectedCodeDraftWrites)
  await expect(codeSavedMessage).toBeVisible()
  expect(readFileSync(os.sourcePath, 'utf8')).toContain('= 4,')
  await expect(page.getByText('● 未保存', { exact: true })).toHaveCount(0)
  await expect(page.getByText('工作流编辑操作失败', { exact: true }))
    .toHaveCount(0)
  const codeDraftRequest = lastRequest(
    authoringRequests,
    'PUT',
    `/workflows/${os.workflowUuid}/authoring/draft`
  )
  expect(Object.keys(codeDraftRequest.body as Record<string, unknown>).sort())
    .toEqual([
      'expected_draft_hash',
      'expected_workflow_revision',
      'python_source'
    ])

  const aggregateGetsBeforeExternalEdit = countRequests(
    authoringRequests,
    'GET',
    `/workflows/${os.workflowUuid}/authoring`
  )
  const sourceBeforeExternalEdit = readFileSync(os.sourcePath, 'utf8')
  const externallyEditedSource = sourceBeforeExternalEdit.includes('= 4,')
    ? sourceBeforeExternalEdit.replace('= 4,', '= 5,')
    : sourceBeforeExternalEdit.replace('= 3,', '= 4,')
  expect(externallyEditedSource).not.toBe(sourceBeforeExternalEdit)
  const localConflictSource = sourceBeforeExternalEdit.includes('= 4,')
    ? sourceBeforeExternalEdit.replace('= 4,', '= 6,')
    : sourceBeforeExternalEdit.replace('= 3,', '= 6,')
  await editor.click()
  await page.keyboard.press('Control+a')
  await page.keyboard.insertText(localConflictSource)
  await expect(startFlowButton).toHaveText('开始运行')
  await expect(startFlowButton).toBeEnabled()
  writeFileSync(os.sourcePath, externallyEditedSource, 'utf8')
  await expect.poll(() => countRequests(
    authoringRequests,
    'GET',
    `/workflows/${os.workflowUuid}/authoring`
  ), { timeout: 15_000 }).toBeGreaterThan(aggregateGetsBeforeExternalEdit)
  const conflictDialog = page.getByRole('dialog', { name: '远端修改冲突' })
  await expect(conflictDialog).toBeVisible()
  await expect(editor).toContainText('= 6,')
  await conflictDialog.getByRole('button', {
    name: '查看差异并用本地重试'
  }).click()
  const conflictDiff = page.getByRole('dialog', { name: /完整 Python 差异/ })
  await expect(conflictDiff.getByText('冲突重试检查')).toBeVisible()
  await expect(conflictDiff.locator('pre').nth(0)).toContainText('= 5,')
  await expect(conflictDiff.locator('pre').nth(1)).toContainText('= 6,')
  await conflictDiff.getByRole('button', {
    name: /接受完整差异并保存/
  }).click()
  await expect(page.getByText(
    '草稿已保存，有尚未应用的工作流修改',
    { exact: true }
  )).toBeVisible()
  expect(readFileSync(os.sourcePath, 'utf8')).toContain('= 6,')
  await expect(page.getByText('工作流编辑操作失败', { exact: true }))
    .toHaveCount(0)

  await canvasMode.click()
  await expect(canvasMode).toHaveAttribute('aria-pressed', 'true')
  const canvasPosition = await projectedNode.getAttribute('style')
  await dragNode(page, projectedNode, 100, 50)
  expect(await projectedNode.getAttribute('style')).toBe(canvasPosition)
  await clickNodeOutsideMiniMap(page, projectedNode)
  const nodeName = page.getByRole('textbox', { name: '节点名称' })
  await expect(nodeName).toBeEnabled()
  await nodeName.fill('prepared_canvas')
  await expect(startFlowButton).toBeEnabled()

  const draftPutBeforeDiffAcceptance = countRequests(
    authoringRequests,
    'PUT',
    `/workflows/${os.workflowUuid}/authoring/draft`
  )
  await saveWorkflowDraftOnly(page.locator('body'))
  const fullDiff = page.getByRole('dialog', { name: /完整 Python 差异/ })
  await expect(fullDiff).toBeVisible()
  await expect(fullDiff.getByText('当前 Python', { exact: true })).toBeVisible()
  await expect(
    fullDiff.getByText('生成的完整 Python', { exact: true })
  ).toBeVisible()
  expect(countRequests(
    authoringRequests,
    'PUT',
    `/workflows/${os.workflowUuid}/authoring/draft`
  )).toBe(draftPutBeforeDiffAcceptance)
  await fullDiff.getByRole('button', {
    name: /接受完整差异并保存/
  }).click()
  await expect.poll(() => countRequests(
    authoringRequests,
    'PUT',
    `/workflows/${os.workflowUuid}/authoring/draft`
  )).toBe(draftPutBeforeDiffAcceptance + 1)
  const canvasSaved = await readEnvelope<AuthoringAggregate>(
    `${os.url}/api/v1/workflows/${os.workflowUuid}/authoring`
  )
  expect(canvasSaved.candidate?.graph.nodes).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: 'prepared_canvas' })
    ])
  )

  await expect(startFlowButton).toBeEnabled()
  await applyWorkflowCandidateWithoutTask(page.locator('body'), page)
  await expect.poll(() => countRequests(
    authoringRequests,
    'POST',
    `/workflows/${os.workflowUuid}/authoring/apply`
  )).toBeGreaterThanOrEqual(1)
  const applyRequest = lastRequest(
    authoringRequests,
    'POST',
    `/workflows/${os.workflowUuid}/authoring/apply`
  )
  expect(Object.keys(applyRequest.body as Record<string, unknown>)).toEqual([
    'candidate_hash'
  ])
  const canvasApplied = await readEnvelope<AuthoringAggregate>(
    `${os.url}/api/v1/workflows/${os.workflowUuid}/authoring`
  )
  expect(canvasApplied.applied_graph.nodes).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: 'prepared_canvas' })
    ])
  )

  await codeMode.click()
  await expect(editor).toHaveAttribute('contenteditable', 'true')
  await editor.click()
  await page.keyboard.press('Control+a')
  await page.keyboard.insertText('def broken(:\n')
  await saveWorkflowDraftOnly(page.locator('body'))
  await expect(page.getByText(
    '草稿已保存，但存在错误，修复后才能应用',
    { exact: true }
  )).toBeVisible()
  await expect(page.getByRole('region', { name: 'Python 草稿诊断' }))
    .toContainText('syntax_error')
  await expect(page.getByText(
    '当前显示已应用版本；暂无待应用修改',
    { exact: true }
  )).toBeVisible()
  await expect(startFlowButton).toBeDisabled()
  expect(browserErrors).toEqual([])
})
