import AimOutlined from '@ant-design/icons/AimOutlined'
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent
} from 'react'

import type {
  MaterialAggregate,
  MaterialId
} from '../types'
import type { MaterialTransferOverlayRoute } from '../materialTransferOverlay'
import { shouldShowMaterialLabelByDefault } from '../labelPresentation'
import { materialScopeClassName } from '../materialStyles'
import {
  buildMaterialObliqueScene,
  projectObliquePoint,
  type MaterialObliqueObject,
} from './projection'
import type {
  MaterialShapeLibrary
} from './shapeSpec'
import { CanvasLegend } from './CanvasLegend'
import { MaterialObliqueControls } from './MaterialObliqueControls'
import { ObliqueMaterial } from './ObliqueMaterialObject'
import {
  DEFAULT_VIEWPORT,
  MAX_CAMERA_ZOOM,
  MIN_CAMERA_ZOOM,
  cameraViewBox,
  fitCamera,
  fittedViewBox,
  focusCamera,
  formatMm,
  landmarkLabelOffsets,
  selectLandmarkIds,
  type ObliqueCamera,
  type ObliqueViewBox,
  type ViewportSize
} from './obliqueCamera'
import { clamp, normalizeRotation } from './obliqueGeometry'

export interface MaterialObliqueCanvasProps {
  aggregates: readonly MaterialAggregate[]
  /**
   * 设备包声明的 2.5D 外形（Bridge 的 /api/v1/material-shapes）。缺省时所有
   * 物料退回实心包围盒——画布本身不认识任何具体设备。
   */
  shapes?: MaterialShapeLibrary
  showSites?: boolean
  materialTransferRoutes?: readonly MaterialTransferOverlayRoute[]
  selectedMaterialIds?: readonly MaterialId[]
  highlightedMaterialIds?: readonly MaterialId[]
  onSelectionChange?: (materialIds: readonly MaterialId[]) => void
}

interface DragState {
  pointerId: number
  mode: 'rotate' | 'pan'
  clientX: number
  clientY: number
  camera: ObliqueCamera
  rotationDeg: number
  viewBox: ObliqueViewBox
  moved: boolean
}

const LANDMARK_LIMIT = 7
const DRAG_ROTATION_RANGE_DEG = 180

/**
 * 渲染支持环绕旋转、平移与缩放的物料（Material）2.5D 斜投影视图。
 * @param props 物料聚合、外形声明、选中态与选择回调。
 * @returns 可访问且可交互的 SVG 物料投影视图。
 */
