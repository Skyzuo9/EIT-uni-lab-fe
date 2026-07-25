import { useRegistry } from '@pascal-app/core'
import { NodeRenderer } from '@pascal-app/viewer'
import { useRef } from 'react'
import type { Group } from 'three'

interface HierarchyNode {
  id: string
  type: string
  visible?: boolean
  children?: readonly string[]
  position?: readonly [number, number, number]
  rotation?: number | readonly [number, number, number]
}

export default function HierarchyRenderer({
  node
}: {
  node: HierarchyNode
}): React.JSX.Element {
  const groupRef = useRef<Group>(null!)
  useRegistry(node.id, node.type, groupRef)

  const rotation =
    typeof node.rotation === 'number'
      ? ([0, node.rotation, 0] as const)
      : node.rotation

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
    </group>
  )
}
