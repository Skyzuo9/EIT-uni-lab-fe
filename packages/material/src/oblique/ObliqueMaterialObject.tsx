import type { KeyboardEvent, MouseEvent } from 'react'

import type {
  MaterialObliqueObject,
  MaterialObliqueShape,
  ObliquePoint
} from './projection'
import type { MaterialShapePrimitive } from './shapeSpec'
import {
  ObliqueSite,
  ObliqueSiteLabel,
  ObliqueStackShelves
} from './ObliqueStackAndSites'
import {
  applyAffinePoint,
  arcPoints,
  clamp,
  circlePoint,
  dropPoint,
  elevatePoint,
  frontSweepSign,
  latheOutline,
  materialKindClass,
  planeAtHeight,
  planeTransform,
  pointsAttr,
  ribAngles,
  spoutOutline,
  tagAnchor,
  type LatheRing
} from './obliqueGeometry'

export function ObliqueMaterial({
  object,
  selected,
  highlighted,
  showSites,
  labelScale,
  labelOffsetY,
  showTag,
  onClick,
  onKeyDown,
  onPointerEnter,
  onPointerLeave
}: {
  object: MaterialObliqueObject
  selected: boolean
  highlighted: boolean
  showSites: boolean
  labelScale: number
  labelOffsetY: number
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
    showTag ? 'is-tag-visible' : '',
    `is-fidelity-${object.fidelity}`,
    `is-${materialKindClass(object.kind)}`
  ]
    .filter(Boolean)
    .join(' ')
  const tagPoint = tagAnchor(object.top)
  const showCode = Boolean(
    object.code && object.code !== object.name
  )
  const tagWidth = Math.max(
    220,
    object.name.length * 38 + 52,
    showCode ? object.code.length * 23 + 52 : 0
  )
  const tagHeight = showCode ? 74 : 52

  return (
    <g
      aria-label={`${object.name}，${object.widthMm}×${object.depthMm}×${object.heightMm} 毫米`}
      aria-pressed={selected}
      className={stateClass}
      data-material-code={object.code}
      data-material-id={object.materialId}
      data-oblique-render-style={object.renderStyle}
      data-oblique-shape={object.shape?.id ?? ''}
      data-oblique-fidelity={object.fidelity}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={onKeyDown}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <title>
        {`${object.name} · ${object.widthMm}×${object.depthMm}×${object.heightMm} mm`}
      </title>
      {!object.logicalMount && object.shape ? (
        <ObliqueSpecBody
          object={object}
          shape={object.shape}
          showSites={showSites}
        />
      ) : !object.logicalMount ? (
        <ObliqueSolidBody object={object} />
      ) : null}
      {showSites ? <ObliqueSiteBounds object={object} /> : null}
      <g
        className="material-oblique-object__tag"
        transform={`translate(${tagPoint[0]} ${tagPoint[1]}) scale(${labelScale}) translate(0 ${labelOffsetY})`}
      >
        <line y1="0" y2="34" />
        <rect
          x={-tagWidth / 2}
          y={-tagHeight - 16}
          width={tagWidth}
          height={tagHeight}
          rx="12"
        />
        <text
          className="material-oblique-object__tag-name"
          y={showCode ? -61 : -42}
        >
          {object.name}
        </text>
        {showCode ? (
          <text
            className="material-oblique-object__tag-code"
            y="-34"
          >
            {object.code}
          </text>
        ) : null}
      </g>
    </g>
  )
}

/**
 * 没有外形声明时的兜底：按包围盒挤出一个实心体，位点画在顶面。
 */
function ObliqueSolidBody({
  object
}: {
  object: MaterialObliqueObject
}): React.JSX.Element {
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
    </>
  )
}

/**
 * 唯一的外形解释器：把设备包声明展开出的图元按顺序画出来。这里没有任何
 * 设备名——每个分支都是一种几何画法。
 */
function ObliqueSpecBody({
  object,
  shape,
  showSites
}: {
  object: MaterialObliqueObject
  shape: MaterialObliqueShape
  showSites: boolean
}): React.JSX.Element {
  return (
    <>
      <ObliqueShapeShadow object={object} shape={shape} />
      {shape.primitives.map((primitive, index) => (
        <ObliquePrimitiveNode
          key={`${primitive.kind}-${index}`}
          object={object}
          primitive={primitive}
          showSites={showSites}
        />
      ))}
    </>
  )
}

