import {
  useMemo,
  useState,
  type KeyboardEvent,
  type MouseEvent
} from 'react'

import type {
  MaterialAggregate,
  MaterialId,
  MaterialSite
} from '../types'
import {
  buildMaterialObliqueScene,
  type MaterialObliqueObject,
  type ObliquePoint
} from './projection'

export interface MaterialObliqueCanvasProps {
  aggregates: readonly MaterialAggregate[]
  selectedMaterialIds?: readonly MaterialId[]
  highlightedMaterialIds?: readonly MaterialId[]
  onSelectionChange?: (materialIds: readonly MaterialId[]) => void
}

/**
 * Responsive front-oblique material projection. Every object is an SVG
 * extrusion of its authoritative plan footprint; sites/wells are painted
 * through the same affine top-plane transform, so equal wells remain equal.
 */
export function MaterialObliqueCanvas({
  aggregates,
  selectedMaterialIds = [],
  highlightedMaterialIds = [],
  onSelectionChange
}: MaterialObliqueCanvasProps): React.JSX.Element {
  const scene = useMemo(
    () => buildMaterialObliqueScene(aggregates),
    [aggregates]
  )
  const [hoveredMaterialId, setHoveredMaterialId] =
    useState<MaterialId | null>(null)
  const selected = new Set(selectedMaterialIds)
  const highlighted = new Set(highlightedMaterialIds)
  const viewBox = [
    scene.bounds.minX,
    scene.bounds.minY,
    scene.bounds.width,
    scene.bounds.height
  ].join(' ')

  const select = (
    materialId: MaterialId,
    additive: boolean
  ): void => {
    if (!additive) {
      onSelectionChange?.([materialId])
      return
    }
    onSelectionChange?.(
      selected.has(materialId)
        ? selectedMaterialIds.filter((id) => id !== materialId)
        : [...selectedMaterialIds, materialId]
    )
  }

  return (
    <div
      className="material-oblique-canvas"
      data-material-oblique-view
    >
      <div className="material-oblique-canvas__header">
        <strong>实验室 2.5D · SVG</strong>
        <span>正面斜二测 · 深度 1:2</span>
      </div>
      {scene.objects.length === 0 ? (
        <div className="material-oblique-canvas__empty">暂无物料</div>
      ) : (
        <svg
          aria-label="实验室 2.5D 物料视图"
          className="material-oblique-canvas__svg"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          viewBox={viewBox}
          onClick={() => onSelectionChange?.([])}
        >
          <defs>
            <filter
              id="material-oblique-shadow"
              x="-30%"
              y="-30%"
              width="160%"
              height="180%"
            >
              <feDropShadow
                dx="0"
                dy="5"
                floodColor="#0f172a"
                floodOpacity="0.08"
                stdDeviation="5"
              />
            </filter>
          </defs>
          {scene.objects.map((object) => {
            const isSelected = selected.has(object.materialId)
            const isHighlighted = highlighted.has(object.materialId)
            const isHovered = hoveredMaterialId === object.materialId
            return (
              <ObliqueMaterial
                key={object.materialId}
                object={object}
                selected={isSelected}
                highlighted={isHighlighted}
                showTag={
                  isEquipmentKind(object.kind) ||
                  isSelected ||
                  isHighlighted ||
                  isHovered
                }
                onClick={(event) => {
                  event.stopPropagation()
                  select(
                    object.materialId,
                    event.ctrlKey || event.metaKey
                  )
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return
                  event.preventDefault()
                  select(
                    object.materialId,
                    event.ctrlKey || event.metaKey
                  )
                }}
                onPointerEnter={() =>
                  setHoveredMaterialId(object.materialId)
                }
                onPointerLeave={() => setHoveredMaterialId(null)}
              />
            )
          })}
        </svg>
      )}
    </div>
  )
}

function ObliqueMaterial({
  object,
  selected,
  highlighted,
  showTag,
  onClick,
  onKeyDown,
  onPointerEnter,
  onPointerLeave
}: {
  object: MaterialObliqueObject
  selected: boolean
  highlighted: boolean
  showTag: boolean
  onClick: (event: MouseEvent<SVGGElement>) => void
  onKeyDown: (event: KeyboardEvent<SVGGElement>) => void
  onPointerEnter: () => void
  onPointerLeave: () => void
}): React.JSX.Element {
  const stateClass = [
    'material-oblique-object',
    selected ? 'is-selected' : '',
    highlighted ? 'is-highlighted' : '',
    `is-${materialKindClass(object.kind)}`
  ]
    .filter(Boolean)
    .join(' ')
  const label = object.code || object.name
  const tagPoint = tagAnchor(object.top)
  const tagWidth = Math.max(70, label.length * 13 + 24)

  return (
    <g
      aria-label={`${label}，${object.widthMm}×${object.depthMm}×${object.heightMm} 毫米`}
      className={stateClass}
      data-material-code={object.code}
      data-material-id={object.materialId}
      data-oblique-render-style={object.renderStyle}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={onKeyDown}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <title>
        {object.name} · {object.widthMm}×{object.depthMm}×
        {object.heightMm} mm
      </title>
      {object.renderStyle === 'stack' ? (
        <ObliqueStackBody object={object} />
      ) : (
        <ObliqueSolidBody object={object} />
      )}
      {showTag && (
        <g
          className="material-oblique-object__tag"
          transform={`translate(${tagPoint[0]} ${tagPoint[1]})`}
        >
          <line y1="0" y2="13" />
          <rect
            x={-tagWidth / 2}
            y={-31}
            width={tagWidth}
            height="30"
            rx="8"
          />
          <text y="-16">{label}</text>
        </g>
      )}
    </g>
  )
}

