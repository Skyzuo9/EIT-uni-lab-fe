import type { Node } from 'reactflow'

import type { MaterialId } from '../types'

export interface MaterialFlowNodeData {
  materialId: MaterialId
}

export type MaterialFlowNode = Node<
  MaterialFlowNodeData,
  'material'
>