function ObliquePrimitiveNode({
  object,
  primitive,
  showSites
}: {
  object: MaterialObliqueObject
  primitive: MaterialShapePrimitive
  showSites: boolean
}): React.JSX.Element | null {
  const partClass = (style: string): string =>
    `material-oblique-part material-oblique-part--${style}`

  switch (primitive.kind) {
    case 'box':
      return (
        <ObliqueBox
          className={partClass(primitive.style)}
          from={primitive.from}
          object={object}
          to={primitive.to}
        />
      )
    case 'slab':
      return (
        <ObliqueSlab
          className={partClass(primitive.style)}
          from={primitive.fromZMm}
          object={object}
          to={primitive.toZMm}
        />
      )
    case 'cylinder':
      return (
        <ObliqueCylinder
          centerX={primitive.centerXMm}
          centerY={primitive.centerYMm}
          className={partClass(primitive.style)}
          from={primitive.fromZMm}
          object={object}
          radiusMm={primitive.radiusMm}
          to={primitive.toZMm}
        />
      )
    case 'lathe':
      return <ObliqueLathe object={object} primitive={primitive} />
    case 'disc':
      return (
        <g
          transform={`matrix(${planeTransform(object, primitive.zMm).join(' ')})`}
        >
          <circle
            className={partClass(primitive.style)}
            cx={primitive.centerXMm}
            cy={primitive.centerYMm}
            r={primitive.radiusMm}
            vectorEffect="non-scaling-stroke"
          />
        </g>
      )
    case 'rect':
      return (
        <g
          transform={`matrix(${planeTransform(object, primitive.zMm).join(' ')})`}
        >
          <rect
            className={partClass(primitive.style)}
            x={primitive.xMm}
            y={primitive.yMm}
            width={primitive.widthMm}
            height={primitive.depthMm}
            rx={primitive.radiusMm}
            vectorEffect="non-scaling-stroke"
          />
        </g>
      )
    case 'edge': {
      const [x0, y0, z0] = primitive.from
      const [x1, y1, z1] = primitive.to
      const start = applyAffinePoint(planeTransform(object, z0), x0, y0)
      const end = applyAffinePoint(planeTransform(object, z1), x1, y1)
      return (
        <line
          className={partClass(primitive.style)}
          x1={start[0]}
          y1={start[1]}
          x2={end[0]}
          y2={end[1]}
          vectorEffect="non-scaling-stroke"
        />
      )
    }
    case 'open-rack':
      return (
        <ObliqueOpenRack
          object={object}
          thicknessMm={primitive.boardThicknessMm}
        />
      )
    case 'stack-shelves':
      return (
        <ObliqueStackShelves
          object={object}
          thicknessMm={primitive.shelfThicknessMm}
        />
      )
    case 'site-holes':
      if (!showSites) return null
      return (
        <ObliqueSiteHoles
          collarTopZMm={primitive.collarTopZMm}
          object={object}
          plateTopZMm={primitive.plateTopZMm}
        />
      )
    case 'site-markers':
      return null
    default:
      return null
  }
}

/** 台面上的投影：方体按包围盒，回转体按底圈。 */
function ObliqueShapeShadow({
  object,
  shape
}: {
  object: MaterialObliqueObject
  shape: MaterialObliqueShape
}): React.JSX.Element | null {
  if (shape.shadow === 'none') return null
  if (shape.shadow === 'round') {
    const round = shape.primitives.find(
      (primitive) =>
        primitive.kind === 'lathe' || primitive.kind === 'cylinder'
    )
    if (round && (round.kind === 'lathe' || round.kind === 'cylinder')) {
      const ring = round.kind === 'lathe' ? round.rings[0] : undefined
      const zMm =
        round.kind === 'lathe' && ring
          ? round.fromZMm + (round.toZMm - round.fromZMm) * ring.z
          : round.fromZMm
      const radiusMm = round.radiusMm * (ring ? ring.r : 1)
      return (
        <polygon
          className="material-oblique-object__shadow"
          filter="url(#material-oblique-shadow)"
          points={pointsAttr(
            arcPoints(
              planeTransform(object, zMm),
              round.centerXMm,
              round.centerYMm,
              radiusMm,
              0,
              2 * Math.PI,
              44
            )
          )}
        />
      )
    }
  }
  return (
    <polygon
      className="material-oblique-object__shadow"
      filter="url(#material-oblique-shadow)"
      points={pointsAttr(object.base)}
    />
  )
}

