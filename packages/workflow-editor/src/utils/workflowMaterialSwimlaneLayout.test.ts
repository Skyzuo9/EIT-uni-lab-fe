import { describe, expect, it } from 'vitest'

import type {
  WorkflowHandlePort,
  WorkflowLink,
  WorkflowNode
} from './parseWorkflow'
import {
  layoutWorkflowMaterialSwimlanes,
  WORKFLOW_MATERIAL_ACTION_FIRST_HANDLE_X,
  WORKFLOW_MATERIAL_ACTION_FIRST_HANDLE_Y,
  WORKFLOW_HORIZONTAL_MATERIAL_SOURCE_HANDLE_AXIS,
  WORKFLOW_HORIZONTAL_TRANSFER_NODE_HANDLE_AXIS,
  WORKFLOW_MATERIAL_LANE_GAP,
  WORKFLOW_VERTICAL_MATERIAL_SOURCE_HANDLE_AXIS,
  WORKFLOW_VERTICAL_TRANSFER_NODE_HANDLE_AXIS
} from './workflowMaterialSwimlaneLayout'

describe('layoutWorkflowMaterialSwimlanes', () => {
  /** 验证物料声明顺序决定左右泳道，多物料节点横跨对应泳道。 */
  it('preserves material left-to-right order and stretches shared actions', () => {
    const powderOutput = resourceSlotHandle('powder-output', 'powder', 'source')
    const bottleOutput = resourceSlotHandle('bottle-output', 'bottle', 'source')
    const tipOutput = resourceSlotHandle('tip-output', 'tip', 'source')
    const powderInput = resourceSlotHandle('powder-input', 'powder', 'target')
    const powderPass = resourceSlotHandle('powder-pass', 'powder', 'source')
    const bottleInput = resourceSlotHandle('bottle-input', 'bottle', 'target')
    const bottlePass = resourceSlotHandle('bottle-pass', 'bottle', 'source')
    const powderNext = resourceSlotHandle('powder-next', 'powder', 'target')
    const bottleNext = resourceSlotHandle('bottle-next', 'bottle', 'target')
    const nodes: WorkflowNode[] = [
      workflowNode('powder-source', '细粉', 'material_source', [powderOutput]),
      workflowNode('bottle-source', '试剂瓶', 'material_source', [bottleOutput]),
      workflowNode('tip-source', '吸头', 'material_source', [tipOutput]),
      workflowNode('dose', '投料', 'action', [
        powderInput,
        powderPass,
        bottleInput,
        bottlePass
      ]),
      workflowNode('powder-check', '检查粉末', 'action', [powderNext]),
      workflowNode('bottle-check', '检查试剂瓶', 'action', [bottleNext])
    ]
    const links = [
      materialLink('bottle-source', bottleOutput, 'dose', bottleInput),
      materialLink('powder-source', powderOutput, 'dose', powderInput),
      materialLink('dose', powderPass, 'powder-check', powderNext),
      materialLink('dose', bottlePass, 'bottle-check', bottleNext)
    ]

    const result = layoutWorkflowMaterialSwimlanes(nodes, links)
    const nodeById = new Map(result.nodes.map((node) => [node.id, node]))
    const doseLayout = result.swimlanes.nodeLayouts.get('dose')

    expect(result.swimlanes.lanes.map((lane) => lane.label)).toEqual([
      '细粉',
      '试剂瓶',
      '吸头'
    ])
    expect(result.swimlanes.lanes[1]!.x - result.swimlanes.lanes[0]!.x)
      .toBe(WORKFLOW_MATERIAL_LANE_GAP)
    expect(doseLayout).toMatchObject({ startLane: 0, endLane: 1 })
    expect(doseLayout?.width).toBeGreaterThan(
      result.swimlanes.nodeLayouts.get('powder-check')?.width ?? 0
    )
    expect(handleCenterX(result, 'powder-source', powderOutput.uuid)).toBe(
      handleCenterX(result, 'dose', powderInput.uuid)
    )
    expect(handleCenterX(result, 'dose', powderPass.uuid)).toBe(
      handleCenterX(result, 'powder-check', powderNext.uuid)
    )
    expect(handleCenterX(result, 'bottle-source', bottleOutput.uuid)).toBe(
      handleCenterX(result, 'dose', bottleInput.uuid)
    )
    expect(handleCenterX(result, 'dose', bottlePass.uuid)).toBe(
      handleCenterX(result, 'bottle-check', bottleNext.uuid)
    )
    expect(nodeById.get('powder-check')?.y).not.toBe(
      nodeById.get('bottle-check')?.y
    )
  })

  /** 验证横向泳道保持上下物料顺序，并让物料边的端点位于同一水平线。 */
  it('rotates material lanes horizontally and stretches shared actions vertically', () => {
    const powderOutput = resourceSlotHandle('powder-output', 'powder', 'source')
    const bottleOutput = resourceSlotHandle('bottle-output', 'bottle', 'source')
    const powderInput = resourceSlotHandle('powder-input', 'powder', 'target')
    const powderPass = resourceSlotHandle('powder-pass', 'powder', 'source')
    const bottleInput = resourceSlotHandle('bottle-input', 'bottle', 'target')
    const bottlePass = resourceSlotHandle('bottle-pass', 'bottle', 'source')
    const powderNext = resourceSlotHandle('powder-next', 'powder', 'target')
    const bottleNext = resourceSlotHandle('bottle-next', 'bottle', 'target')
    const nodes: WorkflowNode[] = [
      workflowNode('powder-source', '细粉', 'material_source', [powderOutput]),
      workflowNode('bottle-source', '试剂瓶', 'material_source', [bottleOutput]),
      workflowNode('dose', '投料', 'action', [
        powderInput,
        powderPass,
        bottleInput,
        bottlePass
      ]),
      workflowNode('powder-check', '检查粉末', 'action', [powderNext]),
      workflowNode('bottle-check', '检查试剂瓶', 'action', [bottleNext])
    ]
    const links = [
      materialLink('bottle-source', bottleOutput, 'dose', bottleInput),
      materialLink('powder-source', powderOutput, 'dose', powderInput),
      materialLink('dose', powderPass, 'powder-check', powderNext),
      materialLink('dose', bottlePass, 'bottle-check', bottleNext)
    ]

    const result = layoutWorkflowMaterialSwimlanes(
      nodes,
      links,
      'horizontal'
    )
    const doseLayout = result.swimlanes.nodeLayouts.get('dose')

    expect(result.direction).toBe('horizontal')
    expect(result.swimlanes.direction).toBe('horizontal')
    expect(result.swimlanes.lanes.map((lane) => lane.label)).toEqual([
      '细粉',
      '试剂瓶'
    ])
    expect(result.swimlanes.lanes[1]!.axis - result.swimlanes.lanes[0]!.axis)
      .toBe(WORKFLOW_MATERIAL_LANE_GAP)
    expect(doseLayout).toMatchObject({ startLane: 0, endLane: 1 })
    expect(doseLayout?.height).toBeGreaterThan(
      result.swimlanes.nodeLayouts.get('powder-check')?.height ?? 0
    )
    expect(handleCenterY(result, 'powder-source', powderOutput.uuid)).toBe(
      handleCenterY(result, 'dose', powderInput.uuid)
    )
    expect(handleCenterY(result, 'dose', powderPass.uuid)).toBe(
      handleCenterY(result, 'powder-check', powderNext.uuid)
    )
    expect(handleCenterY(result, 'bottle-source', bottleOutput.uuid)).toBe(
      handleCenterY(result, 'dose', bottleInput.uuid)
    )
    expect(handleCenterY(result, 'dose', bottlePass.uuid)).toBe(
      handleCenterY(result, 'bottle-check', bottleNext.uuid)
    )
  })

  /** 验证菱形机械臂节点在两个泳道方向都以菱形中心轴对准物料流。 */
  it('aligns robot transfer handles to the material lane in both directions', () => {
    const sourceOutput = resourceSlotHandle('source-output', 'resource', 'source')
    const transferInput = resourceSlotHandle('transfer-input', 'resource', 'target')
    const transferOutput = resourceSlotHandle('transfer-output', 'resource', 'source')
    const sinkInput = resourceSlotHandle('sink-input', 'resource', 'target')
    const nodes: WorkflowNode[] = [
      workflowNode('source', '烧杯', 'material_source', [sourceOutput]),
      {
        ...workflowNode('transfer', 'beaker_at_s07', 'workflow', [
          transferInput,
          transferOutput
        ]),
        groupKind: 'subworkflow',
        visualKind: 'robot-transfer'
      },
      workflowNode('sink', '投料', 'action', [sinkInput])
    ]
    const links = [
      materialLink('source', sourceOutput, 'transfer', transferInput),
      materialLink('transfer', transferOutput, 'sink', sinkInput)
    ]

    const vertical = layoutWorkflowMaterialSwimlanes(nodes, links, 'vertical')
    const horizontal = layoutWorkflowMaterialSwimlanes(nodes, links, 'horizontal')

    expect(vertical.swimlanes.nodeLayouts.get('transfer')).toMatchObject({
      width: 176,
      height: 72
    })
    expect(handleCenterX(vertical, 'transfer', transferInput.uuid)).toBe(
      vertical.swimlanes.lanes[0]!.axis
    )
    expect(horizontal.swimlanes.nodeLayouts.get('transfer')).toMatchObject({
      width: 120,
      height: 126
    })
    expect(handleCenterY(horizontal, 'transfer', transferOutput.uuid)).toBe(
      horizontal.swimlanes.lanes[0]!.axis
    )
  })
})

