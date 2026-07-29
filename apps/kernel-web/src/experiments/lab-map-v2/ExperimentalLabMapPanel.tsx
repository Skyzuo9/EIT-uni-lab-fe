import {
  MaterialCapabilityNotice,
  useMaterialStore,
  useMaterialStoreApi
} from '@unilab/material'
import {
  DEMO_LAB_MAP_V2,
  LabMapV2Canvas
} from '@unilab/material/experiments/lab-map-v2'
import {
  useEffect,
  useMemo
} from 'react'
import { useStore } from 'zustand'

import {
  useLabInteractionStore
} from '../../integrations/lab-workbench/LabInteractionProvider'
import {
  useMaterialRuntime
} from '../../integrations/lab-workbench/MaterialRuntimeProvider'
import {
  useLabMapDraftEquipment
} from './useLabMapDraftEquipment'

export default function ExperimentalLabMapPanel(): React.JSX.Element {
  const runtime = useMaterialRuntime()
  if (!runtime.store || !runtime.scope) {
    return (
      <MaterialCapabilityNotice
        title="实验室地图不可用"
        status={{
          available: false,
          reason: '当前服务配置使用实验室范围，请先选择实验室'
        }}
      />
    )
  }
  const readStatus = runtime.getStatus('material.readGraph')
  if (!readStatus.available) {
    return (
      <MaterialCapabilityNotice
        title="实验室地图不可用"
        status={readStatus}
      />
    )
  }
  return <LoadedExperimentalLabMap />
}

function LoadedExperimentalLabMap(): React.JSX.Element {
  const store = useMaterialStoreApi()
  const aggregatesById = useMaterialStore(
    (state) => state.aggregatesById
  )
  const loadState = useMaterialStore((state) => state.loadState)
  const error = useMaterialStore((state) => state.error)
  const interaction = useLabInteractionStore()
  const selectedMaterialIds = useStore(
    interaction,
    (state) => state.selectedMaterialIds
  )
  const highlightedMaterialIds = useStore(
    interaction,
    (state) => state.highlightedMaterialIds
  )
  const aggregates = useMemo(
    () => Object.values(aggregatesById),
    [aggregatesById]
  )
  const [draftEquipment, setDraftEquipment] =
    useLabMapDraftEquipment(DEMO_LAB_MAP_V2.id)

  useEffect(() => {
    if (loadState !== 'idle') return
    void store.getState().loadGraph().catch(() => {
      // The Material store exposes the actionable error to the panel.
    })
  }, [loadState, store])

  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-1">
      <LabMapV2Canvas
        map={DEMO_LAB_MAP_V2}
        aggregates={aggregates}
        selectedMaterialIds={selectedMaterialIds}
        highlightedMaterialIds={highlightedMaterialIds}
        draftEquipment={draftEquipment}
        onDraftEquipmentChange={setDraftEquipment}
        onSelectionChange={(materialIds) => {
          interaction.getState().selectMaterials(materialIds)
        }}
      />
      {loadState === 'loading' ? (
        <div
          className="pointer-events-none absolute inset-x-0 top-12 z-30 flex justify-center p-3"
          role="status"
        >
          <span className="rounded-full border border-[#bfdbfe] bg-white/95 px-3 py-1.5 text-[11px] font-medium text-[#1d4ed8] shadow-sm">
            正在读取当前 Material Graph…
          </span>
        </div>
      ) : null}
      {loadState === 'error' ? (
        <div
          className="absolute inset-x-4 bottom-10 z-30 rounded-lg border border-[#fecaca] bg-[#fff7f7] px-3 py-2 text-xs text-[#b91c1c] shadow-sm"
          role="alert"
        >
          {error ?? 'Material Graph 读取失败'}
        </div>
      ) : null}
    </div>
  )
}