/**
 * Open-front racks (beaker/reagent stacks, tip warehouses) are drawn as a
 * frame: rear and side panels plus one board per slot level. The front stays
 * open, so the vessels standing on each board remain visible.
 */
function ObliqueOpenRack({
  object,
  thicknessMm
}: {
  object: MaterialObliqueObject
  thicknessMm?: number
}): React.JSX.Element {
  const boardThickness =
    thicknessMm ?? clamp(object.heightMm * 0.02, 6, 14)
  const topLevelZ = object.levels.length
    ? object.levels[object.levels.length - 1].zMm
    : 0
  const hasRoof = object.heightMm - topLevelZ > boardThickness * 2

  return (
    <>
      <polygon
        className="material-oblique-part material-oblique-part--frame is-rear"
        points={pointsAttr([
          object.base[2],
          object.base[3],
          object.top[3],
          object.top[2]
        ])}
      />
      <polygon
        className="material-oblique-part material-oblique-part--frame is-inner-side"
        points={pointsAttr([
          object.base[3],
          object.base[0],
          object.top[0],
          object.top[3]
        ])}
      />
      {object.levels.map((level) => (
        <ShelfBoard
          key={level.key}
          object={object}
          thickness={boardThickness}
          zMm={level.zMm}
        />
      ))}
      <polygon
        className="material-oblique-part material-oblique-part--frame"
        points={pointsAttr([
          object.base[1],
          object.base[2],
          object.top[2],
          object.top[1]
        ])}
      />
      {hasRoof && (
        <ShelfBoard
          object={object}
          thickness={boardThickness}
          zMm={object.heightMm}
        />
      )}
      {[object.base[0], object.base[1]].map((corner, index) => {
        const upper = elevatePoint(corner, object.heightMm)
        if (!corner || !upper) return null
        return (
          <line
            key={`post-${index}`}
            className="material-oblique-part material-oblique-part--post"
            x1={corner[0]}
            y1={corner[1]}
            x2={upper[0]}
            y2={upper[1]}
            vectorEffect="non-scaling-stroke"
          />
        )
      })}
    </>
  )
}

function ShelfBoard({
  children,
  object,
  thickness,
  zMm
}: {
  children?: React.ReactNode
  object: MaterialObliqueObject
  thickness: number
  zMm: number
}): React.JSX.Element {
  const plane = planeAtHeight(object.base, zMm)

  return (
    <g className="material-oblique-board-group">
      <polygon
        className="material-oblique-part material-oblique-part--board"
        points={pointsAttr(plane)}
      />
      <polygon
        className="material-oblique-part material-oblique-part--board is-lip"
        points={pointsAttr([
          plane[0],
          plane[1],
          dropPoint(plane[1], thickness),
          dropPoint(plane[0], thickness)
        ])}
      />
      {children && (
        <g
          className="material-oblique-object__plan"
          transform={`matrix(${planeTransform(object, zMm).join(' ')})`}
        >
          {children}
        </g>
      )}
    </g>
  )
}

/**
 * 孔板上的孔与孔里插着的东西（枪头）：孔位与占用状态都来自实例位点，
 * 声明只说"这里有一块孔板"。
 */
