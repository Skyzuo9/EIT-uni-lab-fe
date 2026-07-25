import {
  DEMO_LAB_MATERIAL_NODES,
  PascalLabWorkbench,
  type LabMaterialNode,
  type MaterialNodeUpdate
} from '@unilab/pascal-lab-plugin'
import { useCallback, useState } from 'react'

import { useWorkbench } from '../../context/WorkbenchContext'
import { useLabInteraction } from './LabInteractionProvider'

const LOCAL_SCENE_KEY = 'unilab.material-scene.v1'

function readLocalScene(): readonly LabMaterialNode[] {
  try {
    const raw = globalThis.localStorage?.getItem(LOCAL_SCENE_KEY)
    if (!raw) return DEMO_LAB_MATERIAL_NODES
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed)
      ? (parsed as LabMaterialNode[])
      : DEMO_LAB_MATERIAL_NODES
  } catch {
    return DEMO_LAB_MATERIAL_NODES
  }
}

function mergeMaterialUpdate(
  node: LabMaterialNode,
  update: MaterialNodeUpdate
): LabMaterialNode {
  return {
    ...node,
    ...update.changes,
    pose: update.changes.pose
      ? {
          ...node.pose,
          ...update.changes.pose,
          extra: {
            ...node.pose?.extra,
            ...update.changes.pose.extra
          }
        }
      : node.pose
  }
}

export function SceneWorkbench(): React.JSX.Element {
  const [materialNodes, setMaterialNodes] =
    useState<readonly LabMaterialNode[]>(readLocalScene)
  const { backend } = useWorkbench()
  const selectMaterials = useLabInteraction(
    (state) => state.selectMaterials
  )
  const selectSceneObjects = useLabInteraction(
    (state) => state.selectSceneObjects
  )

  const handleUpdates = useCallback(
    (updates: readonly MaterialNodeUpdate[]) => {
      setMaterialNodes((current) => {
        const byId = new Map(updates.map((update) => [update.uuid, update]))
        const next = current.map((node) => {
          const update = byId.get(node.uuid)
          return update ? mergeMaterialUpdate(node, update) : node
        })
        globalThis.localStorage?.setItem(
          LOCAL_SCENE_KEY,
          JSON.stringify(next)
        )
        return next
      })
    },
    []
  )

  return (
    <PascalLabWorkbench
      materialNodes={materialNodes}
      projectId={`unilab-${backend.id}-local`}
      onMaterialUpdates={handleUpdates}
      onSelectionChange={(materialIds, sceneObjectIds) => {
        selectMaterials(materialIds)
        selectSceneObjects(sceneObjectIds)
      }}
    />
  )
}
