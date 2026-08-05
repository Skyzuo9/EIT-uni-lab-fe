import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  type Mesh,
  Quaternion,
  Vector3
} from 'three'

import type {
  LabMaterialTransferLayerNode,
  LabMaterialTransferRoute,
  LabMaterialTransferStatus
} from '../schema'

const ROUTE_COLORS: Readonly<Record<LabMaterialTransferStatus, string>> = {
  planned: '#4f46e5',
  pending: '#64748b',
  running: '#f59e0b',
  succeeded: '#16a34a',
  failed: '#dc2626',
  canceled: '#64748b',
  attention: '#dc2626'
}

export default function MaterialTransferLayerRenderer({
  node
}: {
  node: LabMaterialTransferLayerNode
}): React.JSX.Element | null {
  const [hoveredRouteId, setHoveredRouteId] = useState<string | null>(null)
  const markers = useMemo(() => uniqueMarkers(node.routes), [node.routes])

  if (node.visible === false || node.routes.length === 0) return null
  return (
    <group
      name={node.id}
      userData={{
        routeCount: node.routes.length,
        unresolvedRouteCount: node.unresolvedRouteIds.length
      }}
    >
      {node.routes.map((route) => (
        <TransferRoute
          key={route.id}
          route={route}
          hovered={hoveredRouteId === route.id}
          onHover={setHoveredRouteId}
        />
      ))}
      {markers.map((marker) => (
        <SiteMarker key={marker.id} {...marker} />
      ))}
    </group>
  )
}

function TransferRoute({
  route,
  hovered,
  onHover
}: {
  route: LabMaterialTransferRoute
  hovered: boolean
  onHover: (routeId: string | null) => void
}): React.JSX.Element {
  const color = ROUTE_COLORS[route.status]
  const labelPosition = pointAlongPolyline(route.points, 0.52)
  const arrow = routeArrow(route.points)
  const showLabel = hovered || route.selected || route.status === 'running'
  return (
    <group
      name={route.id}
      userData={{
        workflowNodeUuid: route.workflowNodeUuid,
        executorId: route.executorId,
        status: route.status
      }}
      onPointerOver={(event) => {
        event.stopPropagation()
        onHover(route.id)
      }}
      onPointerOut={(event) => {
        event.stopPropagation()
        onHover(null)
      }}
    >
      {route.selected && (
        <RouteStroke
          points={route.points}
          color="#2563eb"
          radius={0.018}
          opacity={0.22}
          renderOrder={20}
        />
      )}
      <RouteStroke
        points={route.points}
        color={color}
        dashed={route.status === 'planned' || route.status === 'pending'}
        radius={route.selected || hovered ? 0.012 : 0.008}
        opacity={route.status === 'canceled' ? 0.5 : 0.9}
        renderOrder={21}
      />
      <mesh
        position={arrow.position}
        quaternion={arrow.quaternion}
        renderOrder={22}
      >
        <coneGeometry args={[0.035, 0.1, 12]} />
        <meshBasicMaterial color={color} depthTest={false} />
      </mesh>
      <RouteMotion route={route} color={color} />
      <Html position={labelPosition} center distanceFactor={8} zIndexRange={[70, 0]}>
        <div
          className={`pascal-transfer-executor${showLabel ? ' is-expanded' : ''}`}
          title={`执行器：${route.executorId}；${route.sourceSiteKey} 到 ${route.targetSiteKey}`}
        >
          <RobotArmIcon />
          {showLabel && (
            <span>
              <strong>{route.label}</strong>
              <small>{route.sourceSiteKey} → {route.targetSiteKey}</small>
            </span>
          )}
        </div>
      </Html>
    </group>
  )
}

function RouteStroke({
  points,
  color,
  dashed = false,
  radius,
  opacity,
  renderOrder
}: {
  points: readonly [number, number, number][]
  color: string
  dashed?: boolean
  radius: number
  opacity: number
  renderOrder: number
}): React.JSX.Element {
  const segments = polylineStrokeSegments(points, dashed)
  return (
    <group>
      {segments.map((segment, index) => (
        <mesh
          key={`${index}:${segment.start.join(',')}`}
          position={segment.position}
          quaternion={segment.quaternion}
          renderOrder={renderOrder}
        >
          <cylinderGeometry args={[radius, radius, segment.length, 8]} />
          <meshBasicMaterial
            color={color}
            depthTest={false}
            depthWrite={false}
            opacity={opacity}
            transparent={opacity < 1}
          />
        </mesh>
      ))}
    </group>
  )
}

interface StrokeSegment {
  start: [number, number, number]
  position: [number, number, number]
  quaternion: Quaternion
  length: number
}

/**
 * 生成 WebGPU/WebGL 都可用的路线网格段，避免依赖 LineMaterial。
 */
export function polylineStrokeSegments(
  points: readonly [number, number, number][],
  dashed: boolean,
  dashSize = 0.1,
  gapSize = 0.06
): StrokeSegment[] {
  const result: StrokeSegment[] = []
  for (let index = 1; index < points.length; index += 1) {
    const start = new Vector3(...points[index - 1])
    const end = new Vector3(...points[index])
    const direction = end.clone().sub(start)
    const totalLength = direction.length()
    if (totalLength === 0) continue
    direction.normalize()
    const step = dashed ? dashSize + gapSize : totalLength
    for (let distance = 0; distance < totalLength; distance += step) {
      const length = dashed
        ? Math.min(dashSize, totalLength - distance)
        : totalLength
      const segmentStart = start.clone().addScaledVector(direction, distance)
      const segmentEnd = segmentStart.clone().addScaledVector(direction, length)
      const position = segmentStart.clone().add(segmentEnd).multiplyScalar(0.5)
      result.push({
        start: [segmentStart.x, segmentStart.y, segmentStart.z],
        position: [position.x, position.y, position.z],
        quaternion: new Quaternion().setFromUnitVectors(
          new Vector3(0, 1, 0),
          direction
        ),
        length
      })
      if (!dashed) break
    }
  }
  return result
}

