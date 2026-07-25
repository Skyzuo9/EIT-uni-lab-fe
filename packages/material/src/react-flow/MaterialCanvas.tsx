import { useEffect, useMemo } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  type Node,
  type OnSelectionChangeFunc
} from 'reactflow'
import 'reactflow/dist/style.css'

import type { CapabilityStatus } from '../MaterialCapabilityNotice'
import { MaterialCapabilityNotice } from '../MaterialCapabilityNotice'
import {
  useMaterialStore,
  useMaterialStoreApi
} from '../MaterialStoreProvider'
import type { MaterialId } from '../types'
import { MaterialNode } from './MaterialNode'
import {
  flowPositionToPlacement,
  placementPose,
  projectMaterialFlowNodes,
  type MaterialFlowNode
} from './projection'

const NODE_TYPES = {
  material: MaterialNode
}

export interface MaterialCanvasProps {
  readStatus: CapabilityStatus
  moveStatus: CapabilityStatus
  selectedMaterialIds?: readonly MaterialId[]
  highlightedMaterialIds?: readonly MaterialId[]
  onSelectionChange?: (materialIds: readonly MaterialId[]) => void
}

export function MaterialCanvas({
  readStatus,
  moveStatus,
  selectedMaterialIds = [],
  highlightedMaterialIds = [],
  onSelectionChange
}: MaterialCanvasProps): React.JSX.Element {
  const store = useMaterialStoreApi()
  const aggregatesById = useMaterialStore(
    (state) => state.aggregatesById
  )
  const dragPreviewByMaterialId = useMaterialStore(
    (state) => state.dragPreviewByMaterialId
  )
  const loadState = useMaterialStore((state) => state.loadState)
  const error = useMaterialStore((state) => state.error)

  useEffect(() => {
    if (!readStatus.available || loadState !== 'idle') return
    void store.getState().loadGraph()
  }, [loadState, readStatus.available, store])

  const nodes = useMemo(
    () =>
      projectMaterialFlowNodes({
        aggregatesById,
        dragPreviewByMaterialId,
        selectedMaterialIds,
        highlightedMaterialIds,
        draggable: moveStatus.available,
        reviewLayout: !moveStatus.available
      }),
    [
      aggregatesById,
      dragPreviewByMaterialId,
      highlightedMaterialIds,
      moveStatus.available,
      selectedMaterialIds
    ]
  )

  if (!readStatus.available) {
    return (
      <section className="material-canvas is-unavailable">
        <MaterialCapabilityNotice
          title="Material Graph 不可用"
          status={readStatus}
        />
      </section>
    )
  }

  if (loadState === 'loading' || loadState === 'idle') {
    return <section className="material-canvas is-loading">正在加载物料图…</section>
  }

  return (
    <section className="material-canvas">
      {error ? <div className="material__error">{error}</div> : null}
      <ReactFlow
        nodes={nodes}
        edges={[]}
        nodeTypes={NODE_TYPES}
        fitView
        minZoom={0.15}
        maxZoom={2}
        nodesConnectable={false}
        onNodeDrag={(_, node) => {
          const placement = flowPositionToPlacement({
            materialId: node.id,
            flowPosition: node.position,
            aggregatesById
          })
          const pose = placementPose(placement)
          if (pose) store.getState().setDragPreview(node.id, pose)
        }}
        onNodeDragStop={(_, node) => {
          const placement = flowPositionToPlacement({
            materialId: node.id,
            flowPosition: node.position,
            aggregatesById
          })
          store.getState().clearDragPreview(node.id)
          if (moveStatus.available) {
            void store.getState().move(node.id, placement)
          }
        }}
        onSelectionChange={
          ((selection) =>
            onSelectionChange?.(
              selection.nodes.map((node: Node) => node.id)
            )) as OnSelectionChangeFunc
        }
      >
        <Background gap={24} size={1} />
        <MiniMap pannable zoomable />
        <Controls />
      </ReactFlow>
    </section>
  )
}