export function MaterialObliqueCanvas({
  aggregates,
  shapes,
  showSites = true,
  materialTransferRoutes = [],
  selectedMaterialIds = [],
  highlightedMaterialIds = [],
  onSelectionChange
}: MaterialObliqueCanvasProps): React.JSX.Element {
  const [rotationDeg, setRotationDeg] = useState(0)
  const scene = useMemo(
    () => buildMaterialObliqueScene(aggregates, shapes, rotationDeg),
    [aggregates, rotationDeg, shapes]
  )
  const projectedTransferRoutes = useMemo(
    () => materialTransferRoutes.map((route) => ({
      ...route,
      points: route.pointsMm.map((point) =>
        projectObliquePoint(point, rotationDeg)
      )
    })),
    [materialTransferRoutes, rotationDeg]
  )
  const [hoveredMaterialId, setHoveredMaterialId] =
    useState<MaterialId | null>(null)
  const [viewport, setViewport] =
    useState<ViewportSize>(DEFAULT_VIEWPORT)
  const [camera, setCamera] = useState<ObliqueCamera>(() =>
    fitCamera(scene.bounds)
  )
  const [isPanning, setIsPanning] = useState(false)
  const [isRotating, setIsRotating] = useState(false)
  const canvasRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const suppressCanvasClickRef = useRef(false)
  const instructionsId = useId()
  const selected = new Set(selectedMaterialIds)
  const highlighted = new Set(highlightedMaterialIds)
  const selectedObject = scene.objects.find((object) =>
    selected.has(object.materialId)
  )
  const landmarkIds = useMemo(
    () => selectLandmarkIds(scene.objects, LANDMARK_LIMIT),
    [scene.objects]
  )
  const landmarkOffsets = useMemo(
    () => landmarkLabelOffsets(scene.objects, landmarkIds),
    [landmarkIds, scene.objects]
  )
  const viewBox = useMemo(
    () => cameraViewBox(scene.bounds, viewport, camera),
    [camera, scene.bounds, viewport]
  )
  const viewBoxValue = [
    viewBox.minX,
    viewBox.minY,
    viewBox.width,
    viewBox.height
  ].join(' ')
  const semanticZoom =
    camera.zoom < 1.45
      ? 'overview'
      : camera.zoom < 2.8
        ? 'detail'
        : 'inspect'

  useEffect(() => {
    setCamera((current) => ({
      centerX: scene.bounds.minX + scene.bounds.width / 2,
      centerY: scene.bounds.minY + scene.bounds.height / 2,
      zoom: current.zoom
    }))
  }, [
    scene.bounds.height,
    scene.bounds.minX,
    scene.bounds.minY,
    scene.bounds.width
  ])

  useEffect(() => {
    const element = canvasRef.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const update = (): void => {
      const rect = element.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      setViewport({ width: rect.width, height: rect.height })
    }
    const observer = new ResizeObserver(update)
    observer.observe(element)
    update()
    return () => observer.disconnect()
  }, [])

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

  const fitAll = useCallback(() => {
    setCamera(fitCamera(scene.bounds))
  }, [scene.bounds])

  /**
   * 在保留缩放级别的前提下按给定角度旋转 2.5D 视角。
   * @param deltaDeg 本次视角旋转增量，单位为度。
   * @returns 无返回值。
   */
  const rotateBy = useCallback((deltaDeg: number): void => {
    setRotationDeg((current) => normalizeRotation(current + deltaDeg))
  }, [])

  const changeZoom = useCallback((factor: number) => {
    setCamera((current) => ({
      ...current,
      zoom: clamp(
        current.zoom * factor,
        MIN_CAMERA_ZOOM,
        MAX_CAMERA_ZOOM
      )
    }))
  }, [])

  const focusObject = useCallback(
    (object: MaterialObliqueObject | undefined) => {
      if (!object) return
      setCamera(focusCamera(scene.bounds, viewport, object))
    },
    [scene.bounds, viewport]
  )

  const handleWheel = (event: WheelEvent<SVGSVGElement>): void => {
    if (!svgRef.current) return
    event.preventDefault()
    const rect = svgRef.current.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    const ratioX = clamp(
      (event.clientX - rect.left) / rect.width,
      0,
      1
    )
    const ratioY = clamp(
      (event.clientY - rect.top) / rect.height,
      0,
      1
    )
    const worldX = viewBox.minX + viewBox.width * ratioX
    const worldY = viewBox.minY + viewBox.height * ratioY
    const nextZoom = clamp(
      camera.zoom * (event.deltaY < 0 ? 1.18 : 1 / 1.18),
      MIN_CAMERA_ZOOM,
      MAX_CAMERA_ZOOM
    )
    const nextBase = fittedViewBox(scene.bounds, viewport)
    const nextWidth = nextBase.width / nextZoom
    const nextHeight = nextBase.height / nextZoom
    setCamera({
      centerX: worldX - (ratioX - 0.5) * nextWidth,
      centerY: worldY - (ratioY - 0.5) * nextHeight,
      zoom: nextZoom
    })
  }

  /**
   * 启动 2.5D 指针交互；左键默认旋转，Shift+左键或中键平移。
   * @param event SVG 指针按下事件。
   * @returns 无返回值。
   */
  const handlePointerDown = (
    event: ReactPointerEvent<SVGSVGElement>
  ): void => {
    if (event.button !== 0 && event.button !== 1) return
    const mode = event.shiftKey || event.button === 1 ? 'pan' : 'rotate'
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      mode,
      clientX: event.clientX,
      clientY: event.clientY,
      camera,
      rotationDeg,
      viewBox,
      moved: false
    }
    setIsPanning(mode === 'pan')
    setIsRotating(mode === 'rotate')
  }

  /**
   * 把指针位移转换为环绕旋转或视图平移。
   * @param event SVG 指针移动事件。
   * @returns 无返回值。
   */
  const handlePointerMove = (
    event: ReactPointerEvent<SVGSVGElement>
  ): void => {
    const drag = dragRef.current
    const svg = svgRef.current
    if (!drag || drag.pointerId !== event.pointerId || !svg) return
    const rect = svg.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    const deltaX = event.clientX - drag.clientX
    const deltaY = event.clientY - drag.clientY
    if (Math.abs(deltaX) + Math.abs(deltaY) > 3) drag.moved = true
    if (drag.mode === 'rotate') {
      setRotationDeg(
        normalizeRotation(
          drag.rotationDeg +
            (deltaX / rect.width) * DRAG_ROTATION_RANGE_DEG
        )
      )
      return
    }
    setCamera({
      ...drag.camera,
      centerX:
        drag.camera.centerX - (deltaX / rect.width) * drag.viewBox.width,
      centerY:
        drag.camera.centerY - (deltaY / rect.height) * drag.viewBox.height
    })
  }

  /**
   * 结束旋转或平移并阻止拖拽后的误选择。
   * @param event SVG 指针结束事件。
   * @returns 无返回值。
   */
  const finishInteraction = (
    event: ReactPointerEvent<SVGSVGElement>
  ): void => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    suppressCanvasClickRef.current = drag.moved
    dragRef.current = null
    setIsPanning(false)
    setIsRotating(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  return (
    <div
      ref={canvasRef}
      className={materialScopeClassName('material-oblique-canvas')}
      aria-label="实验室 2.5D 物料操作视图"
      aria-describedby={instructionsId}
      data-camera-rotation={rotationDeg.toFixed(2)}
      data-camera-zoom={camera.zoom.toFixed(2)}
      data-material-oblique-view
      data-site-layer-visible={showSites}
      data-semantic-zoom={semanticZoom}
      role="region"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        onSelectionChange?.([])
      }}
    >
      <MaterialObliqueControls
        objectCount={scene.objects.length}
        rotationDeg={rotationDeg}
        camera={camera}
        selectedObject={selectedObject}
        onRotate={rotateBy}
        onZoom={changeZoom}
        onFitAll={fitAll}
        onFocus={focusObject}
      />
      <p id={instructionsId} className="material-oblique-canvas__sr-only">
        滚轮缩放，左右拖动画布旋转，按住 Shift 拖动可平移，回车或空格选择物料，按
        Escape 清除选择，按 Control 或 Command 可多选。
      </p>
      {scene.diagnostics.invalidObjectCount > 0 ? (
        <div
          className="material-oblique-canvas__coverage"
          role="status"
          aria-live="polite"
        >
          <span className="is-invalid">
            坐标异常 {scene.diagnostics.invalidObjectCount}
          </span>
        </div>
      ) : null}
      {selectedObject ? (
        <div
          className="material-oblique-canvas__selection"
          aria-live="polite"
        >
          <div>
            <strong>{selectedObject.name}</strong>
            <span>{selectedObject.code}</span>
          </div>
          <span className="material-oblique-canvas__coordinates">
            X {formatMm(selectedObject.pose.positionMm[0])} · Y{' '}
            {formatMm(selectedObject.pose.positionMm[1])} · Z{' '}
            {formatMm(selectedObject.pose.positionMm[2])} mm
          </span>
          {selectedMaterialIds.length > 1 ? (
            <span>已选 {selectedMaterialIds.length} 项</span>
          ) : null}
          <button type="button" onClick={() => focusObject(selectedObject)}>
            <AimOutlined aria-hidden="true" />
            定位
          </button>
        </div>
      ) : null}
      {scene.objects.length === 0 ? (
        <div className="material-oblique-canvas__empty">
          <strong>当前物料图没有可展示对象</strong>
          <span>
            请确认物料图已加载，并检查对象坐标与尺寸是否完整。
          </span>
        </div>
      ) : (
        <svg
          ref={svgRef}
          aria-label="实验室 2.5D 物料视图"
          className="material-oblique-canvas__svg"
          data-panning={isPanning || undefined}
          data-rotating={isRotating || undefined}
          preserveAspectRatio="none"
          role="group"
          viewBox={viewBoxValue}
          onClick={() => {
            if (suppressCanvasClickRef.current) {
              suppressCanvasClickRef.current = false
              return
            }
            onSelectionChange?.([])
          }}
          onPointerCancel={finishInteraction}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishInteraction}
          onWheel={handleWheel}
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
            const isLandmark = landmarkIds.has(object.materialId)
            const showTag =
              isSelected ||
              isHighlighted ||
              isHovered ||
              (semanticZoom === 'overview' && isLandmark) ||
              (semanticZoom === 'detail' &&
                shouldShowMaterialLabelByDefault(object.kind)) ||
              semanticZoom === 'inspect'
            return (
              <ObliqueMaterial
                key={object.materialId}
                object={object}
                selected={isSelected}
                highlighted={isHighlighted}
                showSites={showSites}
                labelScale={1 / camera.zoom}
                labelOffsetY={landmarkOffsets.get(object.materialId) ?? 0}
                showTag={showTag}
                onClick={(event) => {
                  if (suppressCanvasClickRef.current) {
                    suppressCanvasClickRef.current = false
                    return
                  }
                  event.stopPropagation()
                  event.currentTarget.focus()
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
          <MaterialTransferOverlay routes={projectedTransferRoutes} />
        </svg>
      )}
      <CanvasLegend />
    </div>
  )
}

