import type { CSSProperties } from 'react'

import { projectObliquePoint, type ObliquePoint } from './projection'
import {
  resolveShapePrimitives,
  type MaterialShapePrimitive,
  type MaterialShapeSpec
} from './shapeSpec'

interface MaterialShapeThumbnailProps {
  shape: MaterialShapeSpec
  className?: string
  style?: CSSProperties
}

interface Envelope {
  widthMm: number
  depthMm: number
  heightMm: number
}

/**
 * 把 Registry 注册的 2.5D 外形声明缩放为可嵌入节点的小型 SVG。
 * 组件只解释通用图元，不按资源模板（ResourceTemplate）名称写死图形。
 */
export function MaterialShapeThumbnail({
  shape,
  className,
  style
}: MaterialShapeThumbnailProps): React.JSX.Element {
  const envelope = shapeEnvelope(shape)
  const primitives = resolveShapePrimitives(shape, envelope)
  const project = thumbnailProjector(envelope)

  return (
    <svg
      aria-label={`${shape.displayName || shape.id} 2.5D 外形`}
      className={className}
      data-material-shape-id={shape.id}
      data-material-shape-source="registry"
      focusable="false"
      role="img"
      style={style}
      viewBox="0 0 48 48"
    >
      <g
        fill="currentColor"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.25"
      >
        {primitives.map((primitive, index) => (
          <ThumbnailPrimitive
            key={`${primitive.kind}-${index}`}
            envelope={envelope}
            primitive={primitive}
            project={project}
          />
        ))}
      </g>
    </svg>
  )
}

function ThumbnailPrimitive({
  primitive,
  envelope,
  project
}: {
  primitive: MaterialShapePrimitive
  envelope: Envelope
  project: (point: readonly [number, number, number]) => ObliquePoint
}): React.JSX.Element | null {
  switch (primitive.kind) {
    case 'box':
      return <BoxPrimitive from={primitive.from} to={primitive.to} project={project} />
    case 'slab':
      return (
        <BoxPrimitive
          from={[0, 0, primitive.fromZMm]}
          to={[envelope.widthMm, envelope.depthMm, primitive.toZMm]}
          project={project}
        />
      )
    case 'cylinder':
      return (
        <LathePrimitive
          centerX={primitive.centerXMm}
          centerY={primitive.centerYMm}
          fromZ={primitive.fromZMm}
          project={project}
          radius={primitive.radiusMm}
          rings={[{ z: 0, r: 1 }, { z: 1, r: 1 }]}
          toZ={primitive.toZMm}
        />
      )
    case 'lathe':
      return (
        <LathePrimitive
          centerX={primitive.centerXMm}
          centerY={primitive.centerYMm}
          fromZ={primitive.fromZMm}
          project={project}
          radius={primitive.radiusMm}
          rings={primitive.rings}
          toZ={primitive.toZMm}
        />
      )
    case 'disc': {
      const center = project([
        primitive.centerXMm,
        primitive.centerYMm,
        primitive.zMm
      ])
      const edge = project([
        primitive.centerXMm + primitive.radiusMm,
        primitive.centerYMm,
        primitive.zMm
      ])
      return (
        <ellipse
          cx={center[0]}
          cy={center[1]}
          fillOpacity="0.2"
          rx={Math.abs(edge[0] - center[0])}
          ry={Math.max(Math.abs(edge[0] - center[0]) * 0.26, 0.8)}
        />
      )
    }
    case 'rect':
      return (
        <polygon
          fillOpacity="0.2"
          points={points([
            project([primitive.xMm, primitive.yMm, primitive.zMm]),
            project([
              primitive.xMm + primitive.widthMm,
              primitive.yMm,
              primitive.zMm
            ]),
            project([
              primitive.xMm + primitive.widthMm,
              primitive.yMm + primitive.depthMm,
              primitive.zMm
            ]),
            project([
              primitive.xMm,
              primitive.yMm + primitive.depthMm,
              primitive.zMm
            ])
          ])}
        />
      )
    case 'edge': {
      const from = project(primitive.from)
      const to = project(primitive.to)
      return <line x1={from[0]} x2={to[0]} y1={from[1]} y2={to[1]} />
    }
    default:
      return null
  }
}