/**
 * 计算测试节点中指定物料句柄的绝对横坐标。
 *
 * @param result 物料泳道布局结果。
 * @param nodeId 工作流节点 UUID。
 * @param handleUuid 物料占位符句柄 UUID。
 * @returns 与渲染器尺寸常量一致的绝对句柄中心横坐标。
 */
function handleCenterX(
  result: ReturnType<typeof layoutWorkflowMaterialSwimlanes>,
  nodeId: string,
  handleUuid: string
): number {
  const node = result.nodes.find((candidate) => candidate.id === nodeId)
  const laneIndex = result.swimlanes.handleLaneIndexes
    .get(nodeId)?.get(handleUuid)
  if (!node || laneIndex === undefined) throw new Error('测试物料句柄缺少泳道')
  if (node.type === 'material_source') {
    return node.x + WORKFLOW_VERTICAL_MATERIAL_SOURCE_HANDLE_AXIS
  }
  if (node.visualKind === 'robot-transfer') {
    return node.x + WORKFLOW_VERTICAL_TRANSFER_NODE_HANDLE_AXIS
  }
  const layout = result.swimlanes.nodeLayouts.get(nodeId)
  if (!layout) throw new Error('测试动作节点缺少泳道尺寸')
  return node.x + WORKFLOW_MATERIAL_ACTION_FIRST_HANDLE_X +
    (laneIndex - layout.startLane) * WORKFLOW_MATERIAL_LANE_GAP
}

