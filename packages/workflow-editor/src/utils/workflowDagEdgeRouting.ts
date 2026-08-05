export const WORKFLOW_SMOOTHSTEP_OFFSET = 8

const TARGET_LOCAL_BEND_GAP = 28
const CROSS_LAYER_MIN_SPAN = 200

/**
 * 将跨越多层的正交边最后一个折点收在目标节点附近，减少长距离交叉。
 *
 * @param positions 连线起点与终点的画布坐标。
 * @returns 传给 ReactFlow 圆角折线算法的可选中心坐标。
 */
export function getWorkflowSmoothStepCenter({
  sourceX,
  sourceY,
  targetX,
  targetY
}: {
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
}): { centerY?: number } {
  if (
    sourceX !== targetX &&
    Math.abs(targetY - sourceY) > CROSS_LAYER_MIN_SPAN
  ) {
    const sign = Math.sign(targetY - sourceY) || 1
    return { centerY: targetY - sign * TARGET_LOCAL_BEND_GAP }
  }
  return {}
}
