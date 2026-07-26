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
            <pattern
              id="material-oblique-grid"
              width="50"
              height="50"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 50 0 L 0 0 0 50"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            </pattern>
            <filter
              id="material-oblique-shadow"
              x="-30%"
              y="-30%"
              width="160%"
              height="180%"
            >
              <feDropShadow
                dx="0"
                dy="8"
                floodColor="#0f172a"
                floodOpacity="0.18"
                stdDeviation="7"
              />
            </filter>
          </defs>
          <rect
            className="material-oblique-canvas__grid"
            x={scene.bounds.minX}
            y={scene.bounds.minY}
            width={scene.bounds.width}
            height={scene.bounds.height}
            fill="url(#material-oblique-grid)"
          />
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
      <g
        className="material-oblique-object__plan"
        transform={`matrix(${object.topTransform.join(' ')})`}
      >
        {object.sites.map((site) => (
          <ObliqueSite key={site.id} site={site} />
        ))}
      </g>
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

  return site.shape === 'circle' ? (
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
    <g>
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
      {site.kind === 'deck-slot' &&
        Math.min(width, depth) >= 40 && (
        <text
          className="material-oblique-site__label"
          x={x + width / 2}
          y={y + depth / 2}
          dominantBaseline="middle"
          textAnchor="middle"
          vectorEffect="non-scaling-stroke"
        >
          {site.name}
        </text>
      )}
    </g>
  )
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
  ].some((token) => kind.includes(token))
}

function materialKindClass(kind: string): string {
  if (kind.includes('trash')) return 'trash'
  if (kind.includes('deck')) return 'deck'
  if (
    kind.includes('plate') ||
    kind.includes('tip-rack') ||
    kind.includes('tiprack')
  ) {
    return 'labware'
  }
  return 'equipment'
}
