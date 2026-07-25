import type { ReactNode } from 'react'

export interface AppShellNavigationItem {
  id: string
  label: string
  icon?: ReactNode
}

interface AppShellLayoutProps {
  brand: ReactNode
  topbar?: ReactNode
  navigation: readonly AppShellNavigationItem[]
  activeNavigationId: string
  onNavigate: (navigationId: string) => void
  children: ReactNode
}

export function AppShellLayout({
  brand,
  topbar,
  navigation,
  activeNavigationId,
  onNavigate,
  children
}: AppShellLayoutProps): React.JSX.Element {
  return (
    <div className="shell">
      <header className="shell__topbar">
        <div className="shell__brand">{brand}</div>
        {topbar}
      </header>
      <div className="shell__body">
        <nav className="shell__nav">
          {navigation.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`shell__nav-item ${
                activeNavigationId === item.id ? 'is-active' : ''
              }`}
              onClick={() => onNavigate(item.id)}
            >
              {item.icon ? (
                <span className="shell__nav-icon">{item.icon}</span>
              ) : null}
              <span className="shell__nav-label">{item.label}</span>
            </button>
          ))}
        </nav>
        <main className="shell__main">{children}</main>
      </div>
    </div>
  )
}
