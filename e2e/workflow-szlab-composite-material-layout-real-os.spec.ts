import { expect, test, type Locator, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  startSzlabCompositeMaterialWorkflowOs,
  SZLAB_COMPOSITE_MATERIAL_WORKFLOW_UUID,
  type SzlabMaterialWorkflowOs
} from './helpers/szlab-action-catalog-os'
import { installWorkflowPanel } from './helpers/workflow-runtime-ui'

const REAGENT_AT_S08_UUID = 'e01e23ce-72d2-5136-b849-60fa3fe2525f'

interface AuthoringGraph {
  nodes: Array<{ uuid: string; name: string; type: string }>
  edges: unknown[]
}

interface AuthoringAggregate {
  applied_graph: AuthoringGraph
  candidate: { graph: AuthoringGraph } | null
}

let os: SzlabMaterialWorkflowOs

test.describe.configure({ mode: 'serial', timeout: 240_000 })
test.use({
  launchOptions: {
    args: ['--disable-gpu', '--disable-software-rasterizer']
  }
})

/** 启动真实操作系统（OS），并为复合工作流编译预留完整冷启动时间。 */
test.beforeAll(async () => {
  os = await startSzlabCompositeMaterialWorkflowOs()
}, 120_000)

test.afterAll(async () => {
  await os?.stop()
})

/**
 * 验证复杂复合物料工作流的 ready、物料输入和全部节点共同布局，并确保转运
 * 节点只展示物料流（MaterialFlow）句柄。
 *
 * @param page 连接真实前端（Frontend）与操作系统（OS）的浏览器页面。
 * @returns 验证完成后生成截图和结构化证据文件。
 */
