import {
  MaterialCapabilityNotice,
  useMaterialStore,
  useMaterialStoreApi
} from '@unilab/material'
import {
  PascalLabWorkbench,
  type MaterialSceneMove
} from '@unilab/pascal-lab-plugin'
import { useEffect, useMemo } from 'react'

import { useWorkbench } from '../../context/WorkbenchContext'
import { useLabInteraction } from './LabInteractionProvider'
import { useMaterialRuntime } from './MaterialRuntimeProvider'

export function SceneWorkbench(): React.JSX.Element {
  const { backend } = useWorkbench()
  const runtime = useMaterialRuntime()
  const store = useMaterialStoreApi()
  const aggregatesById = useMaterialStore(
    (state) => state.aggregatesById
  )
  const loadState = useMaterialStore((state) => state.loadState)
  const selectedMaterialIds = useLabInteraction(
    (state) => state.selectedMaterialIds
  )
  const highlightedMaterialIds = useLabInteraction(
    (state) => state.highlightedMaterialIds
  )
  const selectMaterials = useLabInteraction(
    (state) => state.selectMaterials
  )
  const selectSceneObjects = useLabInteraction(
    (state) => state.selectSceneObjects
  )
  const aggregates = useMemo(
    () => Object.values(aggregatesById),
    [aggregatesById]
  )
  const modelRuntime = useMemo(
    () => ({
      resolveUrl: (model: { path: string }) => {
        if (!model.path || /^https?:\/\//.test(model.path)) {
          return model.path
        }
        const base = backend.assetUrl || backend.apiUrl
        return new URL(model.path, `${base.replace(/\/+$/, '')}/`).toString()
      }
    }),
    [backend.apiUrl, backend.assetUrl]
  )
  const readStatus = runtime.getStatus('material.readGraph')
  const moveStatus = runtime.getStatus('material.move')

  useEffect(() => {
    if (!readStatus.available || loadState !== 'idle') return
    void store.getState().loadGraph()
  }, [loadState, readStatus.available, store])

  if (!readStatus.available) {
    return (
      <div className="material-scene-unavailable">
        <MaterialCapabilityNotice
          title="3D Material Scene 不可用"
          status={readStatus}
        />
      </div>
    )
  }

  if (loadState === 'idle' || loadState === 'loading') {
    return <div className="app-loading">正在加载 3D 物料场景…</div>
  }

  const applyMoves = async (
    moves: readonly MaterialSceneMove[]
  ): Promise<void> => {
    for (const move of moves) {
      await store.getState().move(move.materialId, move.placement)
    }
  }
  const scopeKey =
    runtime.scope?.kind === 'laboratory'
      ? runtime.scope.laboratoryId
      : 'singleton'

  return (
    <PascalLabWorkbench
      aggregates={aggregates}
      projectId={`unilab-${backend.id}-${scopeKey}`}
      editable={moveStatus.available}
      selectedMaterialIds={selectedMaterialIds}
      highlightedMaterialIds={highlightedMaterialIds}
      modelRuntime={modelRuntime}
      onMaterialMoves={(moves) => {
        void applyMoves(moves)
      }}
      onSelectionChange={(materialIds, sceneObjectIds) => {
        selectMaterials(materialIds)
        selectSceneObjects(sceneObjectIds)
      }}
    />
  )
}
