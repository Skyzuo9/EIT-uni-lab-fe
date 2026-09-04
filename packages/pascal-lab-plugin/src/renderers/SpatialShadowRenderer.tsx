import { useRegistry } from '@pascal-app/core'
import { useEffect, useMemo, useRef } from 'react'
import {
  BoxGeometry,
  EdgesGeometry,
  Matrix4,
  type Group
} from 'three'

import type { LabSpatialShadowNode } from '../schema'
import { polylineStrokeSegments } from './MaterialTransferLayerRenderer'

const BOX_STYLE = {
  environment: { color: '#d97706', opacity: 0.1, renderOrder: 20 },
  corridor: { color: '#ea580c', opacity: 0.2, renderOrder: 30 },
  'robot-link': { color: '#0284c7', opacity: 0.38, renderOrder: 40 },
  tool: { color: '#7c3aed', opacity: 0.5, renderOrder: 50 },
  payload: { color: '#059669', opacity: 0.5, renderOrder: 50 }
} as const

const CAPSULE_STYLE = {
  'robot-link': { color: '#0284c7', opacity: 0.2, renderOrder: 54 },
  tool: { color: '#7c3aed', opacity: 0.28, renderOrder: 55 },
  payload: { color: '#059669', opacity: 0.28, renderOrder: 55 }
} as const

function ShadowBox({
  box
}: {
  box: LabSpatialShadowNode['boxes'][number]
}): React.JSX.Element {
  const matrix = useMemo(() => new Matrix4().set(
    box.matrix[0], box.matrix[1], box.matrix[2], box.matrix[3],
    box.matrix[4], box.matrix[5], box.matrix[6], box.matrix[7],
    box.matrix[8], box.matrix[9], box.matrix[10], box.matrix[11],
    box.matrix[12], box.matrix[13], box.matrix[14], box.matrix[15]
  ), [box.matrix])
  const style = BOX_STYLE[box.role]
  const outlineGeometry = useMemo(() => {
    const surface = new BoxGeometry(...box.size)
    const outline = new EdgesGeometry(surface, 15)
    surface.dispose()
    return outline
  }, [box.size])
  useEffect(() => () => outlineGeometry.dispose(), [outlineGeometry])
  return (
    <group matrix={matrix} matrixAutoUpdate={false} name={box.id}>
      <mesh raycast={() => undefined} renderOrder={style.renderOrder}>
        <boxGeometry args={box.size} />
        <meshStandardMaterial
          color={style.color}
          depthTest={false}
          depthWrite={false}
          opacity={style.opacity}
          transparent
          wireframe={box.role === 'environment' || box.role === 'corridor'}
        />
        <lineSegments
          geometry={outlineGeometry}
          raycast={() => undefined}
          renderOrder={style.renderOrder + 1}
        >
          <lineBasicMaterial
            color={style.color}
            depthTest={false}
            depthWrite={false}
          />
        </lineSegments>
      </mesh>
    </group>
  )
}

function ShadowTrajectory({
  points
}: {
  points: LabSpatialShadowNode['trajectory']
}): React.JSX.Element | null {
  const segments = useMemo(
    () => polylineStrokeSegments(points, true, 0.04, 0.025),
    [points]
  )
  if (segments.length === 0) return null
  return (
    <group name="spatial-shadow-trajectory">
      {segments.map((segment, index) => (
        <mesh
          key={`${index}:${segment.start.join(',')}`}
          position={segment.position}
          quaternion={segment.quaternion}
          raycast={() => undefined}
          renderOrder={60}
        >
          <cylinderGeometry args={[0.006, 0.006, segment.length, 8]} />
          <meshBasicMaterial
            color="#facc15"
            depthTest={false}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  )
}

function ShadowCapsule({
  capsule
}: {
  capsule: LabSpatialShadowNode['l1Capsules'][number]
}): React.JSX.Element | null {
  const segment = useMemo(
    () => polylineStrokeSegments(
      [
        [...capsule.start] as [number, number, number],
        [...capsule.end] as [number, number, number]
      ],
      false
    )[0] ?? null,
    [capsule.end, capsule.start]
  )
  if (!segment) return null
  const style = CAPSULE_STYLE[capsule.role]
  return (
    <group name={capsule.id} raycast={() => undefined}>
      <mesh
        position={segment.position}
        quaternion={segment.quaternion}
        renderOrder={style.renderOrder}
      >
        <cylinderGeometry args={[
          capsule.radius,
          capsule.radius,
          segment.length,
          14
        ]} />
        <meshStandardMaterial
          color={style.color}
          depthWrite={false}
          opacity={style.opacity}
          transparent
        />
      </mesh>
      {[capsule.start, capsule.end].map((position, index) => (
        <mesh
          key={`${capsule.id}:cap:${index}`}
          position={position}
          renderOrder={style.renderOrder}
        >
          <sphereGeometry args={[capsule.radius, 14, 10]} />
          <meshStandardMaterial
            color={style.color}
            depthWrite={false}
            opacity={style.opacity}
            transparent
          />
        </mesh>
      ))}
    </group>
  )
}

/** 在 Pascal 原生场景中绘制轨迹、包络、随动附件和接触候选。 */
export default function SpatialShadowRenderer({
  node
}: {
  node: LabSpatialShadowNode
}): React.JSX.Element {
  const groupRef = useRef<Group>(null!)
  useRegistry(node.id, node.type, groupRef)
  return (
    <group ref={groupRef} name={node.id} visible={node.visible !== false}>
      {node.boxes.map(box => <ShadowBox key={box.id} box={box} />)}
      {node.l1Capsules.map(capsule => (
        <ShadowCapsule key={capsule.id} capsule={capsule} />
      ))}
      {node.trajectory.length > 1 ? (
        <ShadowTrajectory points={node.trajectory} />
      ) : null}
      {node.contacts.map(contact => (
        <mesh
          key={contact.id}
          name={contact.id}
          position={contact.position}
          raycast={() => undefined}
          renderOrder={70}
        >
          <sphereGeometry args={[
            contact.role === 'first-contact' ? 0.04 : 0.03,
            18,
            12
          ]} />
          <meshStandardMaterial
            color={contact.role === 'first-contact' ? '#ef4444' : '#fb7185'}
            depthTest={false}
            depthWrite={false}
            emissive={contact.role === 'first-contact' ? '#7f1d1d' : '#881337'}
            emissiveIntensity={0.75}
          />
        </mesh>
      ))}
    </group>
  )
}