test('SZLab composite material workflow uses one orthogonal visible layout', async ({
  page
}) => {
  const artifactDirectory = resolve(
    process.env.UNILAB_E2E_ARTIFACT_DIR ||
      resolve(process.cwd(), '../e2e-artifacts/szlab-composite-material-layout')
  )
  mkdirSync(artifactDirectory, { recursive: true })
  const browserErrors: string[] = []
  const requestFailures: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('pageerror', (error) => browserErrors.push(error.message))
  page.on('requestfailed', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/v1/')) {
      requestFailures.push(
        `${request.method()} ${new URL(request.url()).pathname}: ` +
        (request.failure()?.errorText ?? '未知错误')
      )
    }
  })

  const aggregate = await readEnvelope<AuthoringAggregate>(
    `${os.url}/api/v1/workflows/${SZLAB_COMPOSITE_MATERIAL_WORKFLOW_UUID}/authoring`
  )
  const graph = aggregate.candidate?.graph ?? aggregate.applied_graph
  expect(graph.nodes, os.logs()).toHaveLength(72)
  expect(graph.edges).toHaveLength(57)

  await installWorkflowPanel(page, SZLAB_COMPOSITE_MATERIAL_WORKFLOW_UUID)
  await page.goto(
    `/?section=workflow&localOsUrl=${encodeURIComponent(os.url)}`
  )
  const panel = page.locator(
    '[data-panel-type="workflow-dag"][data-panel-instance-id="runtime-workflow"]'
  )
  await expect(panel.getByText('完整控制流 DAG')).toBeVisible()
  const canvasMode = panel.getByRole('button', { name: '画布模式', exact: true })
  await canvasMode.click()
  await expect(canvasMode).toHaveAttribute('aria-pressed', 'true')

  const visibleNodes = panel.locator('.react-flow__node[data-id]')
  const materialSources = panel.locator(
    '.wf-node[data-workflow-node-kind="material_source"]'
  )
  const readyEdges = panel.locator('.wf-flow-edge--ready')
  const readyHandles = panel.locator('[data-workflow-handle-kind="ready"]')
  const materialEdges = panel.locator('.wf-flow-edge--material-trace')
  const robotTransferNodes = panel.locator(
    '.wf-node[data-workflow-node-visual-kind="robot-transfer"]'
  )
  const robotTransferReadyHandles = robotTransferNodes.locator(
    '[data-workflow-handle-kind="ready"]'
  )
  const visibleReadyHandles = panel.locator(
    '.wf-node:not([data-workflow-node-visual-kind="robot-transfer"]) '
      + '[data-workflow-handle-kind="ready"]'
  )
  await expect(visibleNodes).toHaveCount(30)
  await expect(materialSources).toHaveCount(4)
  await expect(robotTransferNodes).toHaveCount(11)
  await expect(robotTransferNodes.locator('[data-workflow-robot-arm]'))
    .toHaveCount(11)
  await expect(materialEdges).toHaveCount(28)
  await expect(readyEdges).toHaveCount(7)
  expect(await robotTransferReadyHandles.count()).toBeGreaterThan(0)
  await expect(robotTransferReadyHandles.first()).toBeHidden()
  await expect(visibleReadyHandles.first()).toBeVisible()
  await page.waitForTimeout(800)

  const nodeBoxes = await boundingBoxes(visibleNodes)
  expect(overlappingPairs(nodeBoxes), JSON.stringify(nodeBoxes, null, 2))
    .toEqual([])
  const sourceBoxes = await boundingBoxes(materialSources)
  expect(overlappingPairs(sourceBoxes), JSON.stringify(sourceBoxes, null, 2))
    .toEqual([])

  const readyHandleEvidence = await readyHandles.evaluateAll((handles) =>
    handles.map((handle) => {
      const element = handle as HTMLElement
      const node = element.closest<HTMLElement>('.wf-node')
      if (!node) throw new Error('ready 句柄没有所属工作流节点')
      const handleRect = element.getBoundingClientRect()
      const nodeRect = node.getBoundingClientRect()
      const io = element.dataset.workflowHandleIo
      return {
        io,
        width: handleRect.width,
        height: handleRect.height,
        edgeDelta: io === 'target'
          ? Math.abs(handleRect.top + handleRect.height / 2 - nodeRect.top)
          : Math.abs(handleRect.top + handleRect.height / 2 - nodeRect.bottom)
      }
    })
  )
  expect(readyHandleEvidence.every((handle) =>
    handle.height >= handle.width * 2 && handle.edgeDelta <= 2
  ), JSON.stringify(readyHandleEvidence, null, 2)).toBe(true)
  expect(new Set(readyHandleEvidence.map((handle) => handle.io)))
    .toEqual(new Set(['target', 'source']))
  const robotTransferReadyHandleEvidence = await robotTransferReadyHandles
    .evaluateAll((handles) => handles.map((handle) => {
      const style = getComputedStyle(handle)
      return {
        io: (handle as HTMLElement).dataset.workflowHandleIo,
        visibility: style.visibility,
        pointerEvents: style.pointerEvents
      }
    }))
  expect(robotTransferReadyHandleEvidence.every((handle) =>
    handle.visibility === 'hidden' && handle.pointerEvents === 'none'
  ), JSON.stringify(robotTransferReadyHandleEvidence, null, 2)).toBe(true)

  const reagentNode = panel.locator(
    `.wf-node[data-workflow-node-uuid="${REAGENT_AT_S08_UUID}"]`
  )
  await expect(reagentNode).toBeVisible()
  const reagentResource = reagentNode.locator(
    '[data-workflow-material-port-variable="resource"]'
  )
  await expect(reagentResource).toHaveCount(1)
  await expect(reagentResource.locator(
    '[data-workflow-handle-kind="material"][data-workflow-handle-io="target"]'
  )).toHaveCount(1)
  await expect(reagentNode).toHaveAttribute(
    'data-workflow-node-visual-kind',
    'robot-transfer'
  )
  await expect(reagentResource.locator(
    '[data-workflow-handle-kind="material"][data-workflow-handle-io="source"]'
  )).toHaveCount(1)

  const routedPaths = await readyEdges.locator('.react-flow__edge-path')
    .evaluateAll((paths) => paths.map((path) => path.getAttribute('d') ?? ''))
  expect(routedPaths.every((path) => path.startsWith('M') && path.includes('L')))
    .toBe(true)
  expect(routedPaths.some((path) => path.includes('Q'))).toBe(true)

  await panel.locator('.react-flow').screenshot({
    path: resolve(artifactDirectory, '02-complete-visible-layout.png')
  })
  await focusViewportOn(panel, materialSources, 0.8)
  await screenshotAround(page, materialSources, resolve(
    artifactDirectory,
    '03-material-sources-no-overlap.png'
  ), 48)
  await focusViewportOn(panel, readyEdges.first(), 1)
  await screenshotAround(page, readyEdges.first(), resolve(
    artifactDirectory,
    '04-ready-handle-and-edge.png'
  ), 140)
  await focusViewportOn(panel, reagentNode, 1)
  await screenshotAround(page, reagentNode, resolve(
    artifactDirectory,
    '05-reagent-at-s08-input-output.png'
  ), 120)
  await focusViewportOn(panel, readyEdges.nth(1), 1)
  await screenshotAround(page, readyEdges.nth(1), resolve(
    artifactDirectory,
    '06-rounded-orthogonal-edge.png'
  ), 140)
  const clearWorkbenchEvidence = await captureClearWorkbench(
    page,
    panel,
    visibleNodes,
    resolve(artifactDirectory, '01-workflow-workbench.png')
  )

  const strategySelect = panel.getByLabel('布局策略')
  await strategySelect.selectOption('material-swimlanes')
  await expect(panel.locator('.react-flow'))
    .toHaveClass(/wf-layout--material-swimlanes/)
  const swimlaneDirection = panel.getByRole('group', {
    name: '物料泳道方向'
  })
  await expect(swimlaneDirection).toBeVisible()
  await expect(swimlaneDirection.getByRole('button', {
    name: '纵向',
    exact: true
  })).toHaveAttribute('aria-pressed', 'true')
  await page.waitForTimeout(600)
  await panel.getByRole('button', { name: '应用纵向物料泳道布局' }).click()
  await expect(panel.getByText('已应用物料泳道（纵向）布局')).toBeVisible()
  await panel.locator('.react-flow__controls-fitview').click()
  await page.waitForTimeout(500)

  const swimlaneNodeBoxes = await boundingBoxes(visibleNodes)
  expect(
    overlappingPairs(swimlaneNodeBoxes),
    JSON.stringify(swimlaneNodeBoxes, null, 2)
  ).toEqual([])
  const materialPathEvidence = await materialEdges
    .locator('.react-flow__edge-path')
    .evaluateAll((paths) => paths.map((path) => ({
      edgeId: path.closest('.react-flow__edge')?.getAttribute('data-testid') ?? '',
      width: (path as SVGGraphicsElement).getBBox().width,
      path: path.getAttribute('d') ?? ''
    })))
  expect(materialPathEvidence.every((edge) => edge.width <= 0.5),
    JSON.stringify(materialPathEvidence, null, 2)).toBe(true)
  const swimlaneSourceOrder = await materialSources.evaluateAll((sources) =>
    sources.map((source) => {
      const label = source.querySelector(
        '[data-workflow-material-source-name]'
      )?.textContent?.trim() ?? ''
      return { label, x: source.getBoundingClientRect().x }
    }).sort((left, right) => left.x - right.x).map((source) => source.label)
  )
  expect(swimlaneSourceOrder).toEqual(
    graph.nodes
      .filter((node) => node.type === 'material_source')
      .map((node) => node.name)
  )
  const stretchedActions = await panel.locator(
    '.wf-node--action-strip' +
    '[data-workflow-layout-strategy="material-swimlanes"]'
  ).evaluateAll((nodes) => nodes.map((node) => ({
    id: node.getAttribute('data-workflow-node-uuid') ?? '',
    width: (node as HTMLElement).offsetWidth
  })).filter((node) => node.width > 520))
  expect(stretchedActions.length).toBeGreaterThan(0)
  await panel.locator('.react-flow').screenshot({
    path: resolve(artifactDirectory, '07-material-swimlane-layout.png')
  })
  const widestAction = [...stretchedActions]
    .sort((left, right) => right.width - left.width)[0]!
  const widestActionNode = panel.locator(
    `.wf-node[data-workflow-node-uuid="${widestAction.id}"]`
  )
  await focusViewportOn(panel, widestActionNode, 0.9)
  await screenshotAround(page, widestActionNode, resolve(
    artifactDirectory,
    '08-multi-material-swimlane-node.png'
  ), 180)
  const verticalTransferEvidence = await transferHandleEvidence(robotTransferNodes)
  expect(verticalTransferEvidence.every((item) =>
    item.crossAxisDelta <= 1 && item.edgeDelta <= 2
  ), JSON.stringify(verticalTransferEvidence, null, 2)).toBe(true)
  await focusViewportOn(panel, reagentNode, 1)
  await screenshotAround(page, reagentNode, resolve(
    artifactDirectory,
    '12-robot-transfer-node-vertical.png'
  ), 120)

  await swimlaneDirection.getByRole('button', {
    name: '横向',
    exact: true
  }).click()
  await expect(swimlaneDirection.getByRole('button', {
    name: '横向',
    exact: true
  })).toHaveAttribute('aria-pressed', 'true')
  await expect(panel.locator('.react-flow'))
    .toHaveClass(/wf-layout-direction--horizontal/)
  await page.waitForTimeout(600)
  await panel.getByRole('button', { name: '应用横向物料泳道布局' }).click()
  await expect(panel.getByText('已应用物料泳道（横向）布局')).toBeVisible()
  await panel.locator('.react-flow__controls-fitview').click()
  await page.waitForTimeout(500)

  const horizontalNodeBoxes = await boundingBoxes(visibleNodes)
  expect(
    overlappingPairs(horizontalNodeBoxes),
    JSON.stringify(horizontalNodeBoxes, null, 2)
  ).toEqual([])
  const horizontalMaterialPathEvidence = await materialEdges
    .locator('.react-flow__edge-path')
    .evaluateAll((paths) => paths.map((path) => ({
      edgeId: path.closest('.react-flow__edge')?.getAttribute('data-testid') ?? '',
      height: (path as SVGGraphicsElement).getBBox().height,
      path: path.getAttribute('d') ?? ''
    })))
  expect(horizontalMaterialPathEvidence.every((edge) => edge.height <= 0.5),
    JSON.stringify(horizontalMaterialPathEvidence, null, 2)).toBe(true)
  const horizontalMaterialHandles = panel.locator(
    '.wf-node[data-workflow-layout-direction="horizontal"] ' +
    '[data-workflow-handle-kind="material"]'
  )
  // 句柄证据同时覆盖操作（Action）、物料来源（MaterialSource）和机械臂转运节点。
  const horizontalMaterialHandleEvidence = await readHorizontalMaterialHandles(
    horizontalMaterialHandles
  )
  expect(horizontalMaterialHandleEvidence.length).toBeGreaterThan(0)
  expect(horizontalMaterialHandleEvidence.every((handle) =>
    handle.cssHeight >= 17 && handle.cssWidth <= 9
  ), JSON.stringify(horizontalMaterialHandleEvidence, null, 2)).toBe(true)
  expect(new Set(horizontalMaterialHandleEvidence.map((handle) => handle.owner)))
    .toEqual(new Set(['action', 'material-source', 'robot-transfer']))
  const horizontalInputHandles = horizontalMaterialHandleEvidence.filter(
    (handle) => handle.io === 'target'
  )
  const horizontalOutputHandles = horizontalMaterialHandleEvidence.filter(
    (handle) => handle.io === 'source'
  )
  expect(horizontalInputHandles.length).toBeGreaterThan(0)
  expect(horizontalOutputHandles.length).toBeGreaterThan(0)
  expect(horizontalInputHandles.every((handle) =>
    handle.backgroundColor === 'rgb(255, 255, 255)'
  )).toBe(true)
  expect(horizontalOutputHandles.every((handle) =>
    handle.backgroundColor !== 'rgb(255, 255, 255)' &&
    handle.backgroundColor !== 'rgba(0, 0, 0, 0)'
  )).toBe(true)
  const horizontalSourceOrder = await materialSources.evaluateAll((sources) =>
    sources.map((source) => {
      const label = source.querySelector(
        '[data-workflow-material-source-name]'
      )?.textContent?.trim() ?? ''
      return { label, y: source.getBoundingClientRect().y }
    }).sort((left, right) => left.y - right.y).map((source) => source.label)
  )
  expect(horizontalSourceOrder).toEqual(
    graph.nodes
      .filter((node) => node.type === 'material_source')
      .map((node) => node.name)
  )
  const verticallyStretchedActions = await panel.locator(
    '.wf-node--action-strip' +
    '[data-workflow-layout-strategy="material-swimlanes"]' +
    '[data-workflow-layout-direction="horizontal"]'
  ).evaluateAll((nodes) => nodes.map((node) => ({
    id: node.getAttribute('data-workflow-node-uuid') ?? '',
    height: (node as HTMLElement).offsetHeight
  })).filter((node) => node.height > 112))
  expect(verticallyStretchedActions.length).toBeGreaterThan(0)
  const horizontalViewport = { width: 6000, height: 1800 }
  await page.setViewportSize(horizontalViewport)
  await page.waitForTimeout(400)
  await panel.locator('.react-flow__controls-fitview').click()
  await page.waitForTimeout(500)
  await panel.locator('.react-flow').screenshot({
    path: resolve(artifactDirectory, '09-horizontal-material-swimlane-layout.png')
  })
  const tallestAction = [...verticallyStretchedActions]
    .sort((left, right) => right.height - left.height)[0]!
  const tallestActionNode = panel.locator(
    `.wf-node[data-workflow-node-uuid="${tallestAction.id}"]`
  )
  await focusViewportOn(panel, tallestActionNode, 0.9)
  await screenshotAround(page, tallestActionNode, resolve(
    artifactDirectory,
    '10-horizontal-multi-material-node.png'
  ), 180)
  await screenshotAround(page, panel.locator(
    '.workflow-runtime__layout-tools'
  ), resolve(
    artifactDirectory,
    '11-swimlane-direction-controls.png'
  ), 24)
  const horizontalTransferEvidence = await transferHandleEvidence(
    robotTransferNodes
  )
  expect(horizontalTransferEvidence.every((item) =>
    item.crossAxisDelta <= 1 && item.edgeDelta <= 2
  ), JSON.stringify(horizontalTransferEvidence, null, 2)).toBe(true)
  await focusViewportOn(panel, reagentNode, 1)
  await screenshotAround(page, reagentNode, resolve(
    artifactDirectory,
    '13-robot-transfer-node-horizontal.png'
  ), 120)

  expect(requestFailures).toEqual([])
  expect(browserErrors).toEqual([])
  writeFileSync(resolve(artifactDirectory, 'evidence.json'), `${JSON.stringify({
    szlab_revision: os.szlabRevision,
    workflow_uuid: SZLAB_COMPOSITE_MATERIAL_WORKFLOW_UUID,
    source_graph: { nodes: graph.nodes.length, edges: graph.edges.length },
    visible_nodes: await visibleNodes.count(),
    material_sources: await materialSources.count(),
    robot_transfer_nodes: {
      count: await robotTransferNodes.count(),
      vertical_handles: verticalTransferEvidence,
      horizontal_handles: horizontalTransferEvidence
    },
    material_edges: await materialEdges.count(),
    ready_edges: await readyEdges.count(),
    ready_handles: readyHandleEvidence,
    robot_transfer_ready_handles: robotTransferReadyHandleEvidence,
    node_overlap_pairs: overlappingPairs(nodeBoxes),
    material_source_overlap_pairs: overlappingPairs(sourceBoxes),
    reagent_at_s08_has_resource_input_and_output: true,
    rounded_ready_paths: routedPaths.filter((path) => path.includes('Q')).length,
    clear_workbench: clearWorkbenchEvidence,
    material_swimlanes: {
      source_order: swimlaneSourceOrder,
      vertical_edges: materialPathEvidence,
      stretched_actions: stretchedActions,
      node_overlap_pairs: overlappingPairs(swimlaneNodeBoxes),
      horizontal: {
        screenshot_viewport: horizontalViewport,
        source_order: horizontalSourceOrder,
        horizontal_edges: horizontalMaterialPathEvidence,
        directional_handles: horizontalMaterialHandleEvidence,
        stretched_actions: verticallyStretchedActions,
        node_overlap_pairs: overlappingPairs(horizontalNodeBoxes)
      }
    },
    browser_errors: browserErrors,
    request_failures: requestFailures
  }, null, 2)}\n`, 'utf8')
})

