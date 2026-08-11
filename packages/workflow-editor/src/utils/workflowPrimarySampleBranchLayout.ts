import type { WorkflowLink, WorkflowNode } from './parseWorkflow'
import type {
  WorkflowNodePortLayout,
  WorkflowNodePortSide
} from './dagLayout'
import { isResourceSlotHandle } from './workflowMaterialTrace'

export const WORKFLOW_SUPPORTING_BRANCH_NODE_GAP = 208
export const WORKFLOW_SUPPORTING_BRANCH_LEADING_LEFT_SHIFT =
  WORKFLOW_SUPPORTING_BRANCH_NODE_GAP

const WORKFLOW_SUPPORTING_BRANCH_INTERVAL_GAP = 24
const WORKFLOW_SUPPORTING_BRANCH_MAX_NODE_WIDTH = 184

export interface WorkflowSupportingBranch {
  nodes: readonly WorkflowNode[]
  anchorIndex: number
  anchorColumn: number
  order: number
  flowDirection: 'into-primary' | 'out-of-primary'
}

export interface WorkflowSupportingBranchPlacement {
  node: WorkflowNode
  x: number
  anchorIndex: number
  ports: WorkflowNodePortLayout
}

/**
 * 把主样品主干序号转换为蛇形行内的实际画布列。
 *
 * @param nodeIndex 节点在主样品主干中的零基序号。
 * @param nodesPerRow 每条蛇形行允许的节点数。
 * @returns 从西向东计数的零基画布列。
 */
export function workflowBackboneColumnForIndex(
  nodeIndex: number,
  nodesPerRow: number
): number {
  const row = Math.floor(nodeIndex / nodesPerRow)
  const indexInRow = nodeIndex % nodesPerRow
  return row % 2 === 0
    ? indexInRow
    : nodesPerRow - 1 - indexInRow
}

/**
 * 将同一主样品行的辅助物料支线压缩成可共享垂直带的局部短链。
 *
 * 每条支线的汇入端与主样品（Primary Sample）动作保持同列，前序节点向画布
 * 内侧展开；互不重叠的支线共享同一垂直带，发生水平碰撞时才增加新带。
 * 第一行排序最前的两条支线完成打包后整组向左平移，不改变支线内部顺序、
 * Handle 方向或接入关系。
 *
 * @param branches 已按接入位置和声明顺序稳定排序的辅助物料支线。
 * @param originX 主样品主干最西侧坐标。
 * @param mainColumnGap 主样品主干列间距。
 * @param mainColumnCount 主样品主干的固定列数。
 * @returns 按垂直带分组的节点坐标与东西向端口布局。
 */
export function packWorkflowSupportingBranches(
  branches: readonly WorkflowSupportingBranch[],
  originX: number,
  mainColumnGap: number,
  mainColumnCount: number
): WorkflowSupportingBranchPlacement[][] {
  const bands: Array<{
    intervals: Array<{ start: number; end: number }>
    placements: WorkflowSupportingBranchPlacement[]
  }> = []
  // `leadingLeftShiftNodeIds` 只标识第一行排序最前的两条辅助物料支线；
  // 平移发生在打包完成后，因此不会把几何左移误写成物料流向规则。
  const leadingLeftShiftNodeIds = new Set(
    branches
      .filter((branch) => branch.anchorIndex < mainColumnCount)
      .slice(0, 2)
      .flatMap((branch) => branch.nodes.map((node) => node.id))
  )

  for (const branch of branches) {
    const candidates = supportingBranchCandidates(
      branch,
      originX,
      mainColumnGap
    )
    const canvasEnd = originX +
      (mainColumnCount - 1) * mainColumnGap +
      WORKFLOW_SUPPORTING_BRANCH_MAX_NODE_WIDTH
    let installed = false
    for (const band of bands) {
      const layout = candidates.find((candidate) => {
        const interval = branchInterval(candidate)
        return interval.start >= originX && interval.end <= canvasEnd
          && band.intervals.every((occupied) =>
            !intervalsOverlap(interval, occupied)
          )
      })
      if (!layout) continue
      band.intervals.push(branchInterval(layout))
      band.placements.push(...layout)
      installed = true
      break
    }
    if (installed) continue
    const layout = candidates.find((candidate) => {
      const interval = branchInterval(candidate)
      return interval.start >= originX && interval.end <= canvasEnd
    }) ?? candidates[0] ?? []
    bands.push({
      intervals: [branchInterval(layout)],
      placements: [...layout]
    })
  }

  return bands.map(({ placements }) => placements
    .map((placement) => leadingLeftShiftNodeIds.has(placement.node.id)
      ? {
          ...placement,
          x: placement.x - WORKFLOW_SUPPORTING_BRANCH_LEADING_LEFT_SHIFT
        }
      : placement)
    .sort((left, right) => left.x - right.x))
}

