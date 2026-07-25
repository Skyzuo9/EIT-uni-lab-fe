/** [AI] Model: Claude Opus 4.8 | 2026-07-21 | 左右分栏可拖拽比例 hook */
import { useCallback, useEffect, useRef, useState } from 'react'

interface UseResizableSplitParams {
  initialRatio?: number
  minRatio?: number
  maxRatio?: number
}

interface UseResizableSplitResult {
  containerRef: React.RefObject<HTMLDivElement | null>
  leftRatio: number
  isDragging: boolean
  handlePointerDown: (event: React.PointerEvent) => void
}

// 管理左右分栏的宽度比例（0~1），通过指针拖拽分隔条调整
export function useResizableSplit(
  params: UseResizableSplitParams = {}
): UseResizableSplitResult {
  const { initialRatio = 0.5, minRatio = 0.2, maxRatio = 0.8 } = params
  const containerRef = useRef<HTMLDivElement>(null)
  const [leftRatio, setLeftRatio] = useState(initialRatio)
  const [isDragging, setIsDragging] = useState(false)

  const handlePointerDown = useCallback((event: React.PointerEvent) => {
    event.preventDefault()
    setIsDragging(true)
  }, [])

  useEffect(() => {
    if (!isDragging) return

    const handlePointerMove = (event: PointerEvent): void => {
      const container = containerRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      if (rect.width === 0) return
      const ratio = (event.clientX - rect.left) / rect.width
      const clamped = Math.min(maxRatio, Math.max(minRatio, ratio))
      setLeftRatio(clamped)
    }

    const handlePointerUp = (): void => {
      setIsDragging(false)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [isDragging, minRatio, maxRatio])

  return { containerRef, leftRatio, isDragging, handlePointerDown }
}
