export type WorkflowDagLayoutStrategy =
  | 'crossing-minimized'
  | 'material-swimlanes'

export interface WorkflowDagLayoutStrategyOption {
  value: WorkflowDagLayoutStrategy
  label: string
  description: string
}

export const DEFAULT_WORKFLOW_DAG_LAYOUT_STRATEGY:
  WorkflowDagLayoutStrategy = 'crossing-minimized'

export const WORKFLOW_DAG_LAYOUT_STRATEGIES:
  readonly WorkflowDagLayoutStrategyOption[] = [
  {
    value: 'crossing-minimized',
    label: '减少交叉',
    description: '综合执行顺序与物料流，尽量减少全图连线交叉'
  },
  {
    value: 'material-swimlanes',
    label: '物料泳道',
    description: '固定每种物料的左右泳道，使同一物料的连线保持竖直'
  }
]

/**
 * 返回布局策略的中文展示名称。
 *
 * @param strategy 画布正在使用的布局策略标识。
 * @returns 面向用户的简短中文名称。
 */
export function workflowDagLayoutStrategyLabel(
  strategy: WorkflowDagLayoutStrategy
): string {
  return WORKFLOW_DAG_LAYOUT_STRATEGIES.find(
    (option) => option.value === strategy
  )?.label ?? '减少交叉'
}
