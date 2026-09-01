import { sceneRegistry, useRegistry } from '@pascal-app/core'
import { NodeRenderer } from '@pascal-app/viewer'
import { useThree } from '@react-three/fiber'
import { useCallback, useEffect, useRef } from 'react'
import {
  Box3,
  type Group,
  Vector3
} from 'three'

import { MODEL_READY_EVENT } from './LabDeviceRenderer'
import MaterialTransferLayerRenderer from './MaterialTransferLayerRenderer'
import type { LabMaterialTransferLayerNode } from '../schema'
import {
  applySceneCameraRequest,
  frameSceneCaptureCamera,
  insetSceneBounds,
  outsetSceneBounds,
  PASCAL_CAPTURE_FIT_EVENT,
  type SceneCameraControls,
  type SceneCameraView
} from '../sceneCameraRequest'

interface HierarchyNode {
  id: string
  type: string
  visible?: boolean
  children?: readonly string[]
  position?: readonly [number, number, number]
  rotation?: number | readonly [number, number, number]
  fitSceneRevision?: number
  fitSceneView?: SceneCameraView
  fitSceneObjectIds?: readonly string[]
  materialTransferLayer?: LabMaterialTransferLayerNode | null
}

type AdaptiveCameraControls = Partial<SceneCameraControls>

export default function HierarchyRenderer({
  node
}: {
  node: HierarchyNode
}): React.JSX.Element {
  const groupRef = useRef<Group>(null!)
  const fitSceneRevisionRef = useRef(node.fitSceneRevision)
  const hasAppliedInitialFitRef = useRef(false)
  const controls = useThree(
    (state) => state.controls
  ) as AdaptiveCameraControls | null
  const viewportWidth = useThree((state) => state.size.width)
  const viewportHeight = useThree((state) => state.size.height)
  const invalidate = useThree((state) => state.invalidate)
  const camera = useThree((state) => state.camera)
  useRegistry(node.id, node.type, groupRef)

  const rotation =
    typeof node.rotation === 'number'
      ? ([0, node.rotation, 0] as const)
      : node.rotation

  const fitScene = useCallback(
    (smooth: boolean, view: SceneCameraView = 'default'): void => {
      if (
        node.type !== 'site' ||
        !controls?.fitToBox ||
        !controls.rotateAzimuthTo ||
        !controls.rotatePolarTo ||
        viewportWidth <= 0 ||
        viewportHeight <= 0
      ) {
        return
      }
      const fitToBox = controls.fitToBox.bind(controls)
      const rotateAzimuthTo = controls.rotateAzimuthTo.bind(controls)
      const rotatePolarTo = controls.rotatePolarTo.bind(controls)
      const root = groupRef.current
      root.updateWorldMatrix(true, true)
      const focusObjects = (node.fitSceneObjectIds ?? [])
        .map((id) => sceneRegistry.nodes.get(id))
        .filter((object): object is Group => object != null)
      if ((node.fitSceneObjectIds?.length ?? 0) > 0 && focusObjects.length === 0) {
        return
      }
      const bounds = new Box3()
      if (focusObjects.length > 0) {
        for (const object of focusObjects) bounds.expandByObject(object)
      } else {
        bounds.setFromObject(root)
      }
      if (bounds.isEmpty()) return

      const focusedBounds = focusObjects.length > 0
        ? outsetSceneBounds(bounds, 0.18)
        : insetSceneBounds(bounds, 0.16)
      const size = focusedBounds.getSize(new Vector3())
      const padding = Math.max(size.x, size.y, size.z) * 0.012
      const fit = async (): Promise<void> => {
        await applySceneCameraRequest({
          bounds: focusedBounds,
          controls: {
            fitToBox,
            rotateAzimuthTo,
            rotatePolarTo
          },
          padding,
          smooth,
          view:
            view === 'default' && focusObjects.length > 0
              ? 'kinematics'
              : view
        })
        invalidate()
      }
      void fit()
    },
    [
      controls,
      invalidate,
      node.type,
      node.fitSceneObjectIds,
      viewportHeight,
      viewportWidth
    ]
  )

  useEffect(() => {
    if (
      node.type !== 'site' ||
      hasAppliedInitialFitRef.current ||
      !controls?.fitToBox ||
      !controls.rotateAzimuthTo ||
      !controls.rotatePolarTo ||
      viewportWidth <= 0 ||
      viewportHeight <= 0
    ) {
      return
    }
    hasAppliedInitialFitRef.current = true
    const timer = window.setTimeout(() => fitScene(false), 0)
    return () => window.clearTimeout(timer)
  }, [
    controls,
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
      // 显式相机请求也必须能在无 CVDisplayLink 的 managed renderer 中完成。
      // CameraControls 的平滑过渡依赖逐帧推进；这里采用确定性瞬时适配，
      // 避免正式截图只捕获到尚未移动的背景相机。
      () => fitScene(false, node.fitSceneView),
      0
    )
    return () => window.clearTimeout(timer)
  }, [
    fitScene,
    node.fitSceneRevision,
    node.fitSceneView,
    node.type
  ])

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

  useEffect(() => {
    if (node.type !== 'site') return
    const handleCaptureFit = (event: Event): void => {
      const detail = (event as CustomEvent<{ view?: SceneCameraView }>).detail
      const root = groupRef.current
      root.updateWorldMatrix(true, true)
      const bounds = new Box3().setFromObject(root)
      if (frameSceneCaptureCamera(
        bounds,
        camera,
        detail?.view ?? 'default'
      )) invalidate()
    }
    window.addEventListener(PASCAL_CAPTURE_FIT_EVENT, handleCaptureFit)
    return () => window.removeEventListener(
      PASCAL_CAPTURE_FIT_EVENT,
      handleCaptureFit
    )
  }, [camera, invalidate, node.type])

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