function ObliqueSolidBody({
  object
}: {
  object: MaterialObliqueObject
}): React.JSX.Element {
  const labwareLayerHeight = object.heightMm * 0.28
  const layerStart = elevatePoint(object.base[0], labwareLayerHeight)
  const layerEnd = elevatePoint(object.base[1], labwareLayerHeight)
  const rimInsetX = object.widthMm * 0.035
  const rimInsetY = object.depthMm * 0.055

  return (
    <>
      <polygon
        className="material-oblique-object__shadow"
        filter="url(#material-oblique-shadow)"
        points={pointsAttr(object.base)}
      />
      <polygon
        className="material-oblique-object__front"
        points={pointsAttr([
          object.base[0],
          object.base[1],
          object.top[1],
          object.top[0]
        ])}
      />
      <polygon
        className="material-oblique-object__side"
        points={pointsAttr([
          object.base[1],
          object.base[2],
          object.top[2],
          object.top[1]
        ])}
      />
      <polygon
        className="material-oblique-object__top"
        points={pointsAttr(object.top)}
      />
      {object.renderStyle === 'labware' &&
        layerStart &&
        layerEnd && (
          <line
            className="material-oblique-labware__layer"
            x1={layerStart[0]}
            y1={layerStart[1]}
            x2={layerEnd[0]}
            y2={layerEnd[1]}
            vectorEffect="non-scaling-stroke"
          />
        )}
      <g
        className="material-oblique-object__plan"
        transform={`matrix(${object.topTransform.join(' ')})`}
      >
        {object.renderStyle === 'labware' && (
          <rect
            className="material-oblique-labware__rim"
            x={rimInsetX}
            y={rimInsetY}
            width={Math.max(object.widthMm - rimInsetX * 2, 0)}
            height={Math.max(object.depthMm - rimInsetY * 2, 0)}
            rx={Math.min(object.widthMm, object.depthMm) * 0.055}
            vectorEffect="non-scaling-stroke"
          />
        )}
        {object.sites.map((site) => (
          <ObliqueSite key={site.id} site={site} />
        ))}
      </g>
      {object.sites.map((site) => (
        <ObliqueSiteLabel
          key={`label-${site.id}`}
          site={site}
          transform={object.topTransform}
        />
      ))}
    </>
  )
}

function ObliqueStackBody({
  object
}: {
  object: MaterialObliqueObject
}): React.JSX.Element {
  const shelfThickness = clamp(object.heightMm * 0.009, 4, 10)
  const basePlane = planeAtHeight(object.base, 0)
  const topPlane = planeAtHeight(object.base, object.heightMm)

  return (
    <>
      <polygon
        className="material-oblique-object__shadow"
        filter="url(#material-oblique-shadow)"
        points={pointsAttr(object.base)}
      />
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

function ObliqueSite({
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
          data-site-key={site.key}
          r={Math.min(width, depth) / 2}
          vectorEffect="non-scaling-stroke"
        >
          <title>{site.name}</title>
        </circle>
      ) : (
        <rect
          className={className}
          data-site-key={site.key}
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

function ObliqueSiteLabel({
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

function applyAffinePoint(
  transform: readonly [number, number, number, number, number, number],
  x: number,
  y: number
): ObliquePoint {
  const [a, b, c, d, e, f] = transform
  return [a * x + c * y + e, b * x + d * y + f]
}

function planeAtHeight(
  base: readonly ObliquePoint[],
  heightMm: number
): ObliquePoint[] {
  return base.map(([x, y]) => [x, y - heightMm])
}

function elevatePoint(
  point: ObliquePoint | undefined,
  heightMm: number
): ObliquePoint | undefined {
  return point ? [point[0], point[1] - heightMm] : undefined
}

function dropPoint(
  point: ObliquePoint | undefined,
  distance: number
): ObliquePoint | undefined {
  return point ? [point[0], point[1] + distance] : undefined
}

function insetPlane(
  plane: readonly ObliquePoint[],
  ratio: number
): ObliquePoint[] {
  if (plane.length === 0) return []
  const center: ObliquePoint = [
    plane.reduce((total, point) => total + point[0], 0) / plane.length,
    plane.reduce((total, point) => total + point[1], 0) / plane.length
  ]
  return plane.map(([x, y]) => [
    x + (center[0] - x) * ratio,
    y + (center[1] - y) * ratio
  ])
}

function midpoint(
  left: ObliquePoint,
  right: ObliquePoint
): ObliquePoint {
  return [
    (left[0] + right[0]) / 2,
    (left[1] + right[1]) / 2
  ]
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}

function tagAnchor(points: readonly ObliquePoint[]): ObliquePoint {
  return [
    points.reduce((total, point) => total + point[0], 0) / points.length,
    Math.min(...points.map((point) => point[1])) - 18
  ]
}

function pointsAttr(points: readonly (ObliquePoint | undefined)[]): string {
  return points
    .filter((point): point is ObliquePoint => point != null)
    .map((point) => point.join(','))
    .join(' ')
}

function isEquipmentKind(kind: string): boolean {
  const normalized = kind.replaceAll('_', '-').toLowerCase()
  return ![
    'plate',
    'tip-rack',
    'tiprack',
    'labware',
    'container',
    'reagent',
    'sample',
    'tube',
    'trash',
    'deck'
  ].some((token) => normalized.includes(token))
}

function materialKindClass(kind: string): string {
  const normalized = kind.replaceAll('_', '-').toLowerCase()
  if (
    normalized.includes('hotel') ||
    normalized.includes('stack')
  ) {
    return 'stack'
  }
  if (normalized.includes('trash')) return 'trash'
  if (normalized.includes('deck')) return 'deck'
  if (
    normalized.includes('plate') ||
    normalized.includes('tip-rack') ||
    normalized.includes('tiprack')
  ) {
    return 'labware'
  }
  return 'equipment'
}
