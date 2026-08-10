import { describe, expect, it } from 'vitest'

import type {
  WorkflowHandlePort,
  WorkflowLink,
  WorkflowNode
} from './parseWorkflow'
import {
  layoutWorkflowPrimarySampleFlow,
  WORKFLOW_PRIMARY_SAMPLE_NODES_PER_ROW
} from './workflowPrimarySampleLayout'

describe('layoutWorkflowPrimarySampleFlow', () => {
  /** 验证主样品路径优先于声明顺序，并在第四个节点后反向换行。 */
  it('uses the primary sample as a serpentine backbone', () => {
    const reagentOutput = resourceSlotHandle(
      'reagent-output',
      'reagent',
      'source'
    )
    const primaryOutput = resourceSlotHandle(
      'primary-output',
      'sample',
      'source'
    )
    const actionNodes = Array.from({ length: 6 }, (_, index) =>
      sampleAction(`step-${index + 1}`, index < 5)
    )
    actionNodes[2]!.handles?.push(resourceSlotHandle(
      'step-3-reagent-input',
      'reagent',
      'target'
    ))
    const nodes: WorkflowNode[] = [
      materialSource('reagent-source', '试剂', 'reagent', reagentOutput),
      materialSource(
        'primary-source',
        '主样品',
        'primary_sample',
        primaryOutput
      ),
      ...actionNodes
    ]
    const links: WorkflowLink[] = [
      materialLink(
        'primary-source',
        primaryOutput.uuid,
        'step-1',
        'step-1-input'
      ),
      ...Array.from({ length: 5 }, (_, index) => materialLink(
        `step-${index + 1}`,
        `step-${index + 1}-output`,
        `step-${index + 2}`,
        `step-${index + 2}-input`
      )),
      materialLink(
        'reagent-source',
        reagentOutput.uuid,
        'step-3',
        'step-3-reagent-input'
      )
    ]

    const result = layoutWorkflowPrimarySampleFlow(nodes, links)
    const positions = new Map(
      result.nodes.map((node) => [node.id, { x: node.x, y: node.y }])
    )
    const backbone = result.primarySample?.backboneNodeIds ?? []

    expect(result.primarySample?.hasPrimarySample).toBe(true)
    expect(backbone).toEqual([
      'primary-source',
      'step-1',
      'step-2',
      'step-3',
      'step-4',
      'step-5',
      'step-6'
    ])
    expect(WORKFLOW_PRIMARY_SAMPLE_NODES_PER_ROW).toBe(4)
    expect(positions.get('primary-source')?.x)
      .toBeLessThan(positions.get('step-1')?.x ?? 0)
    expect(positions.get('step-1')?.x)
      .toBeLessThan(positions.get('step-2')?.x ?? 0)
    expect(positions.get('step-3')?.x).toBe(
      positions.get('step-4')?.x
    )
    expect(positions.get('step-4')?.x)
      .toBeGreaterThan(positions.get('step-5')?.x ?? 0)
    expect(positions.get('step-3')?.y)
      .toBeLessThan(positions.get('step-4')?.y ?? 0)
    expect(result.nodePorts?.get('step-3')).toMatchObject({
      source: 'bottom'
    })
    expect(result.nodePorts?.get('step-4')).toMatchObject({
      target: 'top',
      source: 'left'
    })
    expect(result.edgeDirections?.get(2)).toBe('LR')
    expect(result.edgeDirections?.get(3)).toBe('TB')
    expect(backbone).not.toContain('reagent-source')
    expect(positions.get('reagent-source')?.y)
      .toBeGreaterThan(positions.get('step-3')?.y ?? 0)
  })
})

/**
 * 创建声明物料流角色（MaterialFlowRole）的物料来源（MaterialSource）。
 *
 * @param id 节点稳定身份。
 * @param name 中文优先展示名称。
 * @param flowRole 物料流角色 wire 值。
 * @param output 物料占位符（ResourceSlot）输出句柄。
 * @returns 可供布局测试使用的最小物料来源节点。
 */
function materialSource(
  id: string,
  name: string,
  flowRole: string,
  output: WorkflowHandlePort
): WorkflowNode {
  return {
    id,
    name,
    type: 'material_source',
    className: 'MaterialSource',
    labNodeType: 'MaterialSource',
    handles: [output],
    materialSource: {
      mode: 'existing',
      flowRole,
      mountUuid: 'mount-1',
      resourceTemplateUuid: 'template-1'
    }
  }
}

/**
 * 创建透传主样品物料占位符（ResourceSlot）的操作节点。
 *
 * @param id 节点稳定身份。
 * @param hasOutput 是否仍向下游输出同一主样品身份。
 * @returns 带同字段输入、可选输出句柄的操作节点。
 */
function sampleAction(id: string, hasOutput: boolean): WorkflowNode {
  return {
    id,
    name: id,
    type: 'action',
    className: 'Action',
    labNodeType: 'Action',
    handles: [
      resourceSlotHandle(`${id}-input`, 'sample', 'target'),
      ...(hasOutput
        ? [resourceSlotHandle(`${id}-output`, 'sample', 'source')]
        : [])
    ]
  }
}

/**
 * 创建有类型物料占位符（ResourceSlot）句柄。
 *
 * @param uuid 句柄稳定身份。
 * @param dataKey 动作参数或结果字段名。
 * @param ioType 输入或输出方向。
 * @returns 最小可追踪物料句柄。
 */
function resourceSlotHandle(
  uuid: string,
  dataKey: string,
  ioType: 'source' | 'target'
): WorkflowHandlePort {
  return {
    uuid,
    handleKey: dataKey,
    displayName: dataKey,
    dataKey,
    ioType,
    valueType: 'ResourceSlot',
    valueSchema: { $slot: 'ResourceSlot' }
  }
}

/**
 * 创建物料占位符（ResourceSlot）之间的工作流边。
 *
 * @param source 来源节点 UUID。
 * @param sourceHandleUuid 来源输出句柄 UUID。
 * @param target 目标节点 UUID。
 * @param targetHandleUuid 目标输入句柄 UUID。
 * @returns 可供物料追踪与布局使用的工作流边。
 */
function materialLink(
  source: string,
  sourceHandleUuid: string,
  target: string,
  targetHandleUuid: string
): WorkflowLink {
  return {
    source,
    sourceHandleUuid,
    target,
    targetHandleUuid,
    type: 'control'
  }
}
