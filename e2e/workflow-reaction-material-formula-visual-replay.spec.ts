import { expect, test } from '@playwright/test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { installWorkflowPanel } from './helpers/workflow-runtime-ui'

const WORKFLOW_UUID = '6d9fb3e2-4dcb-5f23-93b4-74d1b6083393'

test.use({
  deviceScaleFactor: 2,
  launchOptions: {
    args: ['--disable-gpu', '--disable-software-rasterizer']
  },
  viewport: { width: 2600, height: 1400 }
})

/**
 * 回放已捕获的 single_sample_atomic_material.py 工作流（Workflow）权威创作投影，
 * 验证辅助物料（Material）默认按有机反应式显示，并可恢复完整物料支线。
 *
 * @param page 运行当前前端候选的浏览器页面。
 * @returns 生成清晰画布截图与结构化证据，不创建工作流任务（WorkflowTask）。
 */
test('single sample workflow presents supporting materials as reactants', async ({
  page
}) => {
  const artifactDirectory = resolve(
    process.env.UNILAB_E2E_ARTIFACT_DIR ||
      resolve(process.cwd(), '../e2e-artifacts/local213-reaction-formula-working')
  )
  const authoringCapturePath = resolve(
    process.env.UNILAB_E2E_AUTHORING_CAPTURE ||
      resolve(
        process.cwd(),
        '../../artifacts/szlab-workflow-authoring-20260807/single-sample-authoring.json'
      )
  )
  const authoringCapture = readFileSync(authoringCapturePath, 'utf8')
  const capturedEnvelope = JSON.parse(authoringCapture) as {
    data: {
      candidate: {
        graph: unknown
        normalized_python_source: string
        source_map: unknown[]
        changeset: Record<string, unknown>
        compiler_version: string
        template_catalog_fingerprint: string
      }
    }
  }
  const capturedCandidate = capturedEnvelope.data.candidate
  const transformEnvelope = JSON.stringify({
    code: 0,
    data: {
      diagnostics: [],
      graph: capturedCandidate.graph,
      normalized_python_source: capturedCandidate.normalized_python_source,
      source_map: capturedCandidate.source_map,
      changeset: capturedCandidate.changeset,
      compiler_version: capturedCandidate.compiler_version,
      template_catalog_fingerprint:
        capturedCandidate.template_catalog_fingerprint
    }
  })
  mkdirSync(artifactDirectory, { recursive: true })
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('pageerror', (error) => browserErrors.push(error.message))
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === `/api/v1/workflows/${WORKFLOW_UUID}/authoring`) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: authoringCapture
      })
      return
    }
    if (
      url.pathname === '/api/v1/authoring/generate-python' ||
      url.pathname === '/api/v1/authoring/validate'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: transformEnvelope
      })
      return
    }
    if (route.request().headers().accept?.includes('text/event-stream')) {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: ': captured-authoring replay\n\n'
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, data: [] })
    })
  })

  await installWorkflowPanel(page, WORKFLOW_UUID)
  await page.goto(
    '/?section=workflow&localOsUrl=http%3A%2F%2F127.0.0.1%3A65530'
  )
  const panel = page.locator(
    '[data-panel-type="workflow-dag"][data-panel-instance-id="runtime-workflow"]'
  )
  await expect(panel.getByText('完整控制流 DAG')).toBeVisible()
  const canvasMode = panel.getByRole('button', { name: '画布模式', exact: true })
  await canvasMode.click()
  await expect(canvasMode).toHaveAttribute('aria-pressed', 'true')

  const canvas = panel.locator('.react-flow')
  await expect(canvas).toHaveClass(/wf-layout--primary-sample-serpentine/)
  const presentation = panel.getByRole('group', {
    name: '辅助物料展示方式'
  })
  const reactionFormula = presentation.getByRole('button', {
    name: '反应式',
    exact: true
  })
  const fullBranches = presentation.getByRole('button', {
    name: '完整支线',
    exact: true
  })
  await expect(reactionFormula).toHaveAttribute('aria-pressed', 'true')

  const mainNodes = panel.locator('.react-flow__node-wfNode')
  const reactionAnnotations = panel.locator(
    '.react-flow__node-wfReactionMaterial'
  )
  const supportingEdges = panel.locator(
    '.wf-flow-edge--supporting-material'
  )
  const materialSources = panel.locator('.wf-node--material-source')
  await expect(reactionAnnotations.first()).toBeVisible()
  await expect(supportingEdges).toHaveCount(0)
  await expect(materialSources).toHaveCount(1)
  const mainNodeCount = await mainNodes.count()
  expect(mainNodeCount).toBeGreaterThan(10)

  await panel.getByRole('button', {
    name: '适应完整工作流视图'
  }).click()
  await page.waitForTimeout(600)
  const annotationLabels = await reactionAnnotations
    .locator('.wf-reaction-materials__item')
    .allTextContents()
  expect(annotationLabels.length).toBeGreaterThan(0)
  const overlapPairs = await visibleOverlapPairs(panel.locator(
    '.react-flow__node:visible'
  ))
  expect(overlapPairs, JSON.stringify(overlapPairs, null, 2)).toEqual([])

  const screenshotPath = resolve(
    artifactDirectory,
    'single_sample_atomic_material-reaction-formula.png'
  )
  await canvas.screenshot({ path: screenshotPath, animations: 'disabled' })

  await fullBranches.click()
  await expect(fullBranches).toHaveAttribute('aria-pressed', 'true')
  await expect(reactionAnnotations).toHaveCount(0)
  const fullSupportingEdgeCount = await supportingEdges.count()
  const fullMaterialSourceCount = await materialSources.count()
  expect(fullSupportingEdgeCount).toBeGreaterThan(0)
  expect(fullMaterialSourceCount).toBeGreaterThan(1)
  await panel.getByRole('button', {
    name: '适应完整工作流视图'
  }).click()
  await page.waitForTimeout(600)

  const primaryMaterialEdges = panel.locator(
    '.wf-flow-edge--material-trace:not(.wf-flow-edge--supporting-material)'
  )
  const supportingEdgeStyles = await workflowEdgeStyles(supportingEdges)
  const primaryEdgeStyles = await workflowEdgeStyles(primaryMaterialEdges)
  expect(supportingEdgeStyles.every(({ opacity }) => opacity === 1)).toBe(true)
  expect(new Set(supportingEdgeStyles.map(({ stroke }) => stroke)).size)
    .toBeGreaterThan(1)
  expect(supportingEdgeStyles.every(({ strokeWidth }) =>
    strokeWidth === 2.4)).toBe(true)
  expect(primaryEdgeStyles.every(({ strokeWidth }) =>
    strokeWidth === 3.6)).toBe(true)
  const fullOverlapPairs = await visibleOverlapPairs(panel.locator(
    '.react-flow__node:visible'
  ))
  expect(fullOverlapPairs, JSON.stringify(fullOverlapPairs, null, 2))
    .toEqual([])
  const transferHandlePositions = await workflowTransferHandlePositions(panel)
  const edgeRoutes = await workflowEdgeRoutes(panel)
  const powderTransferHandles = transferHandlePositions.filter(({ name }) =>
    name.includes('粗投粉桶') || name.includes('精投粉桶')
  )
  const powderMaterialSources = powderTransferHandles.filter(({ kind, io }) =>
    kind === 'material' && io === 'source'
  )
  expect(powderMaterialSources).toHaveLength(2)
  expect(powderMaterialSources.every(({ position }) => position === 'top'))
    .toBe(true)

  const fullBranchesScreenshotPath = resolve(
    artifactDirectory,
    'single_sample_atomic_material-full-branches-2x.png'
  )
  await canvas.screenshot({
    path: fullBranchesScreenshotPath,
    animations: 'disabled',
    scale: 'device'
  })

  expect(browserErrors).toEqual([])
  writeFileSync(resolve(artifactDirectory, 'evidence.json'), `${JSON.stringify({
    evidence_kind: 'captured-authoring-visual-replay',
    workflow_uuid: WORKFLOW_UUID,
    source: authoringCapturePath,
    default_presentation: 'reaction-formula',
    main_node_count: mainNodeCount,
    reaction_annotation_count: annotationLabels.length,
    reaction_annotation_labels: annotationLabels,
    supporting_edge_count_in_reaction_formula: 0,
    material_source_count_in_reaction_formula: 1,
    overlap_pairs: overlapPairs,
    full_branches_available: true,
    full_branches_screenshot: fullBranchesScreenshotPath,
    full_branches_material_source_count: fullMaterialSourceCount,
    full_branches_supporting_edge_count: fullSupportingEdgeCount,
    full_branches_primary_edge_count: primaryEdgeStyles.length,
    full_branches_supporting_edge_styles: supportingEdgeStyles,
    full_branches_primary_edge_styles: primaryEdgeStyles,
    full_branches_overlap_pairs: fullOverlapPairs,
    full_branches_transfer_handle_positions: transferHandlePositions,
    full_branches_edge_routes: edgeRoutes,
    device_scale_factor: 2,
    browser_errors: browserErrors,
    screenshot: screenshotPath
  }, null, 2)}\n`)
})

