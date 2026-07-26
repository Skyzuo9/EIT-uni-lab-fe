import type { NodeProps } from 'reactflow'

import { useMaterialStore } from '../MaterialStoreProvider'
import type { MaterialFlowNodeData } from './projection'
import {
  materialSiteStyle,
  readMaterial2DVisual
} from './visual'
import type { MaterialSite } from '../types'

export function MaterialNode({
  data,
  selected
}: NodeProps<MaterialFlowNodeData>): React.JSX.Element {
  const aggregate = useMaterialStore(
    (state) => state.aggregatesById[data.materialId]
  )

  if (!aggregate) {
    return <div className="material-flow-node is-missing">物料不存在</div>
  }

  const occupied = aggregate.sites.reduce(
    (total, site) => total + site.occupiedMaterialIds.length,
    0
  )
  const visual = readMaterial2DVisual(aggregate)
  const isDeck = visual.kind.includes('deck')
  const isLabware =
    visual.kind.includes('plate') ||
    visual.kind.includes('tip-rack') ||
    visual.kind.includes('tiprack')
  const isStation = visual.kind === 'liquid-handler'
  const isTrash = visual.kind.includes('trash')
  const isEquipment = isEquipmentKind(visual.kind)

  if (visual.physical || isDeck || isLabware || isStation || isTrash) {
    return (
      <article
        className={[
          'material-flow-node',
          'material-flow-node--physical',
          `material-flow-node--${
            isDeck
              ? 'deck'
              : isLabware
                ? 'labware'
                : isTrash
                  ? 'trash'
                  : isEquipment
                    ? 'station'
                    : 'labware'
          }`,
          selected ? 'is-selected' : ''
        ]
          .filter(Boolean)
          .join(' ')}
        data-material-code={aggregate.material.code}
        data-material-kind={visual.kind}
      >
        <header className="material-flow-node__physical-label">
          <span>{aggregate.material.code || aggregate.material.name}</span>
          {(isDeck || isEquipment) && (
            <small>
              {formatDimension(visual.footprintMm[0])}×
              {formatDimension(visual.footprintMm[1])} mm
            </small>
          )}
        </header>
        {isTrash && (
          <div className="material-flow-node__trash-mark">
            <span aria-hidden="true">🗑</span>
            <strong>Trash</strong>
          </div>
        )}
        {(isDeck || isLabware) && (
          <div className="material-flow-node__sites">
            {isLabware ? (
              <LabwareSites
                sites={aggregate.sites}
                footprintMm={visual.footprintMm}
              />
            ) : (
              aggregate.sites
                .filter((site) => site.visible !== false)
                .map((site) => (
                  <span
                    key={site.id}
                    className={siteClassName(site, 'material-flow-site')}
                    data-site-key={site.key}
                    style={materialSiteStyle(site, visual.footprintMm)}
                    title={siteTitle(site)}
                  >
                    {site.name}
                  </span>
                ))
            )}
          </div>
        )}
      </article>
    )
  }

  return (
    <article
      className={`material-flow-node${selected ? ' is-selected' : ''}`}
      data-material-code={aggregate.material.code}
      data-material-kind={visual.kind}
    >
      <header>
        <span>{aggregate.material.code || 'Material'}</span>
        <small>r{aggregate.revision}</small>
      </header>
      <strong>{aggregate.material.name}</strong>
      <footer>
        <span>{placementLabel(aggregate.placement.kind)}</span>
        <span>
          {aggregate.sites.length
            ? `${occupied}/${aggregate.sites.length} Site`
            : '无 Site'}
        </span>
      </footer>
    </article>
  )
}

function isEquipmentKind(kind: string): boolean {
  return ![
    'plate',
    'tip-rack',
    'tiprack',
    'labware',
    'container',
    'reagent',
    'sample',
    'tube',
    'trash'
  ].some((token) => kind.includes(token))
}

/**
 * Wells and tip spots are drawn in one physical-coordinate SVG. Reusing the
 * same vector geometry prevents fractional CSS boxes and one-pixel borders
 * from making equal 8.2 mm wells appear to have different diameters.
 */
function LabwareSites({
  sites,
  footprintMm
}: {
  sites: readonly MaterialSite[]
  footprintMm: readonly [number, number]
}): React.JSX.Element {
  return (
    <svg
      aria-label="物料孔位"
      className="material-flow-sites-vector"
      preserveAspectRatio="none"
      viewBox={`0 0 ${footprintMm[0]} ${footprintMm[1]}`}
    >
      {sites
        .filter((site) => site.visible !== false)
        .map((site) => {
          const width = Math.max(site.sizeMm[0], 0.5)
          const height = Math.max(site.sizeMm[1], 0.5)
          const x = site.poseInAnchor.positionMm[0]
          const y =
            footprintMm[1] -
            site.poseInAnchor.positionMm[1] -
            height
          const className = siteClassName(
            site,
            'material-flow-site-vector'
          )

          return site.shape === 'circle' ? (
            <circle
              key={site.id}
              className={className}
              cx={x + width / 2}
              cy={y + height / 2}
              data-site-key={site.key}
              r={Math.min(width, height) / 2}
              vectorEffect="non-scaling-stroke"
            >
              <title>{siteTitle(site)}</title>
            </circle>
          ) : (
            <rect
              key={site.id}
              className={className}
              data-site-key={site.key}
              height={height}
              rx={Math.min(width, height) * 0.12}
              vectorEffect="non-scaling-stroke"
              width={width}
              x={x}
              y={y}
            >
              <title>{siteTitle(site)}</title>
            </rect>
          )
        })}
    </svg>
  )
}

function siteClassName(site: MaterialSite, base: string): string {
  return [
    base,
    `is-${site.kind ?? 'site'}`,
    `is-${site.visual?.state ?? 'empty'}`,
    site.shape === 'circle' ? 'is-circle' : ''
  ].join(' ')
}

function siteTitle(site: MaterialSite): string {
  return `${site.name} · ${site.sizeMm[0]}×${site.sizeMm[1]} mm · (${site.poseInAnchor.positionMm.join(', ')})`
}

function formatDimension(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function placementLabel(kind: string): string {
  if (kind === 'world') return 'World'
  if (kind === 'parent') return 'Parent'
  if (kind === 'site') return 'Site'
  return '未放置'
}
