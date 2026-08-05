import { Edges } from '@react-three/drei'
import { useMemo, useState } from 'react'

import type { LabFloorplanSite } from '../schema'
import { labPoseToPascal, MILLIMETERS_TO_METERS } from '../units'

export interface SiteBoundsTransform {
  position: [number, number, number]
  scale: [number, number, number]
}

export type SiteBoundsGeometry =
  | {
      kind: 'box'
      position: [number, number, number]
      size: [number, number, number]
    }
  | {
      kind: 'cylinder'
      position: [number, number, number]
      radius: number
      height: number
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

export function siteBoundsGeometry(
  site: LabFloorplanSite
): SiteBoundsGeometry {
  const { position, scale } = siteBoundsTransform(site)
  if (site.shape === 'circle') {
    return {
      kind: 'cylinder',
      position,
      radius: Math.min(scale[0], scale[2]) / 2,
      height: scale[1]
    }
  }
  return { kind: 'box', position, size: scale }
}

export function selectRenderableSiteBounds(
  sites: readonly LabFloorplanSite[],
  showSites: boolean,
  hoveredSiteId: string | null
): LabFloorplanSite[] {
  return sites.filter(
    (site) =>
      site.visible &&
      !site.occupied &&
      (showSites || site.id === hoveredSiteId)
  )
}

function SiteGeometry({
  geometry
}: {
  geometry: SiteBoundsGeometry
}): React.JSX.Element {
  return geometry.kind === 'cylinder' ? (
    <cylinderGeometry
      args={[geometry.radius, geometry.radius, geometry.height, 32]}
    />
  ) : (
    <boxGeometry args={geometry.size} />
  )
}

function SiteBound({
  site,
  shown,
  onHover
}: {
  site: LabFloorplanSite
  shown: boolean
  onHover: React.Dispatch<React.SetStateAction<string | null>>
}): React.JSX.Element {
  const geometry = siteBoundsGeometry(site)
  return (
    <mesh
      name={`unilab-site-bound-${site.id}`}
      position={geometry.position}
      renderOrder={18}
      userData={{ siteId: site.id, siteShape: geometry.kind }}
      onPointerOver={(event) => {
        event.stopPropagation()
        onHover(site.id)
      }}
      onPointerOut={(event) => {
        event.stopPropagation()
        onHover((current) => (current === site.id ? null : current))
      }}
    >
      <SiteGeometry geometry={geometry} />
      <meshBasicMaterial
        color="#bae6fd"
        depthTest={false}
        depthWrite={false}
        opacity={shown ? 0.24 : 0}
        transparent
      />
      {shown && (
        <Edges color="#38bdf8" depthTest={false} threshold={15} />
      )}
    </mesh>
  )
}

/**
 * Empty Sites are always raycastable. The toolbar switch controls whether
 * they are persistently visible; with it off, only the hovered Site appears.
 */
export function SiteBoundsRenderer({
  sites,
  showSites
}: {
  sites: readonly LabFloorplanSite[]
  showSites: boolean
}): React.JSX.Element | null {
  const [hoveredSiteId, setHoveredSiteId] = useState<string | null>(null)
  const hitSites = useMemo(
    () => selectRenderableSiteBounds(sites, true, null),
    [sites]
  )
  const shownSiteIds = useMemo(
    () =>
      new Set(
        selectRenderableSiteBounds(sites, showSites, hoveredSiteId).map(
          (site) => site.id
        )
      ),
    [hoveredSiteId, showSites, sites]
  )

  if (hitSites.length === 0) return null

  return (
    <group
      name="unilab-site-bounds"
      userData={{
        hitSiteCount: hitSites.length,
        shownSiteCount: shownSiteIds.size
      }}
    >
      {hitSites.map((site) => (
        <SiteBound
          key={site.id}
          site={site}
          shown={shownSiteIds.has(site.id)}
          onHover={setHoveredSiteId}
        />
      ))}
    </group>
  )
}
