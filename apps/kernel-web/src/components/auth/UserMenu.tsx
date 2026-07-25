/**
 * ============================================================
 * AI-GENERATED CODE METADATA
 * ============================================================
 * Model: Claude Opus 4.8
 * Generation Date: 2026-07-24
 * Prompt Summary: 顶栏用户菜单(展示登录用户 + 登出),纯展示型组件
 * Context: 登录后在统一外壳顶栏展示当前账号并提供登出入口
 * Human Review Status: [ ] Pending  [ ] Reviewed  [ ] Approved
 * ============================================================
 */
import { useState } from 'react'
import type { AuthUserInfo } from '../../types/auth'

interface UserMenuProps {
  userInfo: AuthUserInfo | null
  onLogout: () => void | Promise<void>
}

// 顶栏用户菜单:头像首字母 + 下拉登出
export default function UserMenu({ userInfo, onLogout }: UserMenuProps): React.JSX.Element {
  // 纯本地 UI 开关:控制下拉展开(简单布尔,无需抽 Hook)
  const [isOpen, setIsOpen] = useState(false)

  const displayName = userInfo?.name || userInfo?.email || '已登录用户'
  const initial = displayName.slice(0, 1).toUpperCase()

  return (
    <div className="relative">
      <button
        type="button"
        className="flex cursor-pointer items-center gap-2 rounded-2xl border border-[#e5e7eb] bg-white py-[3px] pl-[3px] pr-2.5 transition-colors hover:border-[#cbd5e1]"
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[linear-gradient(135deg,#6366f1,#4dabf7)] text-xs font-semibold text-white">
          {initial}
        </span>
        <span className="max-w-[140px] overflow-hidden text-ellipsis whitespace-nowrap text-xs text-[#1f2329]">
          {displayName}
        </span>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-[calc(100%+6px)] z-[41] min-w-[180px] rounded-lg border border-[#e5e7eb] bg-white p-1.5 shadow-[0_6px_20px_rgba(15,23,42,0.14)]">
            {userInfo?.email && (
              <div className="overflow-hidden text-ellipsis whitespace-nowrap border-b border-[#f1f3f5] px-2.5 py-1.5 text-[11px] text-[#6b7280]">
                {userInfo.email}
              </div>
            )}
            <button
              type="button"
              className="mt-1 w-full cursor-pointer rounded-md border-0 bg-transparent px-2.5 py-2 text-left text-[13px] text-[#dc2626] transition-colors hover:bg-[#fef2f2]"
              onClick={() => {
                setIsOpen(false)
                void onLogout()
              }}
            >
              退出登录
            </button>
          </div>
        </>
      )}
    </div>
  )
}