interface HorizontalMaterialHandleEvidence {
  owner: 'action' | 'material-source' | 'robot-transfer'
  io: string
  cssWidth: number
  cssHeight: number
  screenWidth: number
  screenHeight: number
  backgroundColor: string
}

/**
 * 读取横向物料流（MaterialFlow）句柄的所有者、方向和实际视觉尺寸。
 *
 * @param handles 当前横向工作流（Workflow）画布中的全部物料句柄。
 * @returns 可验证输入空心、输出实心和垂直短胶囊比例的浏览器证据。
 */
async function readHorizontalMaterialHandles(
  handles: Locator
): Promise<HorizontalMaterialHandleEvidence[]> {
  return handles.evaluateAll((elements) => elements.map((element) => {
    const handle = element as HTMLElement
    const bounds = handle.getBoundingClientRect()
    const style = getComputedStyle(handle)
    const node = handle.closest<HTMLElement>('.wf-node')
    const owner = node?.dataset.workflowNodeVisualKind === 'robot-transfer'
      ? 'robot-transfer'
      : node?.dataset.workflowNodeKind === 'material_source'
        ? 'material-source'
        : 'action'
    return {
      owner,
      io: handle.dataset.workflowHandleIo ?? '',
      cssWidth: Number.parseFloat(style.width),
      cssHeight: Number.parseFloat(style.height),
      screenWidth: bounds.width,
      screenHeight: bounds.height,
      backgroundColor: style.backgroundColor
    }
  }))
}

