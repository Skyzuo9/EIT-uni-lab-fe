import { forwardRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ButtonHTMLAttributes, PointerEventHandler } from 'react'

export interface WorkflowButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  disabledReason: string
}

interface TooltipPosition {
  left: number
  top: number
}

const TOOLTIP_MAX_WIDTH_PX = 280
const TOOLTIP_VIEWPORT_MARGIN_PX = 16

/**
 * 渲染带统一禁用原因的工作流按钮。
 *
 * @param props 原生按钮属性与按钮不可用时的具体原因。
 * @param ref 指向实际按钮元素的引用。
 * @returns 保留原有按钮结构、并在禁用时暴露悬浮与无障碍说明的按钮。
 */
export const WorkflowButton = forwardRef<
  HTMLButtonElement,
  WorkflowButtonProps
>(function WorkflowButton(
  {
    disabled = false,
    disabledReason,
    onPointerEnter,
    onPointerLeave,
    title,
    ...props
  },
  ref
): React.JSX.Element {
  const unavailableReason = disabled ? disabledReason : undefined
  const [tooltipPosition, setTooltipPosition] =
    useState<TooltipPosition | null>(null)

  /** 在视口顶层展示禁用原因，避免被工作流画布和运行区裁剪。 */
  const handlePointerEnter: PointerEventHandler<HTMLButtonElement> = (event) => {
    onPointerEnter?.(event)
    if (!unavailableReason) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const viewportWidth = globalThis.window.innerWidth
    const tooltipWidth = Math.min(
      TOOLTIP_MAX_WIDTH_PX,
      viewportWidth * 0.72
    )
    const halfTooltipWidth = tooltipWidth / 2
    const buttonCenter = bounds.left + bounds.width / 2
    setTooltipPosition({
      left: Math.min(
        Math.max(
          buttonCenter,
          TOOLTIP_VIEWPORT_MARGIN_PX + halfTooltipWidth
        ),
        viewportWidth - TOOLTIP_VIEWPORT_MARGIN_PX - halfTooltipWidth
      ),
      top: bounds.top
    })
  }

  /** 指针离开后收起禁用原因。 */
  const handlePointerLeave: PointerEventHandler<HTMLButtonElement> = (event) => {
    onPointerLeave?.(event)
    setTooltipPosition(null)
  }

  return (
    <>
      <button
        {...props}
        ref={ref}
        disabled={disabled}
        aria-description={unavailableReason}
        data-disabled-reason={unavailableReason}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        title={disabled ? undefined : title}
      />
      {tooltipPosition && unavailableReason && typeof document !== 'undefined'
        ? createPortal(
            <span
              className="workflowDisabledButtonTooltip"
              role="tooltip"
              style={tooltipPosition}
            >
              {unavailableReason}
            </span>,
            document.body
          )
        : null}
    </>
  )
})
