import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { expect, test } from '@playwright/test'

import {
  startPersistentAuthoringOs,
  type PersistentAuthoringOs
} from './helpers/persistent-authoring-os'

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
    'imported-workflow.py 已导入为未保存的 Python Draft',
    { exact: true }
  )).toBeVisible()
  await expect(panel.getByText('● 未保存', { exact: true })).toBeVisible()
  await expect(panel.getByRole('button', {
    name: '应用工作流',
    exact: true
  })).toBeDisabled()
  await panel.screenshot({
    path: join(artifactDirectory, '01-python-file-imported.png'),
    animations: 'disabled'
  })

  await panel.getByRole('button', {
    name: '保存草稿',
    exact: true
  }).click()
  const normalizationDiff = page.getByRole('dialog', {
    name: '完整 Python 差异'
  })
  await expect(normalizationDiff.getByText(
    '导入源码规范化检查',
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
    name: '应用工作流',
    exact: true
  })).toBeEnabled()
  await panel.screenshot({
    path: join(artifactDirectory, '03-python-candidate-saved.png'),
    animations: 'disabled'
  })

  await panel.getByRole('button', {
    name: '应用工作流',
    exact: true
  }).click()
  await expect(panel.getByText(/工作流已应用，当前版本为/)).toBeVisible()
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
  await expect(panel.locator('.cm-content:visible'))
    .toHaveAttribute('contenteditable', 'false')
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
  await panel.getByRole('button', {
    name: '保存草稿',
    exact: true
  }).click()
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

  await panel.getByRole('button', {
    name: '应用工作流',
    exact: true
  }).click()
  await expect(panel.getByText(/工作流已应用，当前版本为/)).toBeVisible()
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
  const sourceBeforeImport = await editor.textContent()
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
  await expect.poll(() => editor.textContent()).toBe(sourceBeforeImport)
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
