import {
  sceneRegistry,
  useRegistry
} from '@pascal-app/core'
import { useNodeEvents, useViewer } from '@pascal-app/viewer'
import { Html } from '@react-three/drei'
import {
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import {
  Box3,
  type Group,
  type Object3D,
  Vector3
} from 'three'

import {
  disposeLabModel,
  loadLabDeviceModel
} from '../modelRuntime'
import { findLinkObject } from '../mounting'
import type { LabDeviceNode } from '../schema'

const MODEL_READY_EVENT = 'unilab:pascal-model-ready'

const useCustomNodeEvents = useNodeEvents as unknown as (
  node: LabDeviceNode,
  type: string
) => ReturnType<typeof useNodeEvents>

function useLabModel(node: LabDeviceNode): {
  object: Object3D | null
  error: string | null
  loading: boolean
} {
  const [object, setObject] = useState<Object3D | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(Boolean(node.model.path))

  useEffect(() => {
    if (!node.model.path) {
      setObject(null)
      setError(null)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    void loadLabDeviceModel(node)
      .then((nextObject) => {
        if (cancelled) {
          disposeLabModel(nextObject)
          return
        }
        setObject(nextObject)
        setLoading(false)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setError(cause instanceof Error ? cause.message : String(cause))
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [
    node.id,
    node.model.format,
    node.model.ossDir,
    node.model.path,
    node.model.version
  ])

  useEffect(() => {
    return () => {
      if (object) disposeLabModel(object)
    }
  }, [object])

  return { object, error, loading }
}

function ModelLabel({
  node,
  object
}: {
  node: LabDeviceNode
  object: Object3D | null
}): React.JSX.Element {
  const height = useMemo(() => {
    if (!object) return node.dimensions[1]
    const size = new Vector3()
    new Box3().setFromObject(object).getSize(size)
    return node.model.format === 'xacro' || node.model.format === 'urdf'
      ? size.z
      : size.y
  }, [node.dimensions, node.model.format, object])

  return (
    <Html position={[0, Math.max(height, 0.2) + 0.08, 0]} center distanceFactor={6}>
      <div className="pascal-model-label">{node.displayName}</div>
    </Html>
  )
}

export default function LabDeviceRenderer({
  node
}: {
  node: LabDeviceNode
}): React.JSX.Element {
  const groupRef = useRef<Group>(null!)
  const originalParentRef = useRef<Object3D | null>(null)
  const [parentModelRevision, setParentModelRevision] = useState(0)
  const { object, error, loading } = useLabModel(node)
  const events = useCustomNodeEvents(node, node.type)
  const isSelected = useViewer((state) =>
    state.selection.selectedIds.includes(node.id as never)
  )
  const isZUp =
    node.model.format === 'xacro' || node.model.format === 'urdf'

  useRegistry(node.id, node.type, groupRef)

  useEffect(() => {
    if (!groupRef.current) return
    originalParentRef.current ??= groupRef.current.parent
  })

  useEffect(() => {
    if (!object) return
    window.dispatchEvent(
      new CustomEvent(MODEL_READY_EVENT, {
        detail: { nodeId: node.id }
      })
    )
  }, [node.id, object])

  useEffect(() => {
    const parentDeviceId = node.attach.parentDeviceId
    if (!parentDeviceId) return

    const handleReady = (event: Event) => {
      const detail = (event as CustomEvent<{ nodeId?: string }>).detail
      if (detail?.nodeId === parentDeviceId) {
        setParentModelRevision((revision) => revision + 1)
      }
    }
    window.addEventListener(MODEL_READY_EVENT, handleReady)
    return () => window.removeEventListener(MODEL_READY_EVENT, handleReady)
  }, [node.attach.parentDeviceId])

  useEffect(() => {
    const group = groupRef.current
    if (!group) return

    const { parentDeviceId, parentLinkName } = node.attach
    if (!parentDeviceId || !parentLinkName) {
      if (originalParentRef.current && group.parent !== originalParentRef.current) {
        originalParentRef.current.attach(group)
      }
      group.position.set(...node.position)
      group.rotation.set(...node.rotation)
      return
    }

    const parentObject = sceneRegistry.nodes.get(parentDeviceId)
    const linkObject = parentObject
      ? findLinkObject(parentObject, parentLinkName)
      : null
    if (!linkObject) return

    if (group.parent !== linkObject) linkObject.add(group)
    group.position.set(...node.position)
    group.rotation.set(...node.rotation)
  }, [
    node.attach.parentDeviceId,
    node.attach.parentLinkName,
    node.position,
    node.rotation,
    parentModelRevision
  ])

  return (
    <group
      ref={groupRef}
      name={node.id}
      position={node.position}
      rotation={node.rotation}
      scale={node.scale}
      visible={node.visible !== false}
      {...events}
    >
      {!object && (
        <mesh
          position={[0, node.dimensions[1] / 2, 0]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={node.dimensions} />
          <meshStandardMaterial
            color={error ? '#ef4444' : isSelected ? '#4dabf7' : '#94a3b8'}
            metalness={0.12}
            opacity={loading ? 0.45 : 0.82}
            roughness={0.68}
            transparent
          />
        </mesh>
      )}
      {object && (
        <group rotation={isZUp ? [-Math.PI / 2, 0, 0] : undefined}>
          <primitive object={object} />
        </group>
      )}
      <ModelLabel node={node} object={object} />
      {error && (
        <Html position={[0, 0.1, 0]} center distanceFactor={6}>
          <div className="pascal-model-label" title={error}>
            模型加载失败，已使用占位体
          </div>
        </Html>
      )}
    </group>
  )
}
