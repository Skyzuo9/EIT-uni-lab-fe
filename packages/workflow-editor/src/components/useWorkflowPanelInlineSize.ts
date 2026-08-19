import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

/**
 * 观察工作流画布面板的 CSS 像素宽度。
 *
 * 该值只供布局器计算换行容量，不驱动 fitView 或修改用户当前 viewport。
 */
export function useWorkflowPanelInlineSize<T extends HTMLElement>(): {
  ref: RefObject<T | null>
  inlineSize: number | undefined
} {
  const ref = useRef<T>(null)
  const [inlineSize, setInlineSize] = useState<number>()

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const update = (width: number): void => {
      const next = Math.round(width)
      setInlineSize((current) => current === next ? current : next)
    }
    update(element.getBoundingClientRect().width)
    if (typeof globalThis.ResizeObserver !== 'function') return
    const observer = new globalThis.ResizeObserver(([entry]) => {
      if (entry) update(entry.contentRect.width)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return { ref, inlineSize }
}
