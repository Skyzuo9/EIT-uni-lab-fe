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
    <div className="app-shell flex h-full w-full flex-col">
      <header className="app-shell__header flex h-12 items-center gap-4 border-b border-[var(--unilab-color-border)] bg-[var(--unilab-color-surface)] px-4">
        <div className="app-shell__brand text-sm font-semibold text-[var(--unilab-color-text)]">
          {brand}
        </div>
        {topbar}
      </header>
      <div className="app-shell__body flex min-h-0 flex-1">
        <nav
          className="app-shell__nav flex basis-[72px] flex-col border-r border-[var(--unilab-color-border)] bg-[var(--unilab-color-surface-subtle)] py-2"
          aria-label="主导航"
        >
          {navigation.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`app-shell__nav-button flex cursor-pointer flex-col items-center gap-1 border-0 bg-transparent py-2.5 text-[var(--unilab-color-text-muted)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--unilab-color-focus)] ${
                activeNavigationId === item.id
                  ? 'app-shell__nav-button--active'
                  : ''
              }`}
              aria-current={
                activeNavigationId === item.id ? 'page' : undefined
              }
              data-navigation-id={item.id}
              onClick={() => onNavigate(item.id)}
            >
              {item.icon ? (
                <span className="app-shell__nav-icon text-lg leading-none">
                  {item.icon}
                </span>
              ) : null}
              <span className="app-shell__nav-label text-[11px]">
                {item.label}
              </span>
            </button>
          ))}
        </nav>
        <main className="app-shell__main min-h-0 min-w-0 flex-1 overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  )
}
