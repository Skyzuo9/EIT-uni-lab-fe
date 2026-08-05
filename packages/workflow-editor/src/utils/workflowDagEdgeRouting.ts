export const WORKFLOW_SMOOTHSTEP_OFFSET = 8

const TARGET_LOCAL_BEND_GAP = 28
const CROSS_LAYER_MIN_SPAN = 200

/**
 * 将跨越多层的正交边最后一个折点收在目标节点附近，减少长距离交叉。
 *
 * @param positions 连线起点、终点、主流向的画布路由参数。
 * @returns 传给 ReactFlow 圆角折线算法的可选中心坐标。
 */
export function getWorkflowSmoothStepCenter({
  sourceX,
  sourceY,
  targetX,
  targetY,
  direction = 'TB'
}: {
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  direction?: 'TB' | 'LR'
}): { centerX?: number; centerY?: number } {
  if (
    direction === 'LR' &&
    sourceY !== targetY &&
    Math.abs(targetX - sourceX) > CROSS_LAYER_MIN_SPAN
  ) {
    const sign = Math.sign(targetX - sourceX) || 1
    return { centerX: targetX - sign * TARGET_LOCAL_BEND_GAP }
  }
  if (direction === 'LR') return {}
  if (
    sourceX !== targetX &&
    Math.abs(targetY - sourceY) > CROSS_LAYER_MIN_SPAN
  ) {
    const sign = Math.sign(targetY - sourceY) || 1
    return { centerY: targetY - sign * TARGET_LOCAL_BEND_GAP }
  }
  return {}
}
