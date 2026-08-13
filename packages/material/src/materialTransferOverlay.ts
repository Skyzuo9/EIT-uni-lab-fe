import type { MaterialId } from './types'

export type MaterialTransferOverlayStatus =
  | 'planned'
  | 'pending'
  | 'running'
  | 'canceling'
  | 'succeeded'
  | 'failed'
  | 'canceled'
  | 'attention'

/**
 * 已解析到规范物料身份和实验室世界坐标的只读转运路线。
 * 2D 使用仓库节点身份，2.5D 使用同一端点的精确世界坐标。
 */
export interface MaterialTransferOverlayRoute {
  id: string
  label: string
  sourceMaterialId: MaterialId
  targetMaterialId: MaterialId
  sourceLabel: string
  targetLabel: string
  status: MaterialTransferOverlayStatus
  accent: string
  pointsMm: readonly (readonly [number, number, number])[]
}
