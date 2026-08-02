import { useLayoutEffect, useMemo, useRef } from 'react'
import {
  type InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3
} from 'three'

import type { LabFloorplanSite } from '../schema'
import { labPoseToPascal, MILLIMETERS_TO_METERS } from '../units'

export interface SiteBoundsTransform {
  position: [number, number, number]
  scale: [number, number, number]
}

/** Convert a lower-left Z-up Site box into a centered Pascal Y-up box. */
export function siteBoundsTransform(
  site: LabFloorplanSite
): SiteBoundsTransform {
  const [widthMm, lengthMm, depthMm] = site.sizeMm
  const [xMm, yMm, zMm] = site.positionMm
  const centered = labPoseToPascal({
    positionMm: [
      xMm + widthMm / 2,
      yMm + lengthMm / 2,
      zMm + depthMm / 2
    ],
    rotationDegXYZ: [0, 0, 0]
  })
  return {
    position: centered.position,
    scale: [
      Math.max(widthMm * MILLIMETERS_TO_METERS, 0.001),
      Math.max(depthMm * MILLIMETERS_TO_METERS, 0.001),
      Math.max(lengthMm * MILLIMETERS_TO_METERS, 0.001)
    ]
  }
}

/** Lightweight instanced cages keep hundreds of warehouse Sites readable. */
export function SiteBoundsRenderer({
  sites
}: {
  sites: readonly LabFloorplanSite[]
}): React.JSX.Element | null {
  const visibleSites = useMemo(
    () => sites.filter((site) => site.visible),
    [sites]
  )
  const transforms = useMemo(
    () => visibleSites.map(siteBoundsTransform),
    [visibleSites]
  )
  const fillRef = useRef<InstancedMesh>(null!)
  const wireRef = useRef<InstancedMesh>(null!)

  useLayoutEffect(() => {
    const quaternion = new Quaternion()
    const matrix = new Matrix4()
    for (const [index, transform] of transforms.entries()) {
      matrix.compose(
        new Vector3(...transform.position),
        quaternion,
        new Vector3(...transform.scale)
      )
      fillRef.current?.setMatrixAt(index, matrix)
      wireRef.current?.setMatrixAt(index, matrix)
    }
    if (fillRef.current) {
      fillRef.current.instanceMatrix.needsUpdate = true
      fillRef.current.computeBoundingSphere()
    }
    if (wireRef.current) {
      wireRef.current.instanceMatrix.needsUpdate = true
      wireRef.current.computeBoundingSphere()
    }
  }, [transforms])

  if (visibleSites.length === 0) return null

  return (
    <group
      name="unilab-site-bounds"
      userData={{ siteCount: visibleSites.length }}
    >
      <instancedMesh
        ref={fillRef}
        args={[undefined, undefined, visibleSites.length]}
        frustumCulled={false}
        renderOrder={18}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial
          color="#7dd3fc"
          depthWrite={false}
          opacity={0.14}
          transparent
        />
      </instancedMesh>
      <instancedMesh
        ref={wireRef}
        args={[undefined, undefined, visibleSites.length]}
        frustumCulled={false}
        renderOrder={19}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial
          color="#38bdf8"
          depthWrite={false}
          opacity={0.58}
          transparent
          wireframe
        />
      </instancedMesh>
    </group>
  )
}