function SiteMarker({
  id,
  label,
  position
}: {
  id: string
  label: string
  position: [number, number, number]
}): React.JSX.Element {
  const [hovered, setHovered] = useState(false)
  return (
    <group position={position} name={`transfer-site-${id}`}>
      <mesh
        renderOrder={24}
        onPointerOver={(event) => {
          event.stopPropagation()
          setHovered(true)
        }}
        onPointerOut={(event) => {
          event.stopPropagation()
          setHovered(false)
        }}
      >
        <sphereGeometry args={[0.055, 18, 18]} />
        <meshBasicMaterial color="#0ea5e9" depthTest={false} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} renderOrder={23}>
        <torusGeometry args={[0.075, 0.009, 10, 24]} />
        <meshBasicMaterial
          color="#e0f2fe"
          depthTest={false}
          opacity={0.92}
          transparent
        />
      </mesh>
      {hovered && (
        <Html position={[0, 0.12, 0]} center distanceFactor={8} zIndexRange={[80, 0]}>
          <div className="pascal-transfer-site-label">库位 {label}</div>
        </Html>
      )}
    </group>
  )
}

function RouteMotion({
  route,
  color
}: {
  route: LabMaterialTransferRoute
  color: string
}): React.JSX.Element | null {
  const marker = useRef<Mesh>(null)
  const reducedMotion = usePrefersReducedMotion()
  useFrame(({ clock }) => {
    if (!marker.current || reducedMotion) return
    marker.current.position.set(
      ...pointAlongPolyline(route.points, (clock.elapsedTime * 0.24) % 1)
    )
  })
  if (route.status !== 'running' || reducedMotion) return null
  return (
    <mesh ref={marker} renderOrder={25}>
      <sphereGeometry args={[0.045, 14, 14]} />
      <meshBasicMaterial color={color} depthTest={false} />
    </mesh>
  )
}

export function pointAlongPolyline(
  points: readonly [number, number, number][],
  progress: number
): [number, number, number] {
  if (points.length === 0) return [0, 0, 0]
  if (points.length === 1) return [...points[0]]
  const segments = points.slice(1).map((point, index) => ({
    start: new Vector3(...points[index]),
    end: new Vector3(...point),
    length: new Vector3(...point).distanceTo(new Vector3(...points[index]))
  }))
  const total = segments.reduce((sum, segment) => sum + segment.length, 0)
  let remaining = Math.min(Math.max(progress, 0), 1) * total
  for (const segment of segments) {
    if (remaining <= segment.length || segment === segments.at(-1)) {
      const ratio = segment.length === 0 ? 0 : remaining / segment.length
      const point = segment.start.clone().lerp(segment.end, ratio)
      return [point.x, point.y, point.z]
    }
    remaining -= segment.length
  }
  return [...points[points.length - 1]]
}

function routeArrow(points: readonly [number, number, number][]): {
  position: [number, number, number]
  quaternion: Quaternion
} {
  const progress = 0.72
  const position = pointAlongPolyline(points, progress)
  const next = pointAlongPolyline(points, Math.min(progress + 0.015, 1))
  const direction = new Vector3(...next).sub(new Vector3(...position)).normalize()
  return {
    position,
    quaternion: new Quaternion().setFromUnitVectors(
      new Vector3(0, 1, 0),
      direction.lengthSq() > 0 ? direction : new Vector3(0, 1, 0)
    )
  }
}

function uniqueMarkers(routes: readonly LabMaterialTransferRoute[]): Array<{
  id: string
  label: string
  position: [number, number, number]
}> {
  const markers = new Map<string, {
    id: string
    label: string
    position: [number, number, number]
  }>()
  for (const route of routes) {
    const endpoints = [
      {
        id: `${route.sourceOwnerMaterialId}:${route.sourceSiteId}`,
        label: route.sourceSiteKey,
        position: route.points[0]
      },
      {
        id: `${route.targetOwnerMaterialId}:${route.targetSiteId}`,
        label: route.targetSiteKey,
        position: route.points[route.points.length - 1]
      }
    ]
    for (const endpoint of endpoints) markers.set(endpoint.id, endpoint)
  }
  return [...markers.values()]
}

/**
 * 渲染与工作流画布共用几何语言的细线机械臂执行器（Executor）图标。
 * 参数：无；图标不读取执行或物理状态。
 * 返回：包含底座、两级关节和末端夹爪的装饰性 SVG。
 */
export function RobotArmIcon(): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      data-executor-icon="precision-robot-arm"
      focusable="false"
      viewBox="0 0 48 48"
    >
      <path d="M13 39h22" />
      <path d="M17 39v-6h14v6" />
      <circle cx="19" cy="29" r="4" />
      <path d="m21.8 26.2 7.3-8.2" />
      <circle cx="31" cy="16" r="3.5" />
      <path d="m28.6 13.5-5.3-5.2" />
      <path d="M20.7 6h6v4.7" />
      <g data-robot-gripper="true">
        <path d="m34 16 4.2 3.4" />
        <path d="M38.2 19.4 41 17" />
        <path d="m38.2 19.4.7 3.7" />
      </g>
    </svg>
  )
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  )
  useEffect(() => {
    const query = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!query) return undefined
    const update = () => setReduced(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return reduced
}
