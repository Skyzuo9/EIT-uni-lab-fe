import type { WorkflowNode } from './parseWorkflow'
import type { WorkflowNodePortLayout } from './dagLayout'

export const WORKFLOW_SUPPORTING_BRANCH_NODE_GAP = 208

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

  for (const branch of branches) {
    const candidateGroups = supportingBranchCandidates(
      branch,
      originX,
      mainColumnGap,
      mainColumnCount
    )
    const canvasEnd = originX +
      (mainColumnCount - 1) * mainColumnGap +
      WORKFLOW_SUPPORTING_BRANCH_MAX_NODE_WIDTH
    const preferredCandidates = candidateGroups.preferred.filter(
      (candidate) => {
        const interval = branchInterval(candidate)
        return interval.start >= originX && interval.end <= canvasEnd
      }
    )
    // `placementCandidates` 只有上游方向确实放不下时才改用另一侧，避免为了
    // 复用垂直带而把前两条支线重新推到后续主线通道。
    const placementCandidates = preferredCandidates.length > 0
      ? preferredCandidates
      : candidateGroups.alternate.filter((candidate) => {
          const interval = branchInterval(candidate)
          return interval.start >= originX && interval.end <= canvasEnd
        })
    let installed = false
    for (const band of bands) {
      const layout = placementCandidates.find((candidate) => {
        const interval = branchInterval(candidate)
        return band.intervals.every((occupied) =>
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
    const layout = placementCandidates[0] ??
      candidateGroups.preferred[0] ??
      candidateGroups.alternate[0] ?? []
    bands.push({
      intervals: [branchInterval(layout)],
      placements: [...layout]
    })
  }

  return bands.map(({ placements }) => placements.sort(
    (left, right) => left.x - right.x
  ))
}

/**
 * 生成支线贴合接入点、向近侧错开和向远侧错开的三个候选位置。
 *
 * @param branch 当前辅助物料支线。
 * @param originX 主干最西侧坐标。
 * @param mainColumnGap 主干列间距。
 * @param mainColumnCount 单行主样品主干的固定列数。
 * @returns 优先沿主样品流向前置的候选坐标；打包器随后复用已有垂直带。
 */
function supportingBranchCandidates(
  branch: WorkflowSupportingBranch,
  originX: number,
  mainColumnGap: number,
  mainColumnCount: number
): {
  preferred: WorkflowSupportingBranchPlacement[][]
  alternate: WorkflowSupportingBranchPlacement[][]
} {
  const nearOffset = branch.anchorColumn === 0 || branch.anchorColumn === 2
    ? WORKFLOW_SUPPORTING_BRANCH_NODE_GAP
    : -WORKFLOW_SUPPORTING_BRANCH_NODE_GAP
  // `backboneFlowsEast` 表示当前蛇形行的主样品（Primary Sample）阅读方向。
  const backboneFlowsEast = Math.floor(
    branch.anchorIndex / mainColumnCount
  ) % 2 === 0
  // 汇入支线放在接入动作上游，流出支线放在动作下游，避免前部支线
  // 占据后续主样品物料流（MaterialFlow）的主要阅读通道。
  const preferredExpansion = branch.flowDirection === 'into-primary'
    ? !backboneFlowsEast
    : backboneFlowsEast
  const attachmentOffsets = [0, nearOffset, -nearOffset]
  return {
    preferred: attachmentOffsets.map((attachmentOffset) =>
      layoutSupportingBranch(
        branch,
        originX,
        mainColumnGap,
        attachmentOffset,
        preferredExpansion
      )
    ),
    alternate: attachmentOffsets.map((attachmentOffset) =>
      layoutSupportingBranch(
        branch,
        originX,
        mainColumnGap,
        attachmentOffset,
        !preferredExpansion
      )
    )
  }
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