interface TransferHandleEvidence {
  nodeId: string
  io: string
  crossAxisDelta: number
  edgeDelta: number
}

/** 验证物料流（MaterialFlow）句柄位于菱形机械臂外缘并与其中心轴对齐。 */
async function transferHandleEvidence(
  nodes: Locator
): Promise<TransferHandleEvidence[]> {
  return nodes.evaluateAll((elements) => elements.flatMap((element) => {
    const node = element as HTMLElement
    const visual = node.querySelector<HTMLElement>('[data-workflow-robot-arm]')
    if (!visual) throw new Error('转运节点缺少机械臂视觉')
    const visualRect = visual.getBoundingClientRect()
    const horizontal = node.dataset.workflowLayoutDirection === 'horizontal'
    return [...node.querySelectorAll<HTMLElement>(
      '[data-workflow-handle-kind="material"]'
    )].map((handle) => {
      const handleRect = handle.getBoundingClientRect()
      const io = handle.dataset.workflowHandleIo ?? ''
      return {
        nodeId: node.dataset.workflowNodeUuid ?? '',
        io,
        crossAxisDelta: horizontal
          ? Math.abs(
              handleRect.top + handleRect.height / 2 -
              (visualRect.top + visualRect.height / 2)
            )
          : Math.abs(
              handleRect.left + handleRect.width / 2 -
              (visualRect.left + visualRect.width / 2)
            ),
        edgeDelta: horizontal
          ? Math.abs(
              handleRect.left + handleRect.width / 2 -
              (io === 'target' ? visualRect.left : visualRect.right)
            )
          : Math.abs(
              handleRect.top + handleRect.height / 2 -
              (io === 'target' ? visualRect.top : visualRect.bottom)
            )
      }
    })
  }))
}

