import type { MaterialObliqueObject, ObliquePoint } from './projection'
import { ObliqueSite, ObliqueSiteLabel } from './ObliqueStackAndSites'
import {
  applyAffinePoint,
  clamp,
  dropPoint,
  elevatePoint,
  planeAtHeight,
  planeTransform,
  pointsAttr
} from './obliqueGeometry'

/**
 * Open-front racks (beaker/reagent stacks, tip warehouses) are drawn as a
 * frame: rear and side panels plus one board per slot level. The front stays
 * open, so the vessels standing on each board remain visible.
 */
export function ObliqueOpenRack({
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
export function ObliqueSiteHoles({
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
export function ObliqueSiteBounds({
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