/**
 * 计算横向测试节点中指定物料句柄的绝对纵坐标。
 *
 * @param result 横向物料泳道布局结果。
 * @param nodeId 工作流节点 UUID。
 * @param handleUuid 物料占位符句柄 UUID。
 * @returns 与横向渲染器尺寸常量一致的绝对句柄中心纵坐标。
 */
function handleCenterY(
  result: ReturnType<typeof layoutWorkflowMaterialSwimlanes>,
  nodeId: string,
  handleUuid: string
): number {
  const node = result.nodes.find((candidate) => candidate.id === nodeId)
  const laneIndex = result.swimlanes.handleLaneIndexes
    .get(nodeId)?.get(handleUuid)
  if (!node || laneIndex === undefined) throw new Error('测试物料句柄缺少泳道')
  if (node.type === 'material_source') {
    return node.y + WORKFLOW_HORIZONTAL_MATERIAL_SOURCE_HANDLE_AXIS
  }
  if (node.visualKind === 'robot-transfer') {
    return node.y + WORKFLOW_HORIZONTAL_TRANSFER_NODE_HANDLE_AXIS
  }
  const layout = result.swimlanes.nodeLayouts.get(nodeId)
  if (!layout) throw new Error('测试动作节点缺少泳道尺寸')
  return node.y + WORKFLOW_MATERIAL_ACTION_FIRST_HANDLE_Y +
    (laneIndex - layout.startLane) * WORKFLOW_MATERIAL_LANE_GAP
}

/** 创建物料泳道测试所需的最小工作流节点。 */
function workflowNode(
  id: string,
  name: string,
  type: string,
  handles: WorkflowHandlePort[]
): WorkflowNode {
  return { id, name, type, className: type, labNodeType: type, handles }
}

/** 创建有类型物料占位符（ResourceSlot）句柄。 */
function resourceSlotHandle(
  uuid: string,
  dataKey: string,
  ioType: 'source' | 'target'
): WorkflowHandlePort {
  return {
    uuid,
    handleKey: dataKey,
    displayName: dataKey,
    ioType,
    valueType: 'ResourceSlot',
    valueSchema: { $slot: 'ResourceSlot' },
    dataKey,
    editorControl: 'material_port',
    allowedResourceTemplateUuids: null,
    implicitPassthrough: ioType === 'source'
  }
}

/** 创建连接两个物料占位符句柄的工作流边。 */
function materialLink(
  source: string,
  sourceHandle: WorkflowHandlePort,
  target: string,
  targetHandle: WorkflowHandlePort
): WorkflowLink {
  return {
    source,
    target,
    type: 'material',
    sourceHandleUuid: sourceHandle.uuid,
    targetHandleUuid: targetHandle.uuid
  }
}