interface NamedBox {
  name: string
  x: number
  y: number
  width: number
  height: number
}

/** 读取一组可见元素的屏幕坐标。 */
async function boundingBoxes(locator: Locator): Promise<NamedBox[]> {
  return locator.evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect()
    return {
      name: element.getAttribute('data-id') ||
        element.getAttribute('data-workflow-node-uuid') || '',
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height
    }
  }))
}

/** 返回有实际面积相交的节点名称对。 */
function overlappingPairs(boxes: readonly NamedBox[]): string[] {
  const overlaps: string[] = []
  boxes.forEach((left, index) => {
    boxes.slice(index + 1).forEach((right) => {
      const width = Math.min(left.x + left.width, right.x + right.width) -
        Math.max(left.x, right.x)
      const height = Math.min(left.y + left.height, right.y + right.height) -
        Math.max(left.y, right.y)
      if (width > 0.5 && height > 0.5) overlaps.push(`${left.name}::${right.name}`)
    })
  })
  return overlaps
}

/**
 * 用扩展浏览器视口重新适配完整工作流（Workflow），生成文字可读的工作台截图。
 *
 * @param page 当前真实前端页面。
 * @param panel 工作流（Workflow）面板定位器。
 * @param visibleNodes 当前折叠投影中的全部可见节点定位器。
 * @param path 清晰工作台截图的输出路径。
 * @returns 截图尺寸、画布缩放率和最小节点屏幕高度证据。
 */