function MaterialTransferOverlay({
  routes
}: {
  routes: readonly (MaterialTransferOverlayRoute & {
    points: readonly (readonly [number, number])[]
  })[]
}): React.JSX.Element | null {
  if (routes.length === 0) return null
  return (
    <g className="material-oblique-transfer-layer">
      <defs>
        {routes.map((route, index) => (
          <marker
            key={route.id}
            id={`material-oblique-transfer-arrow-${index}`}
            markerHeight="7"
            markerWidth="7"
            orient="auto-start-reverse"
            refX="6"
            refY="3.5"
            viewBox="0 0 7 7"
          >
            <path d="M0 0 7 3.5 0 7Z" fill={route.accent} />
          </marker>
        ))}
      </defs>
      {routes.map((route, index) => {
        const first = route.points[0]
        const last = route.points[route.points.length - 1]
        if (!first || !last || route.points.length < 2) return null
        return (
          <g
            key={route.id}
            aria-label={`${route.label}：${route.sourceLabel} 到 ${route.targetLabel}`}
            data-material-transfer-route={route.id}
            data-transfer-status={route.status}
            role="img"
          >
            <title>{`${route.label} · ${route.sourceLabel} → ${route.targetLabel}`}</title>
            <polyline
              className="material-oblique-transfer-route__halo"
              fill="none"
              points={route.points.map((point) => point.join(',')).join(' ')}
            />
            <polyline
              className="material-oblique-transfer-route"
              fill="none"
              markerEnd={`url(#material-oblique-transfer-arrow-${index})`}
              points={route.points.map((point) => point.join(',')).join(' ')}
              stroke={route.accent}
              strokeDasharray={
                route.status === 'planned' || route.status === 'pending'
                  ? '10 8'
                  : undefined
              }
            />
            <circle
              className="material-oblique-transfer-route__endpoint"
              cx={first[0]}
              cy={first[1]}
              fill={route.accent}
              r="5"
            />
            <circle
              className="material-oblique-transfer-route__endpoint"
              cx={last[0]}
              cy={last[1]}
              fill={route.accent}
              r="5"
            />
          </g>
        )
      })}
    </g>
  )
}