/**
 * 读取一组工作流物料流（MaterialFlow）边的实际颜色、线宽与透明度。
 *
 * @param locator ReactFlow 物料边的定位器集合。
 * @returns 每条边在浏览器中最终生效的可视样式。
 */
async function workflowEdgeStyles(
  locator: import('@playwright/test').Locator
): Promise<Array<{ stroke: string; strokeWidth: number; opacity: number }>> {
  return locator.evaluateAll((elements) => elements.map((element) => {
    const path = element.querySelector<SVGPathElement>(
      '.react-flow__edge-path'
    )
    const pathStyle = path ? getComputedStyle(path) : getComputedStyle(element)
    return {
      stroke: pathStyle.stroke,
      strokeWidth: Number.parseFloat(pathStyle.strokeWidth),
      opacity: Number.parseFloat(getComputedStyle(element).opacity)
    }
  }))
}

/** 返回转运节点各类 Handle 的实际方位，供支线路由验收复核。 */
async function workflowTransferHandlePositions(
  panel: import('@playwright/test').Locator
): Promise<Array<{
  nodeId: string
  name: string
  kind: string
  io: string
  position: string
}>> {
  return panel.locator('.wf-node--robot-transfer').evaluateAll((nodes) =>
    nodes.flatMap((node) => {
      const name = node.querySelector('strong')?.textContent?.trim() ?? ''
      const nodeId = node.getAttribute('data-workflow-node-uuid') ?? ''
      return [...node.querySelectorAll<HTMLElement>('.react-flow__handle')]
        .map((handle) => ({
          nodeId,
          name,
          kind: handle.getAttribute('data-workflow-handle-kind') ?? '',
          io: handle.getAttribute('data-workflow-handle-io') ?? '',
          position: ['top', 'right', 'bottom', 'left'].find((side) =>
            handle.classList.contains(`react-flow__handle-${side}`)
          ) ?? ''
        }))
    })
  )
}