async function captureClearWorkbench(
  page: Page,
  panel: Locator,
  visibleNodes: Locator,
  path: string
): Promise<{
  viewport: { width: number; height: number }
  workflowZoom: number
  minimumNodeHeight: number
}> {
  const viewport = { width: 2400, height: 4200 }
  await page.setViewportSize(viewport)
  await page.waitForTimeout(400)
  await panel.locator('.react-flow__controls-fitview').click()
  await page.waitForTimeout(500)
  const workflowTransform = await panel.locator('.react-flow__viewport')
    .evaluate((element) => getComputedStyle(element).transform)
  const matrixValues = workflowTransform === 'none'
    ? [1, 0, 0, 1, 0, 0]
    : (workflowTransform.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
  const workflowZoom = matrixValues[0] ?? 1
  const nodeHeights = await visibleNodes.evaluateAll((nodes) =>
    nodes.map((node) => node.getBoundingClientRect().height)
  )
  const minimumNodeHeight = Math.min(...nodeHeights)
  expect(workflowZoom).toBeGreaterThanOrEqual(0.7)
  expect(minimumNodeHeight).toBeGreaterThanOrEqual(36)
  await page.screenshot({ path, fullPage: true })
  return { viewport, workflowZoom, minimumNodeHeight }
}

/** 为局部视觉证据增加画布上下文并裁剪到当前视口。 */
async function screenshotAround(
  page: Page,
  locator: Locator,
  path: string,
  padding = 28
): Promise<void> {
  const boxes = await locator.evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect()
    return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom }
  }))
  if (boxes.length === 0) throw new Error(`截图目标不存在：${path}`)
  const viewport = page.viewportSize()
  if (!viewport) throw new Error('浏览器视口不存在')
  const x = Math.max(0, Math.min(...boxes.map((box) => box.x)) - padding)
  const y = Math.max(0, Math.min(...boxes.map((box) => box.y)) - padding)
  const right = Math.min(
    viewport.width,
    Math.max(...boxes.map((box) => box.right)) + padding
  )
  const bottom = Math.min(
    viewport.height,
    Math.max(...boxes.map((box) => box.bottom)) + padding
  )
  await page.screenshot({
    path,
    clip: { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) }
  })
}

