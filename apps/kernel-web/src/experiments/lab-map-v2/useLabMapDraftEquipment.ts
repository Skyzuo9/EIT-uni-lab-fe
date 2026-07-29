import {
  readLabMapDraftEquipment,
  type LabMapDraftEquipment
} from '@unilab/material/experiments/lab-map-v2'
import {
  useEffect,
  useState
} from 'react'

export function useLabMapDraftEquipment(
  mapId: string
): readonly [
  readonly LabMapDraftEquipment[],
  (equipment: readonly LabMapDraftEquipment[]) => void
] {
  const storageKey = `unilab.lab-map-v2.${mapId}.draft-equipment.v1`
  const [equipment, setEquipment] = useState<
    readonly LabMapDraftEquipment[]
  >(() => loadDraftEquipment(storageKey))

  useEffect(() => {
    globalThis.localStorage?.setItem(
      storageKey,
      JSON.stringify(equipment)
    )
  }, [equipment, storageKey])

  return [equipment, setEquipment] as const
}

function loadDraftEquipment(
  storageKey: string
): LabMapDraftEquipment[] {
  const value = globalThis.localStorage?.getItem(storageKey)
  if (!value) return []
  try {
    return readLabMapDraftEquipment(JSON.parse(value))
  } catch {
    return []
  }
}