function ObliqueSiteHoles({
  collarTopZMm,
  object,
  plateTopZMm
}: {
  collarTopZMm?: number
  object: MaterialObliqueObject
  plateTopZMm?: number
}): React.JSX.Element {
  const holeSites = object.levels[0]?.sites ?? object.sites
  const plateTopZ =
    plateTopZMm ?? object.levels[0]?.zMm ?? object.heightMm * 0.83
  const collarTopZ = collarTopZMm ?? object.heightMm
  const collarHeight = Math.max(collarTopZ - plateTopZ, 0)
  const point = (x: number, y: number, z: number): ObliquePoint =>
    applyAffinePoint(planeTransform(object, z), x, y)

  return (
    <>
      <g transform={`matrix(${planeTransform(object, plateTopZ).join(' ')})`}>
        {holeSites.map((site) => (
          <circle
            key={site.id}
            className={`material-oblique-part material-oblique-part--hole is-${
              site.visual?.state ?? 'empty'
            }`}
            cx={site.poseInAnchor.positionMm[0] + site.sizeMm[0] / 2}
            cy={site.poseInAnchor.positionMm[1] + site.sizeMm[1] / 2}
            data-site-key={site.key}
            r={Math.min(site.sizeMm[0], site.sizeMm[1]) / 2}
            vectorEffect="non-scaling-stroke"
          >
            <title>{site.name}</title>
          </circle>
        ))}
      </g>
      {collarHeight > 0 &&
        holeSites.map((site) => {
          const [x, y] = site.poseInAnchor.positionMm
          const radius = Math.min(site.sizeMm[0], site.sizeMm[1]) / 2
          const centerX = x + site.sizeMm[0] / 2
          const centerY = y + site.sizeMm[1] / 2
          return (
            <polygon
              key={`collar-${site.id}`}
              className="material-oblique-hole__collar"
              points={pointsAttr([
                point(centerX - radius, centerY, plateTopZ),
                point(centerX + radius, centerY, plateTopZ),
                point(centerX + radius, centerY, plateTopZ + collarHeight),
                point(centerX - radius, centerY, plateTopZ + collarHeight)
              ])}
            />
          )
        })}
    </>
  )
}

/** 每个 Site 按自己的局部高度绘制浅蓝包围盒，不依赖设备 shape 声明。 */
function ObliqueSiteBounds({
  object
}: {
  object: MaterialObliqueObject
}): React.JSX.Element {
  return (
    <>
      {object.siteBounds.map((site) => (
        <g
          key={site.id}
          className="material-oblique-object__plan"
          transform={`matrix(${planeTransform(
            object,
            site.poseInAnchor.positionMm[2]
          ).join(' ')})`}
        >
          <ObliqueSite site={site} />
        </g>
      ))}
      {object.siteBounds.map((site) => {
        const transform = planeTransform(
          object,
          site.poseInAnchor.positionMm[2]
        )
        return (
          <ObliqueSiteLabel
            key={`label-${site.id}`}
            site={site}
            transform={transform}
          />
        )
      })}
    </>
  )
}

/** Upright cylinder in local mm: turned wall silhouette plus its top face. */
function ObliqueCylinder({
  centerX,
  centerY,
  className,
  from,
  object,
  radiusMm,
  to
}: {
  centerX: number
  centerY: number
  className: string
  from: number
  object: MaterialObliqueObject
  radiusMm: number
  to: number
}): React.JSX.Element {
  const sweep = frontSweepSign(object.topTransform)
  const startAngle =
    Math.atan2(object.topTransform[2], object.topTransform[0]) + Math.PI

  return (
    <g className={className}>
      <polygon
        className="material-oblique-object__front"
        points={pointsAttr(
          latheOutline({
            object,
            rings: [
              { zMm: from, radiusMm },
              { zMm: to, radiusMm }
            ],
            centerX,
            centerY,
            startAngle,
            sweep
          })
        )}
      />
      <polygon
        className="material-oblique-object__top"
        points={pointsAttr(
          arcPoints(
            planeTransform(object, to),
            centerX,
            centerY,
            radiusMm,
            startAngle,
            startAngle + 2 * Math.PI,
            44
          )
        )}
      />
    </g>
  )
}

/** Axis-aligned box given by two local corners, drawn front, side then top. */
function ObliqueBox({
  className,
  from,
  object,
  to
}: {
  className: string
  from: readonly [number, number, number]
  object: MaterialObliqueObject
  to: readonly [number, number, number]
}): React.JSX.Element {
  const corner = (x: number, y: number, z: number): ObliquePoint =>
    applyAffinePoint(planeTransform(object, z), x, y)
  const [x0, y0, z0] = from
  const [x1, y1, z1] = to

  return (
    <g className={className}>
      <polygon
        className="material-oblique-object__front"
        points={pointsAttr([
          corner(x0, y0, z0),
          corner(x1, y0, z0),
          corner(x1, y0, z1),
          corner(x0, y0, z1)
        ])}
      />
      <polygon
        className="material-oblique-object__side"
        points={pointsAttr([
          corner(x1, y0, z0),
          corner(x1, y1, z0),
          corner(x1, y1, z1),
          corner(x1, y0, z1)
        ])}
      />
      <polygon
        className="material-oblique-object__top"
        points={pointsAttr([
          corner(x0, y0, z1),
          corner(x1, y0, z1),
          corner(x1, y1, z1),
          corner(x0, y1, z1)
        ])}
      />
    </g>
  )
}

