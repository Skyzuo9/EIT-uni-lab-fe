import type { Position } from 'reactflow'

export const WORKFLOW_SMOOTHSTEP_OFFSET = 8
export const WORKFLOW_SEQUENCE_SMOOTHSTEP_OFFSET = 4
export const WORKFLOW_PRIMARY_MATERIAL_AXIS_TOLERANCE = 40

const TARGET_LOCAL_BEND_GAP = 28
const CROSS_LAYER_MIN_SPAN = 200

export interface WorkflowEdgeEndpoints {
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  direction: 'TB' | 'LR'
  materialRole?: string
}

/**
 * 将主样品近同轴端点吸附到共同轴线，消除 Handle 测量产生的短折线。
 *
 * 只处理一个物料卡片节距内的误差；蛇形换行等真实跨行转向、辅助物料和
 * 结构边均原样返回。
 */
export function alignPrimaryMaterialEdgeEndpoints(
  endpoints: WorkflowEdgeEndpoints
): WorkflowEdgeEndpoints {
  if (endpoints.materialRole !== 'primary_sample') return endpoints
  if (
    endpoints.direction === 'LR' &&
    Math.abs(endpoints.targetY - endpoints.sourceY) <=
      WORKFLOW_PRIMARY_MATERIAL_AXIS_TOLERANCE
  ) {
    const axis = (endpoints.sourceY + endpoints.targetY) / 2
    return { ...endpoints, sourceY: axis, targetY: axis }
  }
  if (
    endpoints.direction === 'TB' &&
    Math.abs(endpoints.targetX - endpoints.sourceX) <=
      WORKFLOW_PRIMARY_MATERIAL_AXIS_TOLERANCE
  ) {
    const axis = (endpoints.sourceX + endpoints.targetX) / 2
    return { ...endpoints, sourceX: axis, targetX: axis }
  }
  return endpoints
}

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
  targetPosition,
  direction = 'TB'
}: {
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  targetPosition?: Position
  direction?: 'TB' | 'LR'
}): { centerX?: number; centerY?: number } {
  if (
    direction === 'LR' &&
    sourceY !== targetY &&
    Math.abs(targetX - sourceX) > CROSS_LAYER_MIN_SPAN
  ) {
    // `targetSide` 以目标 Handle 为权威，避免反向行按节点相对坐标误判入口。
    const targetSide = targetPosition === 'left'
      ? -1
      : targetPosition === 'right'
        ? 1
        : -(Math.sign(targetX - sourceX) || 1)
    return { centerX: targetX + targetSide * TARGET_LOCAL_BEND_GAP }
  }
  if (direction === 'LR') return {}
  if (
    sourceX !== targetX &&
    Math.abs(targetY - sourceY) > CROSS_LAYER_MIN_SPAN
  ) {
    // `targetSide` 让纵向长连线同样从目标 Handle 所在方向进入。
    const targetSide = targetPosition === 'top'
      ? -1
      : targetPosition === 'bottom'
        ? 1
        : -(Math.sign(targetY - sourceY) || 1)
    return { centerY: targetY + targetSide * TARGET_LOCAL_BEND_GAP }
  }
  return {}
}