function BoxPrimitive({
  from,
  to,
  project
}: {
  from: readonly [number, number, number]
  to: readonly [number, number, number]
  project: (point: readonly [number, number, number]) => ObliquePoint
}): React.JSX.Element {
  const [x0, y0, z0] = from
  const [x1, y1, z1] = to
  const base = [
    project([x0, y0, z0]),
    project([x1, y0, z0]),
    project([x1, y1, z0]),
    project([x0, y1, z0])
  ] as const
  const top = [
    project([x0, y0, z1]),
    project([x1, y0, z1]),
    project([x1, y1, z1]),
    project([x0, y1, z1])
  ] as const
  return (
    <>
      <polygon fillOpacity="0.13" points={points([base[0], base[1], top[1], top[0]])} />
      <polygon fillOpacity="0.25" points={points([base[1], base[2], top[2], top[1]])} />
      <polygon fillOpacity="0.38" points={points(top)} />
    </>
  )
}

function LathePrimitive({
  centerX,
  centerY,
  fromZ,
  toZ,
  radius,
  rings,
  project
}: {
  centerX: number
  centerY: number
  fromZ: number
  toZ: number
  radius: number
  rings: readonly { z: number; r: number }[]
  project: (point: readonly [number, number, number]) => ObliquePoint
}): React.JSX.Element {
  const ringPoints = rings.map((ring) => ({
    z: fromZ + (toZ - fromZ) * ring.z,
    radius: radius * ring.r
  }))
  const left = ringPoints.map((ring) =>
    project([centerX - ring.radius, centerY, ring.z])
  )
  const right = [...ringPoints].reverse().map((ring) =>
    project([centerX + ring.radius, centerY, ring.z])
  )
  const topRing = ringPoints.at(-1) ?? { z: toZ, radius }
  const topCenter = project([centerX, centerY, topRing.z])
  const topEdge = project([centerX + topRing.radius, centerY, topRing.z])
  return (
    <>
      <polygon fillOpacity="0.24" points={points([...left, ...right])} />
      <ellipse
        cx={topCenter[0]}
        cy={topCenter[1]}
        fillOpacity="0.12"
        rx={Math.abs(topEdge[0] - topCenter[0])}
        ry={Math.max(Math.abs(topEdge[0] - topCenter[0]) * 0.24, 0.7)}
      />
    </>
  )
}

function thumbnailProjector(
  envelope: Envelope
): (point: readonly [number, number, number]) => ObliquePoint {
  const corners = [
    [0, 0, 0],
    [envelope.widthMm, 0, 0],
    [envelope.widthMm, envelope.depthMm, 0],
    [0, envelope.depthMm, 0],
    [0, 0, envelope.heightMm],
    [envelope.widthMm, 0, envelope.heightMm],
    [envelope.widthMm, envelope.depthMm, envelope.heightMm],
    [0, envelope.depthMm, envelope.heightMm]
  ].map((point) => projectObliquePoint(point as [number, number, number]))
  const minX = Math.min(...corners.map((point) => point[0]))
  const maxX = Math.max(...corners.map((point) => point[0]))
  const minY = Math.min(...corners.map((point) => point[1]))
  const maxY = Math.max(...corners.map((point) => point[1]))
  const scale = Math.min(40 / Math.max(maxX - minX, 1), 40 / Math.max(maxY - minY, 1))
  const offsetX = 24 - ((minX + maxX) / 2) * scale
  const offsetY = 24 - ((minY + maxY) / 2) * scale
  return (point) => {
    const projected = projectObliquePoint(point)
    return [projected[0] * scale + offsetX, projected[1] * scale + offsetY]
  }
}

function shapeEnvelope(shape: MaterialShapeSpec): Envelope {
  const [widthMm, depthMm, heightMm] = shape.envelopeMm ?? [100, 100, 100]
  return {
    widthMm: Math.max(widthMm, 1),
    depthMm: Math.max(depthMm, 1),
    heightMm: Math.max(heightMm, 1)
  }
}

function points(values: readonly ObliquePoint[]): string {
  return values.map((point) => `${point[0]},${point[1]}`).join(' ')
}
