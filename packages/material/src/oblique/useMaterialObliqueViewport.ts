import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type SetStateAction,
  type WheelEvent
} from 'react'

import {
  DEFAULT_VIEWPORT,
  MAX_CAMERA_ZOOM,
  MIN_CAMERA_ZOOM,
  cameraViewBox,
  fitCamera,
  fittedViewBox,
  type ObliqueCamera,
  type ObliqueViewBox,
  type ViewportSize
} from './obliqueCamera'
import { clamp, normalizeRotation } from './obliqueGeometry'

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

interface ObliqueBounds {
  minX: number
  minY: number
  width: number
  height: number
}

interface MaterialObliqueViewport {
  canvasRef: RefObject<HTMLDivElement | null>
  svgRef: RefObject<SVGSVGElement | null>
  suppressCanvasClickRef: RefObject<boolean>
  viewport: ViewportSize
  camera: ObliqueCamera
  viewBoxValue: string
  semanticZoom: 'overview' | 'detail' | 'inspect'
  isPanning: boolean
  isRotating: boolean
  fitAll: () => void
  rotateBy: (deltaDeg: number) => void
  changeZoom: (factor: number) => void
  setCamera: Dispatch<SetStateAction<ObliqueCamera>>
  handleWheel: (event: WheelEvent<SVGSVGElement>) => void
  handlePointerDown: (event: ReactPointerEvent<SVGSVGElement>) => void
  handlePointerMove: (event: ReactPointerEvent<SVGSVGElement>) => void
  finishInteraction: (event: ReactPointerEvent<SVGSVGElement>) => void
}

const DRAG_ROTATION_RANGE_DEG = 180

/**
 * 维护物料（Material）2.5D 画布的相机、尺寸和指针交互。
 *
 * @param bounds 当前旋转投影后的场景边界。
 * @param rotationDeg 当前环绕角度。
 * @param setRotationDeg 环绕角度写入口。
 * @returns 相机状态、视图引用和可直接绑定到 SVG 的交互回调。
 * @safety 只改变前端视图状态，不修改物料权威事实或库位占用（SiteOccupancy）。
 */
export function useMaterialObliqueViewport(
  bounds: ObliqueBounds,
  rotationDeg: number,
  setRotationDeg: Dispatch<SetStateAction<number>>
): MaterialObliqueViewport {
  const [viewport, setViewport] = useState<ViewportSize>(DEFAULT_VIEWPORT)
  const [camera, setCamera] = useState<ObliqueCamera>(() => fitCamera(bounds))
  const [isPanning, setIsPanning] = useState(false)
  const [isRotating, setIsRotating] = useState(false)
  const canvasRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const suppressCanvasClickRef = useRef(false)
  const viewBox = useMemo(
    () => cameraViewBox(bounds, viewport, camera),
    [bounds, camera, viewport]
  )
  const viewBoxValue = [
    viewBox.minX,
    viewBox.minY,
    viewBox.width,
    viewBox.height
  ].join(' ')
  const semanticZoom = camera.zoom < 1.45
    ? 'overview'
    : camera.zoom < 2.8
      ? 'detail'
      : 'inspect'

  useEffect(() => {
    setCamera((current) => ({
      centerX: bounds.minX + bounds.width / 2,
      centerY: bounds.minY + bounds.height / 2,
      zoom: current.zoom
    }))
  }, [bounds.height, bounds.minX, bounds.minY, bounds.width])

  useEffect(() => {
    const element = canvasRef.current
    if (!element || typeof ResizeObserver === 'undefined') return
    /** 把宿主尺寸投影为相机可用的画布 viewport。 */
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

  /** 让相机重新适配全部场景边界。 */
  const fitAll = useCallback((): void => {
    setCamera(fitCamera(bounds))
  }, [bounds])

  /** 按给定角度增量旋转 2.5D 视角。 */
  const rotateBy = useCallback((deltaDeg: number): void => {
    setRotationDeg((current) => normalizeRotation(current + deltaDeg))
  }, [setRotationDeg])

  /** 按倍率缩放相机并限制在稳定范围。 */
  const changeZoom = useCallback((factor: number): void => {
    setCamera((current) => ({
      ...current,
      zoom: clamp(current.zoom * factor, MIN_CAMERA_ZOOM, MAX_CAMERA_ZOOM)
    }))
  }, [])

  /** 以鼠标位置为锚点处理滚轮缩放。 */
  const handleWheel = (event: WheelEvent<SVGSVGElement>): void => {
    if (!svgRef.current) return
    event.preventDefault()
    const rect = svgRef.current.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    const ratioX = clamp((event.clientX - rect.left) / rect.width, 0, 1)
    const ratioY = clamp((event.clientY - rect.top) / rect.height, 0, 1)
    const worldX = viewBox.minX + viewBox.width * ratioX
    const worldY = viewBox.minY + viewBox.height * ratioY
    const nextZoom = clamp(
      camera.zoom * (event.deltaY < 0 ? 1.18 : 1 / 1.18),
      MIN_CAMERA_ZOOM,
      MAX_CAMERA_ZOOM
    )
    const nextBase = fittedViewBox(bounds, viewport)
    const nextWidth = nextBase.width / nextZoom
    const nextHeight = nextBase.height / nextZoom
    setCamera({
      centerX: worldX - (ratioX - 0.5) * nextWidth,
      centerY: worldY - (ratioY - 0.5) * nextHeight,
      zoom: nextZoom
    })
  }

  /** 启动左键旋转或 Shift/中键平移手势。 */
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

  /** 把指针位移转换为环绕旋转或视图平移。 */
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
      setRotationDeg(normalizeRotation(
        drag.rotationDeg + (deltaX / rect.width) * DRAG_ROTATION_RANGE_DEG
      ))
      return
    }
    setCamera({
      ...drag.camera,
      centerX: drag.camera.centerX
        - (deltaX / rect.width) * drag.viewBox.width,
      centerY: drag.camera.centerY
        - (deltaY / rect.height) * drag.viewBox.height
    })
  }

  /** 结束旋转或平移，并阻止拖拽结束后的误选择。 */
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

  return {
    canvasRef,
    svgRef,
    suppressCanvasClickRef,
    viewport,
    camera,
    viewBoxValue,
    semanticZoom,
    isPanning,
    isRotating,
    fitAll,
    rotateBy,
    changeZoom,
    setCamera,
    handleWheel,
    handlePointerDown,
    handlePointerMove,
    finishInteraction
  }
}
