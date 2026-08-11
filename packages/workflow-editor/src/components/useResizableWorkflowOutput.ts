import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEventHandler,
  type PointerEventHandler
} from 'react'

const DEFAULT_OUTPUT_HEIGHT = 260
const MINIMUM_OUTPUT_HEIGHT = 180
const MAXIMUM_OUTPUT_HEIGHT = 720
const KEYBOARD_RESIZE_STEP = 24

interface ResizeOrigin {
  height: number
  pointerY: number
}

export interface ResizableWorkflowOutput {
  height: number
  minimum: number
  maximum: number
  resizing: boolean
  onPointerDown: PointerEventHandler<HTMLDivElement>
  onKeyDown: KeyboardEventHandler<HTMLDivElement>
  reset: () => void
}

/**
 * 按向上为正的屏幕坐标变化计算底部运行输出高度。
 *
 * @param startHeight 拖拽开始时的面板高度。
 * @param startPointerY 拖拽开始时的纵向屏幕坐标。
 * @param currentPointerY 当前纵向屏幕坐标。
 * @param minimum 当前布局允许的最小高度。
 * @param maximum 当前布局允许的最大高度。
 * @returns 已限制在可达范围内的新高度。
 */
export function resizedWorkflowOutputHeight(
  startHeight: number,
  startPointerY: number,
  currentPointerY: number,
  minimum: number,
  maximum: number
): number {
  return Math.min(
    maximum,
    Math.max(minimum, startHeight + startPointerY - currentPointerY)
  )
}

/**
 * 为运行输出提供指针、键盘和双击复位共用的确定性尺寸状态。
 *
 * @returns 可直接绑定到水平分隔条的状态和事件处理器。
 */
export function useResizableWorkflowOutput(): ResizableWorkflowOutput {
  const [height, setHeight] = useState(DEFAULT_OUTPUT_HEIGHT)
  const [maximum, setMaximum] = useState(MAXIMUM_OUTPUT_HEIGHT)
  const [resizing, setResizing] = useState(false)
  const resizeOrigin = useRef<ResizeOrigin | null>(null)

  useEffect(() => {
    if (!resizing) return

    /** 按当前指针位置更新高度，向上拖动增加面板可见区域。 */
    const handlePointerMove = (event: PointerEvent): void => {
      const origin = resizeOrigin.current
      if (!origin) return
      setHeight(resizedWorkflowOutputHeight(
        origin.height,
        origin.pointerY,
        event.clientY,
        MINIMUM_OUTPUT_HEIGHT,
        maximum
      ))
    }
    /** 结束一次全局拖拽，恢复页面选择和动画。 */
    const handlePointerUp = (): void => {
      resizeOrigin.current = null
      setResizing(false)
    }
    globalThis.addEventListener('pointermove', handlePointerMove)
    globalThis.addEventListener('pointerup', handlePointerUp, { once: true })
    globalThis.addEventListener('pointercancel', handlePointerUp, { once: true })
    return () => {
      globalThis.removeEventListener('pointermove', handlePointerMove)
      globalThis.removeEventListener('pointerup', handlePointerUp)
      globalThis.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [maximum, resizing])

  /** 冻结当前布局上限并开始一次输出面板拖拽。 */
  const onPointerDown = useCallback<PointerEventHandler<HTMLDivElement>>((
    event
  ) => {
    if (event.button !== 0) return
    const panel = event.currentTarget.parentElement
    const availableHeight = panel?.parentElement?.getBoundingClientRect().height
      ?? globalThis.innerHeight
    const nextMaximum = Math.max(
      MINIMUM_OUTPUT_HEIGHT,
      Math.min(MAXIMUM_OUTPUT_HEIGHT, availableHeight - 160)
    )
    const currentHeight = panel?.getBoundingClientRect().height ?? height
    setMaximum(nextMaximum)
    resizeOrigin.current = {
      height: Math.min(nextMaximum, Math.max(MINIMUM_OUTPUT_HEIGHT, currentHeight)),
      pointerY: event.clientY
    }
    setResizing(true)
    event.preventDefault()
  }, [height])

  /** 让键盘用户用方向键、Home 和 End 调整同一分隔条。 */
  const onKeyDown = useCallback<KeyboardEventHandler<HTMLDivElement>>((event) => {
    let nextHeight: number | null = null
    if (event.key === 'ArrowUp') nextHeight = height + KEYBOARD_RESIZE_STEP
    if (event.key === 'ArrowDown') nextHeight = height - KEYBOARD_RESIZE_STEP
    if (event.key === 'Home') nextHeight = MINIMUM_OUTPUT_HEIGHT
    if (event.key === 'End') nextHeight = maximum
    if (nextHeight === null) return
    setHeight(Math.min(maximum, Math.max(MINIMUM_OUTPUT_HEIGHT, nextHeight)))
    event.preventDefault()
  }, [height, maximum])

  /** 把运行输出恢复到兼顾画布与日志的默认高度。 */
  const reset = useCallback((): void => {
    setHeight(Math.min(maximum, DEFAULT_OUTPUT_HEIGHT))
  }, [maximum])

  return {
    height,
    minimum: MINIMUM_OUTPUT_HEIGHT,
    maximum,
    resizing,
    onPointerDown,
    onKeyDown,
    reset
  }
}