/** 返回全部画布边的端点身份、语义样式与浏览器最终正交路径。 */
async function workflowEdgeRoutes(
  panel: import('@playwright/test').Locator
): Promise<Array<{
  sourceNodeId: string
  targetNodeId: string
  className: string
  path: string
}>> {
  return panel.locator('.react-flow__edge').evaluateAll((edges) =>
    edges.map((edge) => ({
      sourceNodeId: edge.querySelector('g')?.getAttribute(
        'data-workflow-edge-source-node-uuid'
      ) ?? '',
      targetNodeId: edge.querySelector('g')?.getAttribute(
        'data-workflow-edge-target-node-uuid'
      ) ?? '',
      className: edge.getAttribute('class') ?? '',
      path: edge.querySelector('.react-flow__edge-path')?.getAttribute('d') ?? ''
    }))
  )
}

/** 返回当前可见 ReactFlow 节点之间的矩形重叠对。 */
async function visibleOverlapPairs(locator: import('@playwright/test').Locator):
Promise<Array<{ left: string; right: string }>> {
  const boxes = await locator.evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect()
    return {
      id: element.getAttribute('data-id') ?? '',
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom
    }
  }))
  const overlaps: Array<{ left: string; right: string }> = []
  for (let leftIndex = 0; leftIndex < boxes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < boxes.length; rightIndex += 1) {
      const left = boxes[leftIndex]!
      const right = boxes[rightIndex]!
      if (
        left.left < right.right &&
        left.right > right.left &&
        left.top < right.bottom &&
        left.bottom > right.top
      ) overlaps.push({ left: left.id, right: right.id })
    }
  }
  return overlaps
}
