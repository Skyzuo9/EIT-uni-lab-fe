import type { WorkflowNode } from './parseWorkflow'
import type { WorkflowNodePortLayout } from './dagLayout'

export const WORKFLOW_SUPPORTING_BRANCH_NODE_GAP = 208

const WORKFLOW_SUPPORTING_BRANCH_INTERVAL_GAP = 24
const WORKFLOW_SUPPORTING_BRANCH_MAX_NODE_WIDTH = 184
const WORKFLOW_SUPPORTING_BRANCH_MATERIAL_SOURCE_WIDTH = 112
const WORKFLOW_SUPPORTING_BRANCH_TRANSFER_WIDTH = 120

export interface WorkflowSupportingBranch {
  nodes: readonly WorkflowNode[]
  anchorIndex: number
  anchorColumn: number
  order: number
  flowDirection: 'into-primary' | 'out-of-primary'
  /** 主干接入节点的真实横坐标；省略时按固定列计算。 */
  anchorX?: number
  /** 接入节点本身也是转运节点时，同样压缩连接距离。 */
  anchorVisualKind?: WorkflowNode['visualKind']
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
 * 每条支线严格沿主干流向从接入节点的前侧进入；互不重叠的支线共享同一
 * 垂直带，发生水平碰撞时才增加新带。支线允许伸出主干蛇形范围，避免为了
 * 截断画布宽度而把 MaterialSource 挤到接入点后侧。
 *
 * @param branches 已按接入位置和声明顺序稳定排序的辅助物料支线。
 * @param originX 主样品主干最西侧坐标。
 * @param mainColumnGap 主样品主干普通列间距。
 * @param mainColumnCount 每条蛇形行允许的主干节点数。
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
    const layout = layoutSupportingBranch(
      branch,
      originX,
      mainColumnGap,
      mainColumnCount
    )
    const interval = branchInterval(layout)
    const available = bands.find((band) => band.intervals.every((occupied) =>
      !intervalsOverlap(interval, occupied)
    ))
    if (available) {
      available.intervals.push(interval)
      available.placements.push(...layout)
    } else {
      bands.push({ intervals: [interval], placements: [...layout] })
    }
  }

  return bands.map(({ placements }) => placements.sort(
    (left, right) => left.x - right.x
  ))
}

/**
 * 让一条辅助物料支线沿主干流向排列，并从接入节点的前侧汇入或离开。
 *
 * @param branch 一条不穿过主样品主干的连通支线。
 * @param originX 主干最西侧坐标。
 * @param mainColumnGap 主干普通列间距。
 * @param mainColumnCount 每条蛇形行允许的主干节点数。
 * @returns 同一垂直带内按局部间距排列的支线节点。
 */
function layoutSupportingBranch(
  branch: WorkflowSupportingBranch,
  originX: number,
  mainColumnGap: number,
  mainColumnCount: number
): WorkflowSupportingBranchPlacement[] {
  const anchorX = branch.anchorX ??
    originX + branch.anchorColumn * mainColumnGap
  const row = Math.floor(branch.anchorIndex / mainColumnCount)
  const flowRunsEast = row % 2 === 0
  const flowSign = flowRunsEast ? 1 : -1
  const internalPorts: WorkflowNodePortLayout = flowRunsEast
    ? { target: 'left', source: 'right' }
    : { target: 'right', source: 'left' }
  const terminalIndex = Math.max(0, branch.nodes.length - 1)
  const attachmentIndex = branch.flowDirection === 'into-primary'
    ? terminalIndex
    : 0
  const attachmentNode = branch.nodes[attachmentIndex]
  const attachmentGap = branchNodeGap(
    attachmentNode,
    branch.anchorVisualKind
  )
  const attachmentSign = branch.flowDirection === 'into-primary'
    ? -flowSign
    : flowSign
  const attachmentX = anchorX + attachmentSign * attachmentGap
  const distances = branchNodeDistances(branch.nodes)

  return branch.nodes.map((node, index) => ({
    node,
    x: branch.flowDirection === 'into-primary'
      ? attachmentX - flowSign *
        (distances[terminalIndex]! - distances[index]!)
      : attachmentX + flowSign * distances[index]!,
    anchorIndex: branch.anchorIndex,
    ports: internalPorts
  }))
}

/** 计算支线各节点相对第一个节点的累计水平距离。 */
function branchNodeDistances(nodes: readonly WorkflowNode[]): number[] {
  const distances = [0]
  for (let index = 1; index < nodes.length; index += 1) {
    distances.push(
      distances[index - 1]! + branchNodeGap(nodes[index - 1], nodes[index])
    )
  }
  return distances
}

/** 只要相邻一端为转运节点，就把该段主轴间距压缩为普通支线的一半。 */
function branchNodeGap(
  left: WorkflowNode | undefined,
  right: WorkflowNode | WorkflowNode['visualKind'] | undefined
): number {
  const rightVisualKind = typeof right === 'string' ? right : right?.visualKind
  return left?.visualKind === 'robot-transfer' ||
    rightVisualKind === 'robot-transfer'
    ? (WORKFLOW_SUPPORTING_BRANCH_NODE_GAP + branchNodeWidth(left)) / 2
    : WORKFLOW_SUPPORTING_BRANCH_NODE_GAP
}

/** 返回支线节点在横向完整支线中的紧凑视觉宽度。 */
function branchNodeWidth(node: WorkflowNode | undefined): number {
  if (node?.visualKind === 'robot-transfer') {
    return WORKFLOW_SUPPORTING_BRANCH_TRANSFER_WIDTH
  }
  if (node?.type === 'material_source') {
    return WORKFLOW_SUPPORTING_BRANCH_MATERIAL_SOURCE_WIDTH
  }
  return WORKFLOW_SUPPORTING_BRANCH_MAX_NODE_WIDTH
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
