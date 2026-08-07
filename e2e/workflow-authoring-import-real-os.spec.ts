import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

import {
  startPersistentAuthoringOs,
  type PersistentAuthoringOs
} from './helpers/persistent-authoring-os'
import {
  applyWorkflowCandidateWithoutTask,
  saveWorkflowDraftOnly
} from './helpers/workflow-runtime-ui'

let os: PersistentAuthoringOs

const artifactDirectory = resolve(
  process.env.UNILAB_E2E_ARTIFACT_DIR ||
    resolve(process.cwd(), '../e2e-artifacts/workflow-authoring-import')
)

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  mkdirSync(artifactDirectory, { recursive: true })
  os = await startPersistentAuthoringOs()
})

test.afterAll(async () => {
  await os?.stop()
})

/**
 * 验证软件包初始工作流创作候选（Candidate）在规范化源码尚未保存时，
 * 通过公开工作流 UI 先要求用户确认完整差异，且不会提前请求应用接口。
 *
 * @param page Playwright 浏览器页面，用于观察用户可见对话框与 OS 网络请求。
 * @returns 异步完成 UI 断言；门禁或网络事实不符合预期时测试失败。
 */
async function requiresPackageCandidateMaterialization({
  page
}: {
  page: Page
}): Promise<void> {
  test.setTimeout(90_000)
  const evidence = collectBrowserEvidence(page, os.url)
  await selectWorkflow(page, os.workflowUuid, os.url)
  const panel = page.getByRole('tabpanel', { name: '工作流' })
  const applyPath =
    `/api/v1/workflows/${os.workflowUuid}/authoring/apply`
  const applyRequestsBefore = countRequests(
    evidence.apiRequests,
    'POST',
    applyPath
  )

  await panel.getByRole('button', {
    name: '应用并运行',
    exact: true
  }).click()

  const normalizationDiff = page.getByRole('dialog', {
    name: '完整 Python 差异'
  })
  await expect(normalizationDiff.getByText(
    '规范化源码确认',
    { exact: true }
  )).toBeVisible()
  expect(countRequests(
    evidence.apiRequests,
    'POST',
    applyPath
  )).toBe(applyRequestsBefore)
  await normalizationDiff.getByRole('button', {
    name: '取消',
    exact: true
  }).click()
  expect(evidence.browserErrors).toEqual([])
}

test(
  '软件包候选的规范化工作流源码未保存时禁止直接应用',
  requiresPackageCandidateMaterialization
)

/** 验证 Python 导入后形成未保存草稿，并经 OS 候选版本门禁完成应用。 */
test('imports Python into the existing persistent Authoring UI and applies the OS Candidate', async ({
  page
}) => {
  test.setTimeout(90_000)
  const evidence = collectBrowserEvidence(page, os.url)
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showOpenFilePicker', {
      configurable: true,
      value: undefined
    })
  })
  await selectWorkflow(page, os.workflowUuid, os.url)

  const panel = page.getByRole('tabpanel', { name: '工作流' })
  const sourceBeforeImport = readFileSync(os.sourcePath, 'utf8')
  const importedSource = sourceBeforeImport.replace('= 3,', '= 7,')
  expect(importedSource).not.toBe(sourceBeforeImport)

  const fileChooser = page.waitForEvent('filechooser')
  await panel.getByRole('button', {
    name: '导入 Python',
    exact: true
  }).click()
  await (await fileChooser).setFiles({
    name: 'imported-workflow.py',
    mimeType: 'text/x-python',
    buffer: Buffer.from(importedSource)
  })

  const editor = panel.locator('.cm-content:visible')
  await expect(editor).toContainText('= 7,')
  await expect(panel.getByText(
    'imported-workflow.py 已导入为未保存的 Python 草稿',
    { exact: true }
  )).toBeVisible()
  await expect(panel.getByText('● 未保存', { exact: true })).toBeVisible()
  await expect(panel.getByRole('button', {
    name: '保存并运行',
    exact: true
  })).toBeEnabled()
  await panel.screenshot({
    path: join(artifactDirectory, '01-python-file-imported.png'),
    animations: 'disabled'
  })

  await saveWorkflowDraftOnly(panel)
  const normalizationDiff = page.getByRole('dialog', {
    name: '完整 Python 差异'
  })
  await expect(normalizationDiff.getByText(
    '规范化源码确认',
    { exact: true }
  )).toBeVisible()
  await normalizationDiff.screenshot({
    path: join(artifactDirectory, '02-python-normalization-diff.png'),
    animations: 'disabled'
  })
  await normalizationDiff.getByRole('button', {
    name: '接受完整差异并保存'
  }).click()
  await expect(panel.getByText(
    '草稿已保存，有尚未应用的工作流修改',
    { exact: true }
  )).toBeVisible()
  await expect(panel.getByRole('button', {
    name: '应用并运行',
    exact: true
  })).toBeEnabled()
  await panel.screenshot({
    path: join(artifactDirectory, '03-python-candidate-saved.png'),
    animations: 'disabled'
  })

  await applyWorkflowCandidateWithoutTask(panel, page)
  await panel.screenshot({
    path: join(artifactDirectory, '04-python-candidate-applied.png'),
    animations: 'disabled'
  })
  expect(evidence.browserErrors).toEqual([])
  writeNetworkLedger('python-network-ledger.json', evidence)
})

