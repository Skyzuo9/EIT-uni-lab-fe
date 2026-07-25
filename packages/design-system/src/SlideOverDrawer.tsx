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
export function SlideOverDrawer({
  open,
  title,
  onClose,
  children,
  footer
}: SlideOverDrawerProps): React.JSX.Element {
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
    <div
      className={`pointer-events-none absolute inset-0 z-30 ${open ? 'pointer-events-auto' : ''}`}
      aria-hidden={!open}
    >
      <div
        className={`absolute inset-0 bg-[rgba(15,23,42,0.35)] transition-opacity duration-300 ${
          open ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
      />
      <div
        className={`absolute inset-y-0 right-0 flex w-[480px] max-w-[90%] flex-col bg-white shadow-[-8px_0_24px_rgba(15,23,42,0.18)] transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        role="dialog"
        aria-modal="true"
      >
        <header className="flex items-center justify-between border-b border-[#e8ebef] bg-[#fbfcfe] px-[18px] py-3.5">
          <div className="text-[15px] font-semibold text-[#1f2329]">{title}</div>
          <button
            type="button"
            className="h-7 w-7 cursor-pointer rounded-md border-0 bg-transparent text-xl leading-none text-[#6b7280] transition-colors hover:bg-[#eceff3]"
            onClick={onClose}
            aria-label="关闭"
          >
            ×
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto bg-[#f8fafc] px-[18px] py-4">
          {children}
        </div>
        {footer && (
          <footer className="flex justify-end gap-2 border-t border-[#e8ebef] bg-[#fbfcfe] px-[18px] py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>
  )
}