/**
 * 让跨越上下带的转运物料边沿实际相对方位就近连接。
 *
 * 同一垂直带内仍使用东西侧 Handle；只有转运节点跨带接入物料流
 * （MaterialFlow）时才改用南北侧，避免从远侧横向绕出矩形回路。
 *
 * @param nodes 当前画布投影中的工作流（Workflow）节点。
 * @param links 当前可见工作流边。
 * @param positions 节点左上角画布坐标。
 * @param nodePorts 已由主干与辅助支线布局确定的物料端口方向。
 */
export function routeWorkflowTransferPorts(
  nodes: readonly WorkflowNode[],
  links: readonly WorkflowLink[],
  positions: ReadonlyMap<string, { x: number; y: number }>,
  nodePorts: Map<string, WorkflowNodePortLayout>
): void {
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const handleByUuid = new Map(nodes.flatMap((node) =>
    (node.handles ?? []).map((handle) => [handle.uuid, handle] as const)
  ))
  for (const link of links) {
    const sourceNode = nodeById.get(link.source)
    const targetNode = nodeById.get(link.target)
    const sourcePosition = positions.get(link.source)
    const targetPosition = positions.get(link.target)
    const sourcePorts = nodePorts.get(link.source)
    const targetPorts = nodePorts.get(link.target)
    if (!sourcePosition || !targetPosition || !sourcePorts || !targetPorts) {
      continue
    }
    const [sourceSide, targetSide] = facingPortSides(
      sourcePosition,
      targetPosition
    )
    if (linkUsesMaterialHandle(link, handleByUuid)) {
      if (sourceNode?.visualKind === 'robot-transfer' &&
        sourcePosition.y !== targetPosition.y) {
        nodePorts.set(link.source, { ...sourcePorts, source: sourceSide })
      }
      if (targetNode?.visualKind === 'robot-transfer' &&
        sourcePosition.y !== targetPosition.y) {
        nodePorts.set(link.target, { ...targetPorts, target: targetSide })
      }
    }
  }
}

/**
 * 根据一条边实际使用的逐 Handle 方位选择正交路由主轴。
 *
 * @param link 当前可见工作流边。
 * @param nodePorts 节点物料端口方位表。
 * @returns 任一端口位于南北侧时使用纵向路由，否则保持横向路由。
 */
export function workflowEdgeDirectionForPorts(
  link: WorkflowLink,
  nodePorts: ReadonlyMap<string, WorkflowNodePortLayout>
): 'TB' | 'LR' {
  const sourcePorts = nodePorts.get(link.source)
  const targetPorts = nodePorts.get(link.target)
  const sourceSide = sourcePorts?.source
  const targetSide = targetPorts?.target
  return [sourceSide, targetSide].some((side) =>
    side === 'top' || side === 'bottom'
  ) ? 'TB' : 'LR'
}

/** 判断一条连线是否由物料占位符（ResourceSlot）Handle 承载。 */
function linkUsesMaterialHandle(
  link: WorkflowLink,
  handleByUuid: ReadonlyMap<string, NonNullable<WorkflowNode['handles']>[number]>
): boolean {
  return [link.sourceHandleUuid, link.targetHandleUuid].some((uuid) => {
    const handle = uuid ? handleByUuid.get(uuid) : undefined
    return handle ? isResourceSlotHandle(handle) : false
  })
}

/** 返回两个节点沿主位移轴互相面对的 source 与 target 端口。 */
function facingPortSides(
  source: { x: number; y: number },
  target: { x: number; y: number }
): [WorkflowNodePortSide, WorkflowNodePortSide] {
  const deltaX = target.x - source.x
  const deltaY = target.y - source.y
  if (deltaY !== 0) {
    return deltaY > 0 ? ['bottom', 'top'] : ['top', 'bottom']
  }
  return deltaX >= 0 ? ['right', 'left'] : ['left', 'right']
}

/**
 * 生成支线贴合接入点、向近侧错开和向远侧错开的三个候选位置。
 *
 * @param branch 当前辅助物料支线。
 * @param originX 主干最西侧坐标。
 * @param mainColumnGap 主干列间距。
 * @returns 由短到长排列的候选坐标；打包器优先复用已有垂直带。
 */