test('imports same-Workflow Authoring Graph JSON through the canvas diff gate', async ({
  page,
  request
}) => {
  test.setTimeout(90_000)
  const evidence = collectBrowserEvidence(page, os.url)
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showOpenFilePicker', {
      configurable: true,
      value: undefined
    })
  })
  const { apiRequests } = evidence

  const aggregateResponse = await request.get(
    `${os.url}/api/v1/workflows/${os.workflowUuid}/authoring`
  )
  expect(aggregateResponse.ok()).toBe(true)
  const aggregateEnvelope = await aggregateResponse.json() as {
    code: number
    data: {
      candidate: {
        graph: {
          workflow: Record<string, unknown>
          nodes: Array<Record<string, unknown>>
          edges: Array<Record<string, unknown>>
          node_templates: Array<Record<string, unknown>>
          handle_templates: Array<Record<string, unknown>>
        }
      } | null
      applied_graph: {
        workflow: Record<string, unknown>
        nodes: Array<Record<string, unknown>>
        edges: Array<Record<string, unknown>>
        node_templates: Array<Record<string, unknown>>
        handle_templates: Array<Record<string, unknown>>
      }
    }
  }
  expect(aggregateEnvelope.code).toBe(0)
  const importedGraph = structuredClone(
    aggregateEnvelope.data.candidate?.graph ??
      aggregateEnvelope.data.applied_graph
  )
  importedGraph.nodes[0] = {
    ...importedGraph.nodes[0],
    name: 'imported_json_node'
  }

  await selectWorkflow(page, os.workflowUuid, os.url)
  const panel = page.getByRole('tabpanel', { name: '工作流' })
  const fileChooser = page.waitForEvent('filechooser')
  await panel.getByRole('button', {
    name: '导入 JSON',
    exact: true
  }).click()
  await (await fileChooser).setFiles({
    name: 'authoring-graph.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(importedGraph, null, 2))
  })

  await expect(panel.getByRole('button', {
    name: '画布模式',
    exact: true
  })).toHaveAttribute('aria-pressed', 'true')
  await expect(panel.getByRole('region', { name: '工作流代码视图' }))
    .toHaveCount(0)
  await expect(panel.locator('.wf-node__id').filter({
    hasText: 'imported_json_node'
  })).toBeVisible()
  await expect(panel.getByText(
    'authoring-graph.json 已导入到画布；保存前将检查完整 Python 差异',
    { exact: true }
  )).toBeVisible()
  await panel.screenshot({
    path: join(artifactDirectory, '05-json-graph-imported.png'),
    animations: 'disabled'
  })

  const draftPath =
    `/api/v1/workflows/${os.workflowUuid}/authoring/draft`
  const draftPutsBeforeSave = countRequests(apiRequests, 'PUT', draftPath)
  await saveWorkflowDraftOnly(panel)
  const fullDiff = page.getByRole('dialog', { name: '完整 Python 差异' })
  await expect(fullDiff.getByText('画布保存检查', { exact: true }))
    .toBeVisible()
  expect(countRequests(apiRequests, 'PUT', draftPath)).toBe(draftPutsBeforeSave)
  await fullDiff.screenshot({
    path: join(artifactDirectory, '06-json-full-python-diff.png'),
    animations: 'disabled'
  })

  await fullDiff.getByRole('button', {
    name: '接受完整差异并保存'
  }).click()
  await expect(panel.getByText(
    '草稿已保存，有尚未应用的工作流修改',
    { exact: true }
  )).toBeVisible()
  await expect.poll(
    () => countRequests(apiRequests, 'PUT', draftPath)
  ).toBe(draftPutsBeforeSave + 1)
  await panel.screenshot({
    path: join(artifactDirectory, '07-json-candidate-saved.png'),
    animations: 'disabled'
  })

  await applyWorkflowCandidateWithoutTask(panel, page)
  const applyRequest = apiRequests.findLast((entry) =>
    entry.method === 'POST' &&
    entry.path === `/api/v1/workflows/${os.workflowUuid}/authoring/apply`
  )
  expect(applyRequest?.body).toEqual({
    candidate_hash: expect.stringMatching(/^sha256:/)
  })
  await panel.screenshot({
    path: join(artifactDirectory, '08-json-candidate-applied.png'),
    animations: 'disabled'
  })

  expect(evidence.browserErrors).toEqual([])
  writeNetworkLedger('json-network-ledger.json', evidence)
})