/** Box slice between two local heights, drawn as front, side and top faces. */
function ObliqueSlab({
  className,
  from,
  object,
  to
}: {
  className: string
  from: number
  object: MaterialObliqueObject
  to: number
}): React.JSX.Element {
  const lower = planeAtHeight(object.base, from)
  const upper = planeAtHeight(object.base, to)

  return (
    <g className={className}>
      <polygon
        className="material-oblique-object__front"
        points={pointsAttr([lower[0], lower[1], upper[1], upper[0]])}
      />
      <polygon
        className="material-oblique-object__side"
        points={pointsAttr([lower[1], lower[2], upper[2], upper[1]])}
      />
      <polygon
        className="material-oblique-object__top"
        points={pointsAttr(upper)}
      />
    </g>
  )
}

/**
 * 回转体：把轮廓采样成一圈圈半径再缝成一条剪影，肩部曲线因此是光滑的、
 * body 上不会横着接缝。烧杯、试剂瓶、注粉瓶都是它。
 */
function ObliqueLathe({
  object,
  primitive
}: {
  object: MaterialObliqueObject
  primitive: Extract<MaterialShapePrimitive, { kind: 'lathe' }>
}): React.JSX.Element {
  const {
    centerXMm,
    centerYMm,
    radiusMm,
    fromZMm,
    toZMm,
    rings,
    cap
  } = primitive
  const sweep = frontSweepSign(object.topTransform)
  const startAngle =
    Math.atan2(object.topTransform[2], object.topTransform[0]) + Math.PI
  const span = toZMm - fromZMm
  const resolve = (ring: { z: number; r: number }): LatheRing => ({
    zMm: fromZMm + span * ring.z,
    radiusMm: radiusMm * ring.r
  })
  const lathe = (source: readonly { z: number; r: number }[]): ObliquePoint[] =>
    latheOutline({
      object,
      rings: source.map(resolve),
      centerX: centerXMm,
      centerY: centerYMm,
      startAngle,
      sweep
    })

  const mouth = resolve(rings[rings.length - 1])
  const mouthTransform = planeTransform(object, mouth.zMm)
  const capRings = cap ?? []

  return (
    <g className={`material-oblique-part material-oblique-part--${primitive.style}`}>
      <polygon
        className="material-oblique-lathe__wall"
        points={pointsAttr(lathe(rings))}
      />
      {capRings.length > 1 && (
        <>
          <polygon
            className="material-oblique-lathe__cap"
            points={pointsAttr(lathe(capRings))}
          />
          {ribAngles(startAngle, sweep, primitive.ribs).map(
            (angle, index) => {
              const capBottom = resolve(capRings[0])
              const from = circlePoint(
                planeTransform(object, capBottom.zMm),
                centerXMm,
                centerYMm,
                capBottom.radiusMm,
                angle
              )
              const to = circlePoint(
                mouthTransform,
                centerXMm,
                centerYMm,
                mouth.radiusMm,
                angle
              )
              return (
                <line
                  key={`rib-${index}`}
                  className="material-oblique-lathe__rib"
                  x1={from[0]}
                  y1={from[1]}
                  x2={to[0]}
                  y2={to[1]}
                  vectorEffect="non-scaling-stroke"
                />
              )
            }
          )}
        </>
      )}
      {primitive.spout && (
        <polygon
          className="material-oblique-lathe__spout"
          points={pointsAttr(
            spoutOutline(
              mouthTransform,
              centerXMm,
              centerYMm,
              mouth.radiusMm,
              span
            )
          )}
        />
      )}
      {primitive.mouth && (
        <g transform={`matrix(${mouthTransform.join(' ')})`}>
          <circle
            className="material-oblique-lathe__mouth"
            cx={centerXMm}
            cy={centerYMm}
            r={mouth.radiusMm}
            vectorEffect="non-scaling-stroke"
          />
          {primitive.rim && (
            <circle
              className="material-oblique-lathe__rim"
              cx={centerXMm}
              cy={centerYMm}
              r={mouth.radiusMm * 0.88}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </g>
      )}
    </g>
  )
}

/** 板仓/堆栈塔：立柱 + 每个位点一层层板，占用状态画在层板上。 */
