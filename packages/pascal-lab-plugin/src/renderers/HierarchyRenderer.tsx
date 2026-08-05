import { useRegistry } from '@pascal-app/core'
import { NodeRenderer } from '@pascal-app/viewer'
import { useThree } from '@react-three/fiber'
import { useCallback, useEffect, useRef } from 'react'
import {
  Box3,
  type Group,
  type Object3D,
  Vector3
} from 'three'

import { MODEL_READY_EVENT } from './LabDeviceRenderer'
import MaterialTransferLayerRenderer from './MaterialTransferLayerRenderer'
import type { LabMaterialTransferLayerNode } from '../schema'

interface HierarchyNode {
  id: string
  type: string
  visible?: boolean
  children?: readonly string[]
  position?: readonly [number, number, number]
  rotation?: number | readonly [number, number, number]
  fitSceneRevision?: number
  materialTransferLayer?: LabMaterialTransferLayerNode | null
}

interface AdaptiveCameraControls {
  fitToBox?: (
    boxOrObject: Box3 | Object3D,
    smooth: boolean,
    options?: {
      paddingLeft?: number
      paddingRight?: number
      paddingTop?: number
      paddingBottom?: number
    }
  ) => Promise<void> | void
}

export default function HierarchyRenderer({
  node
}: {
  node: HierarchyNode
}): React.JSX.Element {
  const groupRef = useRef<Group>(null!)
  const fitSceneRevisionRef = useRef(node.fitSceneRevision)
  const controls = useThree(
    (state) => state.controls
  ) as AdaptiveCameraControls | null
  const viewportWidth = useThree((state) => state.size.width)
  const viewportHeight = useThree((state) => state.size.height)
  const invalidate = useThree((state) => state.invalidate)
  useRegistry(node.id, node.type, groupRef)

  const rotation =
    typeof node.rotation === 'number'
      ? ([0, node.rotation, 0] as const)
      : node.rotation

  const fitScene = useCallback(
    (smooth: boolean): void => {
      if (
        node.type !== 'site' ||
        !controls?.fitToBox ||
        viewportWidth <= 0 ||
        viewportHeight <= 0
      ) {
        return
      }
      const fitToBox = controls.fitToBox.bind(controls)
      const root = groupRef.current
      root.updateWorldMatrix(true, true)
      const bounds = new Box3().setFromObject(root)
      if (bounds.isEmpty()) return

      const size = bounds.getSize(new Vector3())
      const padding = Math.max(size.x, size.y, size.z) * 0.06
      const fit = async (): Promise<void> => {
        await fitToBox(bounds, smooth, {
          paddingLeft: padding,
          paddingRight: padding,
          paddingTop: padding,
          paddingBottom: padding
        })
        invalidate()
      }
      void fit()
    },
    [
      controls,
      invalidate,
      node.type,
      viewportHeight,
      viewportWidth
    ]
  )

  useEffect(() => {
    if (node.type !== 'site') return
    const timer = window.setTimeout(() => fitScene(false), 0)
    return () => window.clearTimeout(timer)
  }, [
    fitScene,
    node.type,
    viewportHeight,
    viewportWidth
  ])

  useEffect(() => {
    if (node.type !== 'site') return
    const previousRevision = fitSceneRevisionRef.current
    fitSceneRevisionRef.current = node.fitSceneRevision
    if (previousRevision === node.fitSceneRevision) return
    const timer = window.setTimeout(
      () => fitScene(true),
      0
    )
    return () => window.clearTimeout(timer)
  }, [fitScene, node.fitSceneRevision, node.type])

  useEffect(() => {
    if (node.type !== 'site') return
    let timer: number | undefined
    const handleModelReady = (): void => {
      if (timer != null) window.clearTimeout(timer)
      timer = window.setTimeout(() => fitScene(false), 0)
    }
    window.addEventListener(MODEL_READY_EVENT, handleModelReady)
    return () => {
      if (timer != null) window.clearTimeout(timer)
      window.removeEventListener(MODEL_READY_EVENT, handleModelReady)
    }
  }, [fitScene, node.type])

  return (
    <group
      ref={groupRef}
      name={node.id}
      position={node.position}
      rotation={rotation}
      visible={node.visible !== false}
    >
      {node.children?.map((childId) => (
        <NodeRenderer key={`${node.id}:${childId}`} nodeId={childId as never} />
      ))}
      {node.materialTransferLayer && (
        <MaterialTransferLayerRenderer node={node.materialTransferLayer} />
      )}
    </group>
  )
}