function supportingBranchCandidates(
  branch: WorkflowSupportingBranch,
  originX: number,
  mainColumnGap: number
): WorkflowSupportingBranchPlacement[][] {
  const nearOffset = branch.anchorColumn === 0 || branch.anchorColumn === 2
    ? WORKFLOW_SUPPORTING_BRANCH_NODE_GAP
    : -WORKFLOW_SUPPORTING_BRANCH_NODE_GAP
  const preferredExpansion = branch.anchorColumn < 2
  return [
    layoutSupportingBranch(
      branch,
      originX,
      mainColumnGap,
      0,
      preferredExpansion
    ),
    layoutSupportingBranch(
      branch,
      originX,
      mainColumnGap,
      0,
      !preferredExpansion
    ),
    ...[nearOffset, -nearOffset].flatMap((attachmentOffset) => [
      layoutSupportingBranch(
        branch,
        originX,
        mainColumnGap,
        attachmentOffset,
        preferredExpansion
      ),
      layoutSupportingBranch(
        branch,
        originX,
        mainColumnGap,
        attachmentOffset,
        !preferredExpansion
      )
    ])
  ]
}

/**
 * 让一条辅助物料支线的末端贴近主干，并向可用空间更多的一侧展开。
 *
 * @param branch 一条不穿过主样品主干的连通支线。
 * @param originX 主干最西侧坐标。
 * @param mainColumnGap 主干列间距。
 * @param attachmentOffset 支线连接端相对主干接入列的水平偏移。
 * @param expandsEast 支线其余节点是否从连接端向东展开。
 * @returns 同一垂直带内按局部间距排列的支线节点。
 */
function layoutSupportingBranch(
  branch: WorkflowSupportingBranch,
  originX: number,
  mainColumnGap: number,
  attachmentOffset: number,
  expandsEast: boolean
): WorkflowSupportingBranchPlacement[] {
  const anchorX = originX + branch.anchorColumn * mainColumnGap
  const flowRunsEast = expandsEast ===
    (branch.flowDirection === 'out-of-primary')
  const internalPorts: WorkflowNodePortLayout = flowRunsEast
    ? { target: 'left', source: 'right' }
    : { target: 'right', source: 'left' }
  const terminalIndex = Math.max(0, branch.nodes.length - 1)
  const attachmentX = anchorX + attachmentOffset

  return branch.nodes.map((node, index) => ({
    node,
    x: attachmentX +
      (expandsEast ? 1 : -1) *
      (branch.flowDirection === 'into-primary'
        ? terminalIndex - index
        : index) * WORKFLOW_SUPPORTING_BRANCH_NODE_GAP,
    anchorIndex: branch.anchorIndex,
    ports: branchAttachmentPorts(
      internalPorts,
      branch.flowDirection,
      index,
      terminalIndex,
      attachmentOffset
    )
  }))
}

/** 让发生水平错位的支线连接端 Handle 始终朝向主干接入动作。 */
function branchAttachmentPorts(
  internalPorts: WorkflowNodePortLayout,
  flowDirection: WorkflowSupportingBranch['flowDirection'],
  nodeIndex: number,
  terminalIndex: number,
  attachmentOffset: number
): WorkflowNodePortLayout {
  const attachmentIndex = flowDirection === 'into-primary' ? terminalIndex : 0
  if (nodeIndex !== attachmentIndex || attachmentOffset === 0) {
    return internalPorts
  }
  const sideTowardAnchor = attachmentOffset < 0 ? 'right' : 'left'
  return flowDirection === 'into-primary'
    ? { ...internalPorts, source: sideTowardAnchor }
    : { ...internalPorts, target: sideTowardAnchor }
}

/** 返回一条局部支线在画布上的水平占用区间。 */
function branchInterval(
  placements: readonly WorkflowSupportingBranchPlacement[]
): { start: number; end: number } {
  const positions = placements.map(({ x }) => x)
  return {
    start: Math.min(...positions),
    end: Math.max(...positions) + WORKFLOW_SUPPORTING_BRANCH_MAX_NODE_WIDTH
  }
}

/** 判断两条支线的水平区间是否需要拆到不同垂直带。 */
function intervalsOverlap(
  left: { start: number; end: number },
  right: { start: number; end: number }
): boolean {
  return left.start < right.end + WORKFLOW_SUPPORTING_BRANCH_INTERVAL_GAP &&
    right.start < left.end + WORKFLOW_SUPPORTING_BRANCH_INTERVAL_GAP
}
