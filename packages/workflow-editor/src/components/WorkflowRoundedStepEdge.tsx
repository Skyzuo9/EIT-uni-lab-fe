import {
  BaseEdge,
  EdgeText,
  getSmoothStepPath,
  type EdgeProps
} from 'reactflow'

import {
  alignPrimaryMaterialEdgeEndpoints,
  getWorkflowSmoothStepCenter,
  WORKFLOW_SEQUENCE_SMOOTHSTEP_OFFSET,
  WORKFLOW_SMOOTHSTEP_OFFSET
} from '../utils/workflowDagEdgeRouting'

export interface WorkflowRoundedStepEdgeData {
  direction: 'TB' | 'LR'
  borderRadius: number
  sequence?: boolean
  sourceNodeUuid: string
  targetNodeUuid: string
  sourceHandleUuid: string
  targetHandleUuid: string
  materialRole?: string
  materialEmphasis?: 'primary' | 'supporting'
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
  const aligned = alignPrimaryMaterialEdgeEndpoints({
    sourceX,
    sourceY,
    targetX,
    targetY,
    direction: data?.direction ?? 'TB',
    materialRole: data?.materialRole
  })
  const { centerX, centerY } = getWorkflowSmoothStepCenter({
    sourceX: aligned.sourceX,
    sourceY: aligned.sourceY,
    targetX: aligned.targetX,
    targetY: aligned.targetY,
    targetPosition,
    direction: data?.direction
  })
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX: aligned.sourceX,
    sourceY: aligned.sourceY,
    sourcePosition,
    targetX: aligned.targetX,
    targetY: aligned.targetY,
    targetPosition,
    borderRadius: data?.borderRadius ?? 8,
    centerX,
    centerY,
    offset: data?.sequence
      ? WORKFLOW_SEQUENCE_SMOOTHSTEP_OFFSET
      : WORKFLOW_SMOOTHSTEP_OFFSET
  })
  return (
    <g
      data-workflow-edge-source-node-uuid={data?.sourceNodeUuid}
      data-workflow-edge-target-node-uuid={data?.targetNodeUuid}
      data-workflow-edge-source-handle-uuid={data?.sourceHandleUuid}
      data-workflow-edge-target-handle-uuid={data?.targetHandleUuid}
      data-workflow-material-role={data?.materialRole}
      data-workflow-material-emphasis={data?.materialEmphasis}
    >
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
    </g>
  )
}