/** 将 ReactFlow 视口临时聚焦到截图目标，确保复杂图的局部文字可读。 */
async function focusViewportOn(
  panel: Locator,
  target: Locator,
  maximumZoom: number
): Promise<void> {
  const flow = panel.locator('.react-flow')
  const viewport = flow.locator('.react-flow__viewport')
  const flowBox = await flow.boundingBox()
  const targetBoxes = await target.evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect()
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
    })
  )
  if (!flowBox || targetBoxes.length === 0) {
    throw new Error('无法计算工作流局部截图视口')
  }
  const transform = await viewport.evaluate((element) =>
    getComputedStyle(element).transform
  )
  const matrixValues = transform === 'none'
    ? [1, 0, 0, 1, 0, 0]
    : (transform.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
  if (matrixValues.length < 6) throw new Error(`无法解析视口矩阵：${transform}`)
  const currentZoom = matrixValues[0] || 1
  const translateCurrentX = matrixValues[4] ?? 0
  const translateCurrentY = matrixValues[5] ?? 0
  const screenLeft = Math.min(...targetBoxes.map((box) => box.left))
  const screenTop = Math.min(...targetBoxes.map((box) => box.top))
  const screenRight = Math.max(...targetBoxes.map((box) => box.right))
  const screenBottom = Math.max(...targetBoxes.map((box) => box.bottom))
  const modelLeft = (screenLeft - flowBox.x - translateCurrentX) / currentZoom
  const modelTop = (screenTop - flowBox.y - translateCurrentY) / currentZoom
  const modelRight = (screenRight - flowBox.x - translateCurrentX) / currentZoom
  const modelBottom = (screenBottom - flowBox.y - translateCurrentY) / currentZoom
  const modelWidth = Math.max(1, modelRight - modelLeft)
  const modelHeight = Math.max(1, modelBottom - modelTop)
  const zoom = Math.min(
    maximumZoom,
    (flowBox.width - 160) / modelWidth,
    (flowBox.height - 160) / modelHeight
  )
  const translateX = flowBox.width / 2 - (modelLeft + modelRight) / 2 * zoom
  const translateY = flowBox.height / 2 - (modelTop + modelBottom) / 2 * zoom
  await viewport.evaluate((element, next) => {
    const viewportElement = element as HTMLElement
    viewportElement.style.transform =
      `translate(${next.x}px, ${next.y}px) scale(${next.zoom})`
  }, { x: translateX, y: translateY, zoom })
  await panel.page().waitForTimeout(120)
}

/** 读取 Uni-Lab OS 标准响应信封。 */
async function readEnvelope<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`)
  const envelope = await response.json() as { code: number; data: T }
  if (envelope.code !== 0) throw new Error(JSON.stringify(envelope))
  return envelope.data
}
