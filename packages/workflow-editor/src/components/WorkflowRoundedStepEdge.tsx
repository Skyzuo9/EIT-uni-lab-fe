import {
  BaseEdge,
  EdgeText,
  getSmoothStepPath,
  type EdgeProps
} from 'reactflow'

import {
  getWorkflowSmoothStepCenter,
  WORKFLOW_SMOOTHSTEP_OFFSET
} from '../utils/workflowDagEdgeRouting'

export interface WorkflowRoundedStepEdgeData {
  direction: 'TB' | 'LR'
  borderRadius: number
}

/**
 * 渲染带圆角的正交工作流边，并保留分支标签和箭头。
 *
 * @param props ReactFlow 提供的端点、标签、样式与路由配置。
 * @returns 横平竖直且转角圆润的 SVG 连线。
 */
export default function WorkflowRoundedStepEdge({
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  markerEnd,
  style,
  label,
  labelStyle,
  labelShowBg,
  labelBgStyle,
  labelBgPadding,
  labelBgBorderRadius,
  data
}: EdgeProps<WorkflowRoundedStepEdgeData>): React.JSX.Element {
  const { centerX, centerY } = getWorkflowSmoothStepCenter({
    sourceX,
    sourceY,
    targetX,
    targetY,
    direction: data?.direction
  })
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: data?.borderRadius ?? 8,
    centerX,
    centerY,
    offset: WORKFLOW_SMOOTHSTEP_OFFSET
  })
  return (
    <>
      <BaseEdge path={path} markerEnd={markerEnd} style={style} />
      {label !== undefined && label !== null && (
        <EdgeText
          x={labelX}
          y={labelY}
          label={label}
          labelStyle={labelStyle}
          labelShowBg={labelShowBg}
          labelBgStyle={labelBgStyle}
          labelBgPadding={labelBgPadding}
          labelBgBorderRadius={labelBgBorderRadius}
        />
      )}
    </>
  )
}
