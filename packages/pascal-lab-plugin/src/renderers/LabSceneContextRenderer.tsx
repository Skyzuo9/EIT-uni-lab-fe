import { useRegistry } from '@pascal-app/core'
import { Html } from '@react-three/drei'
import { useEffect, useRef, useState } from 'react'
import type { Group, Object3D } from 'three'

import {
  disposeLabModel,
  loadLabDeviceModel
} from '../modelRuntime'
import type {
  LabDeviceNode,
  LabSceneContextNode
} from '../schema'
import { PASCAL_SCENE_HTML_Z_INDEX_RANGE } from './htmlLayer'

/** 渲染正式 GLB 的只读背景子树；不注册选择、拖动或 Material 身份。 */
export default function LabSceneContextRenderer({
  node
}: {
  node: LabSceneContextNode
}): React.JSX.Element {
  const groupRef = useRef<Group>(null!)
  const [object, setObject] = useState<Object3D | null>(null)
  const [error, setError] = useState<string | null>(null)
  useRegistry(node.id, node.type, groupRef)

  useEffect(() => {
    let cancelled = false
    setError(null)
    void loadLabDeviceModel(node as unknown as LabDeviceNode).then(
      model => {
        if (cancelled) {
          disposeLabModel(model)
          return
        }
        setObject(model)
      },
      cause => {
        if (cancelled) return
        setError(cause instanceof Error ? cause.message : String(cause))
      }
    )
    return () => {
      cancelled = true
    }
  }, [
    node.id,
    node.model.path,
    node.model.selector?.nodeIndex,
    node.model.selector?.nodePath,
    node.model.selector?.rootTransform
  ])

  useEffect(() => () => {
    if (object) disposeLabModel(object)
  }, [object])

  return (
    <group
      ref={groupRef}
      name={node.id}
      position={node.position}
      rotation={node.rotation}
      scale={node.scale}
      visible={node.visible !== false}
    >
      {object ? (
        <group position={node.model.position} rotation={node.model.rotation}>
          <primitive object={object} />
        </group>
      ) : null}
      {error ? (
        <Html
          position={[0, 0.1, 0]}
          center
          distanceFactor={6}
          zIndexRange={PASCAL_SCENE_HTML_Z_INDEX_RANGE}
          style={{ pointerEvents: 'none' }}
        >
          <div
            className="pascal-model-label pascal-model-label--status"
            data-unilab-scene-context-failure="true"
            data-node-id={node.id}
            title={error}
          >
            静态场景上下文加载失败
          </div>
        </Html>
      ) : null}
    </group>
  )
}
