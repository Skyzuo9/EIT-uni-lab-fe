import {
  inspectMaterialSceneReadiness,
  MaterialCapabilityNotice,
  UnifiedMaterialViewport,
  useMaterialStore,
  useMaterialStoreApi,
  type MaterialWorkbenchViewportProps
} from '@unilab/material'
import type {
  MaterialSceneMove,
  MaterialTransferSceneRoute
} from '@unilab/pascal-lab-plugin'
import { ensurePascalRendererDefaults } from '@unilab/pascal-host'
import type { WorkflowPanelRuntimeProjection } from '@unilab/workflow-editor'
import * as React from 'react'
import { Suspense, useCallback, useEffect, useMemo } from 'react'

import {
  WorkbenchMaterialSceneState,
  WorkbenchMaterialShapeFallbackNotice
} from './workbench-material-scene-state'

ensurePascalRendererDefaults()

const PascalLabWorkbench = React.lazy(async () => {
  const module = await import('@unilab/pascal-lab-plugin')
  return { default: module.PascalLabWorkbench }
})

/** 在 Workbench 中组合物料图存储与 Pascal 视口。 */
export function WorkbenchMaterialViewport({
  backendUrl,
  runtimeProjection,
  selectedWorkflowNode,
  readStatus,
  moveStatus,
  selectedMaterialIds,
  highlightedMaterialIds,
  onSelectionChange
}: MaterialWorkbenchViewportProps & {
  backendUrl: string
  runtimeProjection: WorkflowPanelRuntimeProjection | null
  selectedWorkflowNode: string | null
}): React.JSX.Element {
  const store = useMaterialStoreApi()
  const aggregatesById = useMaterialStore((state) => state.aggregatesById)
  const shapeLibrary = useMaterialStore((state) => state.shapeLibrary)
  const shapeLibraryState = useMaterialStore(
    (state) => state.shapeLibraryState
  )
  const loadState = useMaterialStore((state) => state.loadState)
  const graphError = useMaterialStore((state) => state.error)
  const aggregates = useMemo(
    () => Object.values(aggregatesById),
    [aggregatesById]
  )
  const materialTransferRoutes = useMemo<MaterialTransferSceneRoute[]>(
    () => (runtimeProjection?.materialTransferRoutes ?? []).map((route) => ({
      ...route,
      selected: route.workflowNodeUuid === selectedWorkflowNode
    })),
    [runtimeProjection, selectedWorkflowNode]
  )
  const sceneReadiness = useMemo(
    () => inspectMaterialSceneReadiness(aggregates),
    [aggregates]
  )
  const modelRuntime = useMemo(() => ({
    /** 把包内相对模型路径解析到当前 OS 地址。 */
    resolveUrl: (model: { path: string }) => {
      if (!model.path || /^https?:\/\//u.test(model.path)) return model.path
      return new URL(
        model.path,
        `${backendUrl.replace(/\/+$/u, '')}/`
      ).toString()
    }
  }), [backendUrl])

  useEffect(() => {
    if (!readStatus.available || loadState !== 'idle') return
    void store.getState().loadGraph()
  }, [loadState, readStatus.available, store])

  /** 依次向 OS 提交物料移动，保留存储端的修订冲突语义。 */
  const applyMoves = useCallback(async (
    moves: readonly MaterialSceneMove[]
  ): Promise<void> => {
    for (const move of moves) {
      await store.getState().move(move.materialId, move.placement)
    }
  }, [store])

  /** 清理失败状态并重新读取当前调度权威的物料图。 */
  const retryGraph = useCallback((): void => {
    store.getState().reset()
    void store.getState().loadGraph()
  }, [store])

  if (!readStatus.available) {
    return <MaterialCapabilityNotice title="物料场景不可用" status={readStatus} />
  }
  if (loadState === 'idle' || loadState === 'loading') {
    return <div className="unilab-workbench-material-loading">正在加载物料场景…</div>
  }
  if (loadState === 'error') {
    return (
      <WorkbenchMaterialSceneState
        kind="error"
        error={graphError}
        onRetry={retryGraph}
      />
    )
  }
  if (sceneReadiness.state === 'empty') {
    return <WorkbenchMaterialSceneState kind="empty" readiness={sceneReadiness} />
  }
  if (sceneReadiness.state === 'list-only') {
    return (
      <WorkbenchMaterialSceneState
        kind="list-only"
        readiness={sceneReadiness}
      />
    )
  }

  return (
    <div className="unilab-workbench-material-scene">
      {shapeLibraryState === 'unavailable' ? (
        <WorkbenchMaterialShapeFallbackNotice />
      ) : null}
      <UnifiedMaterialViewport
        renderView={(viewMode, { showSites, showMaterialTransfers }) => (
          <Suspense
            fallback={(
              <div className="unilab-workbench-material-loading">
                正在加载 {viewMode === '3d' || viewMode === 'split'
                  ? '3D'
                  : viewMode} 物料视图…
              </div>
            )}
          >
            <PascalLabWorkbench
              aggregates={aggregates}
              shapes={shapeLibrary}
              showSites={showSites}
              showMaterialTransfers={showMaterialTransfers}
              materialTransferRoutes={materialTransferRoutes}
              materialTransferProjectionError={null}
              viewMode={viewMode}
              projectId={`unilab-workbench-${new URL(backendUrl).port}`}
              editable={moveStatus.available}
              selectedMaterialIds={selectedMaterialIds}
              highlightedMaterialIds={highlightedMaterialIds}
              modelRuntime={modelRuntime}
              onMaterialMoves={(moves) => void applyMoves(moves)}
              onSelectionChange={(materialIds) => onSelectionChange?.(materialIds)}
            />
          </Suspense>
        )}
      />
    </div>
  )
}
