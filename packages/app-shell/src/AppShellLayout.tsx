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
    <div className="flex h-full w-full flex-col">
      <header className="flex h-11 items-center gap-4 border-b border-[#e5e7eb] bg-white px-4">
        <div className="text-sm font-semibold text-[#1f2329]">{brand}</div>
        {topbar}
      </header>
      <div className="flex min-h-0 flex-1">
        <nav className="flex basis-[72px] flex-col border-r border-[#e5e7eb] bg-[#f9fafb] py-2">
          {navigation.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`flex cursor-pointer flex-col items-center gap-1 border-0 bg-transparent py-2.5 text-[#6b7280] transition-colors hover:bg-[#f3f4f6] ${
                activeNavigationId === item.id ? 'bg-[#e7f5ff] text-[#1971c2]' : ''
              }`}
              onClick={() => onNavigate(item.id)}
            >
              {item.icon ? (
                <span className="text-lg leading-none">{item.icon}</span>
              ) : null}
              <span className="text-[11px]">{item.label}</span>
            </button>
          ))}
        </nav>
        <main className="min-h-0 min-w-0 flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  )
}
