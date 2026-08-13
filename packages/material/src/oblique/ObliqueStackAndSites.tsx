import type { MaterialSite } from '../types'
import type { MaterialObliqueObject, ObliquePoint } from './projection'
import {
  applyAffinePoint,
  clamp,
  dropPoint,
  insetPlane,
  midpoint,
  planeAtHeight,
  pointsAttr
} from './obliqueGeometry'

export function ObliqueStackShelves({
  object,
  thicknessMm
}: {
  object: MaterialObliqueObject
  thicknessMm?: number
}): React.JSX.Element {
  const shelfThickness =
    thicknessMm ?? clamp(object.heightMm * 0.009, 4, 10)
  const basePlane = planeAtHeight(object.base, 0)
  const topPlane = planeAtHeight(object.base, object.heightMm)

  return (
    <>
      <StackRail
        className="is-rear"
        from={object.base[2]}
        to={object.top[2]}
      />
      <StackRail
        className="is-rear"
        from={object.base[3]}
        to={object.top[3]}
      />
      <StackShelf
        className="is-base"
        plane={basePlane}
        thickness={shelfThickness}
      />
      {object.shelves.map((shelf) => (
        <StackShelf
          key={shelf.key}
          label={shelf.label}
          occupied={shelf.occupied}
          plane={planeAtHeight(object.base, shelf.heightMm)}
          siteKey={shelf.siteKey}
          thickness={shelfThickness}
        />
      ))}
      <StackShelf
        className="is-cap"
        plane={topPlane}
        thickness={shelfThickness}
      />
      <StackRail from={object.base[0]} to={object.top[0]} />
      <StackRail from={object.base[1]} to={object.top[1]} />
    </>
  )
}

function StackRail({
  className = '',
  from,
  to
}: {
  className?: string
  from?: ObliquePoint
  to?: ObliquePoint
}): React.JSX.Element | null {
  if (!from || !to) return null
  return (
    <line
      className={`material-oblique-stack__rail ${className}`}
      x1={from[0]}
      y1={from[1]}
      x2={to[0]}
      y2={to[1]}
      vectorEffect="non-scaling-stroke"
    />
  )
}

function StackShelf({
  className = '',
  plane,
  thickness,
  occupied = false,
  siteKey,
  label
}: {
  className?: string
  plane: readonly ObliquePoint[]
  thickness: number
  occupied?: boolean
  siteKey?: string
  label?: string
}): React.JSX.Element {
  const frontStart = plane[0]
  const frontEnd = plane[1]
  const occupiedPlane = insetPlane(plane, 0.1)
  const labelPoint =
    frontStart && frontEnd
      ? midpoint(frontStart, frontEnd)
      : undefined

  return (
    <g className={`material-oblique-stack__shelf-group ${className}`}>
      <polygon
        className="material-oblique-stack__shelf"
        points={pointsAttr(plane)}
      />
      <polygon
        className="material-oblique-stack__shelf-lip"
        points={pointsAttr([
          frontStart,
          frontEnd,
          dropPoint(frontEnd, thickness),
          dropPoint(frontStart, thickness)
        ])}
      />
      {occupied && (
        <polygon
          className="material-oblique-stack__occupied"
          points={pointsAttr(occupiedPlane)}
        />
      )}
      {label && labelPoint && (
        <text
          className="material-oblique-stack__label"
          data-site-key={siteKey}
          data-site-label={label}
          x={labelPoint[0]}
          y={labelPoint[1] - 4}
        >
          {label}
        </text>
      )}
    </g>
  )
}

export function ObliqueSite({
  site
}: {
  site: MaterialSite
}): React.JSX.Element {
  const [width, depth] = site.sizeMm
  const [x, y] = site.poseInAnchor.positionMm
  const className = [
    'material-oblique-site',
    `is-${site.kind ?? 'site'}`,
    `is-${site.visual?.state ?? 'empty'}`
  ].join(' ')

  return (
    <g className="material-oblique-site-group">
      {site.shape === 'circle' ? (
        <circle
          className={className}
          cx={x + width / 2}
          cy={y + depth / 2}
          data-oblique-site-bounds
          data-site-id={site.id}
          data-site-key={site.key}
          data-site-occupancy={site.occupiedMaterialIds.length ? 'occupied' : 'empty'}
          r={Math.min(width, depth) / 2}
          vectorEffect="non-scaling-stroke"
        >
          <title>{site.name}</title>
        </circle>
      ) : (
        <rect
          className={className}
          data-oblique-site-bounds
          data-site-id={site.id}
          data-site-key={site.key}
          data-site-occupancy={site.occupiedMaterialIds.length ? 'occupied' : 'empty'}
          x={x}
          y={y}
          width={width}
          height={depth}
          rx={Math.min(width, depth) * 0.08}
          vectorEffect="non-scaling-stroke"
        >
          <title>{site.name}</title>
        </rect>
      )}
    </g>
  )
}

export function ObliqueSiteLabel({
  site,
  transform
}: {
  site: MaterialSite
  transform: readonly [number, number, number, number, number, number]
}): React.JSX.Element | null {
  const [width, depth] = site.sizeMm
  const label = site.key || site.name
  if (
    !label ||
    site.kind === 'well' ||
    site.kind === 'tip-spot' ||
    Math.max(width, depth) < 18
  ) {
    return null
  }
  const [x, y] = site.poseInAnchor.positionMm
  const [labelX, labelY] = applyAffinePoint(
    transform,
    x + width / 2,
    y + depth / 2
  )
  const labelSize = clamp(Math.min(width, depth) * 0.18, 11, 16)

  return (
    <text
      className="material-oblique-site__label"
      data-site-key={site.key}
      data-site-label={label}
      fontSize={labelSize}
      x={labelX}
      y={labelY}
      dominantBaseline="middle"
      textAnchor="middle"
      vectorEffect="non-scaling-stroke"
    >
      {label}
    </text>
  )
}
