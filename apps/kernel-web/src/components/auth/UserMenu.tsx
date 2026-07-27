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
import { useEffect, useId, useState } from 'react'
import type { AuthUserInfo } from '../../types/auth'

interface UserMenuProps {
  userInfo: AuthUserInfo | null
  onLogout: () => void | Promise<void>
}

// 顶栏用户菜单:头像首字母 + 下拉登出
export default function UserMenu({ userInfo, onLogout }: UserMenuProps): React.JSX.Element {
  // 纯本地 UI 开关:控制下拉展开(简单布尔,无需抽 Hook)
  const [isOpen, setIsOpen] = useState(false)
  const menuId = useId()

  const displayName = userInfo?.name || userInfo?.email || '已登录用户'
  const initial = displayName.slice(0, 1).toUpperCase()

  useEffect(() => {
    if (!isOpen) return
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [isOpen])

  return (
    <div className="user-menu">
      <button
        type="button"
        className="user-menu__trigger"
        aria-controls={menuId}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <span className="user-menu__avatar" aria-hidden="true">
          {initial}
        </span>
        <span className="user-menu__name">
          {displayName}
        </span>
        <span className="user-menu__chevron" aria-hidden="true">⌄</span>
      </button>

      {isOpen && (
        <>
          <div
            className="user-menu__mask"
            aria-hidden="true"
            onClick={() => setIsOpen(false)}
          />
          <div
            className="user-menu__dropdown"
            id={menuId}
            role="menu"
          >
            {userInfo?.email && (
              <div className="user-menu__email">
                {userInfo.email}
              </div>
            )}
            <button
              type="button"
              className="user-menu__logout"
              role="menuitem"
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
