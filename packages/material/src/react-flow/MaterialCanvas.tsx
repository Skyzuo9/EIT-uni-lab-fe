import { useEffect, useMemo, useRef, useState } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  type Node,
  type OnSelectionChangeFunc,
  type ReactFlowInstance
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
  floorplanOverlay?: boolean
  physicalLayout?: boolean
  selectedMaterialIds?: readonly MaterialId[]
  highlightedMaterialIds?: readonly MaterialId[]
  onSelectionChange?: (materialIds: readonly MaterialId[]) => void
}

export function MaterialCanvas({
  readStatus,
  moveStatus,
  floorplanOverlay = false,
  physicalLayout,
  selectedMaterialIds = [],
  highlightedMaterialIds = [],
  onSelectionChange
}: MaterialCanvasProps): React.JSX.Element {
  const [isEditing, setIsEditing] = useState(false)
  const canvasRef = useRef<HTMLElement>(null)
  const flowInstanceRef = useRef<ReactFlowInstance<
    MaterialFlowNode['data']
  > | null>(null)
  const store = useMaterialStoreApi()
  const aggregatesById = useMaterialStore(
    (state) => state.aggregatesById
  )
  const dragPreviewByMaterialId = useMaterialStore(
    (state) => state.dragPreviewByMaterialId
  )
  const loadState = useMaterialStore((state) => state.loadState)
  const error = useMaterialStore((state) => state.error)
  const canDrag = moveStatus.available && isEditing

  useEffect(() => {
    if (!moveStatus.available) setIsEditing(false)
  }, [moveStatus.available])

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
        draggable: canDrag,
        physicalLayout: physicalLayout ?? !moveStatus.available
      }),
    [
      aggregatesById,
      canDrag,
      dragPreviewByMaterialId,
      highlightedMaterialIds,
      physicalLayout,
      selectedMaterialIds
    ]
  )
  const nodeSetKey = nodes.map((node) => node.id).sort().join('|')

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || loadState !== 'ready') return
    let frame = 0
    const fitVisibleViewport = (): void => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        if (canvas.clientWidth <= 0 || canvas.clientHeight <= 0) return
        void flowInstanceRef.current?.fitView({ padding: 0.12 })
      })
    }
    const observer = new ResizeObserver(fitVisibleViewport)
    observer.observe(canvas)
    fitVisibleViewport()
    return () => {
      observer.disconnect()
      window.cancelAnimationFrame(frame)
    }
  }, [loadState, nodeSetKey])

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
    <section
      ref={canvasRef}
      className={`material-canvas${
        floorplanOverlay ? ' is-floorplan-overlay' : ''
      }`}
    >
      {error ? <div className="material__error">{error}</div> : null}
      <div
        className="material-canvas__edit-control"
        data-move-available={moveStatus.available}
      >
        <button
          type="button"
          aria-pressed={isEditing}
          disabled={!moveStatus.available}
          onClick={() => setIsEditing((current) => !current)}
          title={
            moveStatus.available
              ? isEditing
                ? '退出物料位置编辑'
                : '进入物料位置编辑'
              : moveStatus.reason
          }
        >
          {isEditing ? '完成移动' : '移动物料'}
        </button>
        {!moveStatus.available ? (
          <span>{moveStatus.reason ?? '当前服务仅提供只读物料图'}</span>
        ) : null}
      </div>
      <ReactFlow
        nodes={nodes}
        edges={[]}
        nodeTypes={NODE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        minZoom={0.15}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        nodesConnectable={false}
        onInit={(instance) => {
          flowInstanceRef.current = instance
        }}
        onNodeDrag={(_, node) => {
          if (!canDrag) return
          const placement = flowPositionToPlacement({
            materialId: node.id,
            flowPosition: node.position,
            aggregatesById
          })
          const pose = placementPose(placement)
          if (pose) store.getState().setDragPreview(node.id, pose)
        }}
        onNodeDragStop={(_, node) => {
          if (!canDrag) {
            store.getState().clearDragPreview(node.id)
            return
          }
          const placement = flowPositionToPlacement({
            materialId: node.id,
            flowPosition: node.position,
            aggregatesById
          })
          void store.getState().move(node.id, placement).catch(() => {
            // The store owns the actionable error and preview rollback.
          })
        }}
        onSelectionChange={
          ((selection) =>
            onSelectionChange?.(
              selection.nodes.map((node: Node) => node.id)
            )) as OnSelectionChangeFunc
        }
      >
        {!floorplanOverlay && <Background gap={24} size={1} />}
        {!floorplanOverlay && <MiniMap pannable zoomable />}
        {!floorplanOverlay && <Controls />}
      </ReactFlow>
    </section>
  )
}
