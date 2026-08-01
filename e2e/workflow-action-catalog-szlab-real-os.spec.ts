import { expect, test } from '@playwright/test'

import {
  startSzlabActionCatalogOs,
  type SzlabActionCatalogOs
} from './helpers/szlab-action-catalog-os'

let os: SzlabActionCatalogOs

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  os = await startSzlabActionCatalogOs()
})

test.afterAll(async () => {
  await os?.stop()
})

test('SZLab persisted Catalog reaches the original typed workflow editor', async ({
  page
}) => {
  test.setTimeout(120_000)
  const browserErrors: string[] = []
  const requests: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('pageerror', (error) => browserErrors.push(error.message))
  page.on('request', (request) => {
    if (request.url().startsWith(`${os.url}/api/v1/`)) {
      requests.push(new URL(request.url()).pathname)
    }
  })

  const list = await readEnvelope<CatalogList>(
    `${os.url}/api/v1/workflow-node-templates`
  )
  expect(list.authority).toEqual({
    authority_id: 'szlab-local',
    kind: 'local'
  })
  expect(list.catalog_fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/)
  expect(list.items.length).toBeGreaterThan(0)
  expect(list.items.every((item) => !item.name.startsWith('auto-'))).toBe(true)
  const stirringSummary = list.items.find(
    (item) => item.name === 'run_stirring'
  )
  expect(stirringSummary).toBeDefined()
  if (!stirringSummary) throw new Error('SZLab run_stirring template missing')
  expect(stirringSummary.resource_template.uuid).toMatch(UUID_PATTERN)

  const detail = await readEnvelope<CatalogDetail>(
    `${os.url}/api/v1/workflow-node-templates/${stirringSummary.uuid}`
  )
  expect(detail.catalog_fingerprint).toBe(list.catalog_fingerprint)
  expect(detail.template.uuid).toBe(stirringSummary.uuid)
  expect(detail.handles.length).toBeGreaterThan(0)
  expect(detail.handles.every((handle) =>
    handle.workflow_node_template_uuid === stirringSummary.uuid
  )).toBe(true)
  const handleUuids = detail.handles.map((handle) => handle.uuid)
  expect(new Set(handleUuids).size).toBe(handleUuids.length)

  const aggregateBefore = await readEnvelope<AuthoringAggregate>(
    `${os.url}/api/v1/workflows/${os.workflowUuid}/authoring`
  )
  expect(aggregateBefore.candidate).not.toBeNull()
  const candidateBefore = aggregateBefore.candidate
  if (!candidateBefore) throw new Error('SZLab candidate missing')
  expect(candidateBefore.template_catalog_fingerprint).toBe(
    list.catalog_fingerprint
  )
  expect(candidateBefore.graph.handle_templates.map((item) => item.uuid))
    .toEqual(expect.arrayContaining(handleUuids))

  const generated = await readEnvelope<{
    graph: AuthoringGraph
    normalized_python_source: string
  }>(`${os.url}/api/v1/authoring/generate-python`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      workflow_uuid: os.workflowUuid,
      revision: aggregateBefore.workflow_revision,
      source_uri: aggregateBefore.draft?.source_uri,
      graph: candidateBefore.graph
    })
  })
  expect(graphIdentity(generated.graph)).toEqual(
    graphIdentity(candidateBefore.graph)
  )

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
  await expect(page.getByText('完整控制流 DAG')).toBeVisible()
  await expect.poll(() => requests.filter(
    (path) => path === '/api/v1/workflow-node-templates'
  ).length).toBeGreaterThan(0)

  await page.getByRole('button', {
    name: '画布模式',
    exact: true
  }).click()
  const node = page.locator('.react-flow__node-wfNode').first()
  await node.click()
  const editor = page.getByRole('complementary', {
    name: '画布节点编辑器'
  })
  await expect(editor.getByText('Action 参数', { exact: true })).toBeVisible()
  await expect(editor.getByLabel('磁搅位置')).toBeVisible()
  await expect(editor.getByText('必填', { exact: true })).toBeVisible()
  await expect(editor.getByText('默认值')).toBeVisible()
  await expect(editor.getByText(/允许空值|不可为空/)).toBeVisible()

  const renderedHandleUuids = await page.locator(
    '[data-workflow-handle-template-uuid]'
  ).evaluateAll((elements) => elements.map((element) =>
    element.getAttribute('data-workflow-handle-template-uuid')
  ))
  expect(renderedHandleUuids).toEqual(expect.arrayContaining(handleUuids))

  await page.reload()
  await expect(page.getByText('完整控制流 DAG')).toBeVisible()
  const aggregateAfter = await readEnvelope<AuthoringAggregate>(
    `${os.url}/api/v1/workflows/${os.workflowUuid}/authoring`
  )
  expect(aggregateAfter.candidate).not.toBeNull()
  expect(graphIdentity(aggregateAfter.candidate?.graph as AuthoringGraph))
    .toEqual(graphIdentity(candidateBefore.graph))
  expect(browserErrors).toEqual([])
})

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

interface CatalogList {
  authority: { authority_id: string; kind: string }
  catalog_fingerprint: string
  items: Array<{
    uuid: string
    name: string
    resource_template: { uuid: string; name: string; display_name: string }
  }>
}

interface CatalogDetail {
  catalog_fingerprint: string
  template: { uuid: string }
  handles: Array<{
    uuid: string
    workflow_node_template_uuid: string
  }>
}

interface AuthoringGraph {
  nodes: Array<{
    uuid: string
    workflow_node_template_uuid?: string | null
    param?: Record<string, unknown>
  }>
  edges: Array<{
    uuid: string
    source_handle_uuid: string
    target_handle_uuid: string
  }>
  node_templates: Array<{ uuid: string }>
  handle_templates: Array<{
    uuid: string
    workflow_node_template_uuid: string
  }>
}

interface AuthoringAggregate {
  workflow_revision: number
  draft: { source_uri: string } | null
  candidate: {
    template_catalog_fingerprint: string
    graph: AuthoringGraph
  } | null
}

function graphIdentity(graph: AuthoringGraph): Record<string, unknown> {
  return {
    nodes: graph.nodes.map((item) => ({
      uuid: item.uuid,
      workflow_node_template_uuid: item.workflow_node_template_uuid,
      param: item.param
    })),
    edges: graph.edges.map((item) => ({
      uuid: item.uuid,
      source_handle_uuid: item.source_handle_uuid,
      target_handle_uuid: item.target_handle_uuid
    })),
    nodeTemplates: graph.node_templates.map((item) => item.uuid),
    handleTemplates: graph.handle_templates.map((item) => ({
      uuid: item.uuid,
      workflow_node_template_uuid: item.workflow_node_template_uuid
    }))
  }
}

async function readEnvelope<Value>(
  url: string,
  init?: RequestInit
): Promise<Value> {
  const response = await fetch(url, init)
  const body = await response.json() as {
    code: number
    data?: Value
    error?: unknown
  }
  expect(response.ok, JSON.stringify(body)).toBe(true)
  expect(body.code).toBe(0)
  if (body.data === undefined) throw new Error('response data missing')
  return body.data
}