test('rejects a cross-Workflow Graph without changing the current document', async ({
  page,
  request
}) => {
  test.setTimeout(90_000)
  const evidence = collectBrowserEvidence(page, os.url)
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showOpenFilePicker', {
      configurable: true,
      value: undefined
    })
  })
  const aggregateResponse = await request.get(
    `${os.url}/api/v1/workflows/${os.workflowUuid}/authoring`
  )
  expect(aggregateResponse.ok()).toBe(true)
  const aggregateEnvelope = await aggregateResponse.json() as {
    code: number
    data: {
      candidate: { graph: Record<string, unknown> } | null
      applied_graph: Record<string, unknown>
    }
  }
  expect(aggregateEnvelope.code).toBe(0)
  const importedGraph = structuredClone(
    aggregateEnvelope.data.candidate?.graph ??
      aggregateEnvelope.data.applied_graph
  ) as {
    workflow: Record<string, unknown>
  }
  importedGraph.workflow = {
    ...importedGraph.workflow,
    uuid: os.secondWorkflowUuid
  }

  await selectWorkflow(page, os.workflowUuid, os.url)
  const panel = page.getByRole('tabpanel', { name: '工作流' })
  const editor = panel.locator('.cm-content:visible')
  const generationPath = '/api/v1/authoring/generate-python'
  const generationsBeforeImport = countRequests(
    evidence.apiRequests,
    'POST',
    generationPath
  )

  const fileChooser = page.waitForEvent('filechooser')
  await panel.getByRole('button', {
    name: '导入 JSON',
    exact: true
  }).click()
  await (await fileChooser).setFiles({
    name: 'other-workflow.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(importedGraph, null, 2))
  })

  const problem = panel.getByRole('alert')
  await expect(problem).toContainText(
    `不能覆盖当前 Workflow ${os.workflowUuid}`
  )
  await expect(editor).toContainText(os.workflowUuid)
  await expect(editor).not.toContainText(os.secondWorkflowUuid)
  expect(countRequests(
    evidence.apiRequests,
    'POST',
    generationPath
  )).toBe(generationsBeforeImport)
  await panel.screenshot({
    path: join(artifactDirectory, '09-cross-workflow-json-rejected.png'),
    animations: 'disabled'
  })

  expect(evidence.browserErrors).toEqual([])
  writeNetworkLedger('rejected-json-network-ledger.json', evidence)
})

async function selectWorkflow(
  page: import('@playwright/test').Page,
  workflowUuid: string,
  osUrl: string
): Promise<void> {
  const activeWorkflowStorageKey = `unilab.workflow.active.${
    encodeURIComponent(`local-python:${osUrl}`)
  }.v1`
  await page.addInitScript(
    ({ storageKey, activeWorkflowUuid }) => {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ version: 1, workflowId: activeWorkflowUuid })
      )
    },
    {
      storageKey: activeWorkflowStorageKey,
      activeWorkflowUuid: workflowUuid
    }
  )
  await page.goto(
    `/?section=workflow&localOsUrl=${encodeURIComponent(osUrl)}`
  )
  await expect(page.getByText('完整控制流 DAG')).toBeVisible()
}

function countRequests(
  requests: ReadonlyArray<{ method: string; path: string }>,
  method: string,
  path: string
): number {
  return requests.filter(
    (request) => request.method === method && request.path === path
  ).length
}

interface BrowserEvidence {
  browserErrors: string[]
  apiRequests: Array<{
    method: string
    path: string
    body: unknown
  }>
  apiResponses: Array<{
    method: string
    path: string
    status: number
  }>
}

function collectBrowserEvidence(
  page: import('@playwright/test').Page,
  apiUrl: string
): BrowserEvidence {
  const evidence: BrowserEvidence = {
    browserErrors: [],
    apiRequests: [],
    apiResponses: []
  }
  page.on('console', (message) => {
    if (message.type() === 'error') {
      evidence.browserErrors.push(message.text())
    }
  })
  page.on('pageerror', (error) => {
    evidence.browserErrors.push(error.message)
  })
  page.on('request', (incoming) => {
    if (!incoming.url().startsWith(`${apiUrl}/api/v1/`)) return
    let body: unknown = null
    try {
      body = incoming.postDataJSON()
    } catch {
      body = incoming.postData()
    }
    evidence.apiRequests.push({
      method: incoming.method(),
      path: new URL(incoming.url()).pathname,
      body
    })
  })
  page.on('response', (response) => {
    if (!response.url().startsWith(`${apiUrl}/api/v1/`)) return
    evidence.apiResponses.push({
      method: response.request().method(),
      path: new URL(response.url()).pathname,
      status: response.status()
    })
  })
  return evidence
}

function writeNetworkLedger(
  fileName: string,
  evidence: BrowserEvidence
): void {
  writeFileSync(
    join(artifactDirectory, fileName),
    `${JSON.stringify({ apiUrl: os.url, ...evidence }, null, 2)}\n`
  )
}
