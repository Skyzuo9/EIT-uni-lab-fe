import type { MaterialObliqueObject, ObliquePoint } from './projection'
import type { MaterialShapePrimitive } from './shapeSpec'
import {
  circlePoint,
  frontSweepSign,
  latheOutline,
  planeTransform,
  pointsAttr,
  ribAngles,
  spoutOutline,
  type LatheRing
} from './obliqueGeometry'

/**
 * 回转体：把轮廓采样成一圈圈半径再缝成一条剪影，肩部曲线因此是光滑的、
 * body 上不会横着接缝。烧杯、试剂瓶、注粉瓶都是它。
 */
export function ObliqueLathe({
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
