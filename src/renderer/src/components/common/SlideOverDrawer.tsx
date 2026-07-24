/**
 * ============================================================
 * AI-GENERATED CODE METADATA
 * ============================================================
 * Model: Claude Opus 4.8
 * Generation Date: 2026-07-22
 * Prompt Summary: 右侧滑出抽屉(遮罩 + translate-x 动画),对齐大 web InteractivePanel
 * Context: 工作流步骤参数编辑面板容器,纯 CSS 过渡,不引入 headlessui
 * Human Review Status: [ ] Pending  [ ] Reviewed  [ ] Approved
 * ============================================================
 */
import { useEffect } from 'react'
import type { ReactNode } from 'react'

interface SlideOverDrawerProps {
  open: boolean
  title: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}

// 右侧滑出抽屉:遮罩点击关闭,Esc 关闭,面板从右侧 translate-x 滑入
export default function SlideOverDrawer({
  open,
  title,
  onClose,
  children,
  footer
}: SlideOverDrawerProps): JSX.Element {
  // 打开时监听 Esc 关闭
  useEffect(() => {
    if (!open) return
    const handleKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  return (
    <div className={`drawer ${open ? 'is-open' : ''}`} aria-hidden={!open}>
      <div className="drawer__mask" onClick={onClose} />
      <div className="drawer__panel" role="dialog" aria-modal="true">
        <header className="drawer__header">
          <div className="drawer__title">{title}</div>
          <button type="button" className="drawer__close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </header>
        <div className="drawer__body">{children}</div>
        {footer && <footer className="drawer__footer">{footer}</footer>}
      </div>
    </div>
  )
}
