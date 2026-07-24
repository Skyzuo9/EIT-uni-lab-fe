/**
 * ============================================================
 * AI-GENERATED CODE METADATA
 * ============================================================
 * Model: Claude Opus 4.8
 * Generation Date: 2026-07-22
 * Prompt Summary: 调试客户端统一外壳(顶栏 + 左侧三方向导航 + 主区)
 * Context: 设备/物料/工作流三方向共用框架
 * Human Review Status: [ ] Pending  [ ] Reviewed  [ ] Approved
 * ============================================================
 */
import { useAppMode } from '../context/AppModeContext'
import { useAuth } from '../context/AuthContext'
import ConnectionBar from './ConnectionBar'
import UserMenu from './auth/UserMenu'
import DevicePanel from './device/DevicePanel'
import MaterialPanel from './material/MaterialPanel'
import WorkflowPanel from './workflow/WorkflowPanel'
import type { WorkbenchSection } from '../data/lab'

// 左侧导航项定义
const NAV_ITEMS: { key: WorkbenchSection; label: string; icon: string }[] = [
  { key: 'device', label: '仪器设备', icon: '⚙' },
  { key: 'material', label: '物料', icon: '⬡' },
  { key: 'workflow', label: '工作流', icon: '⇄' }
]

// 统一外壳:顶栏 + 左侧导航 + 主区
export default function AppShell(): JSX.Element {
  const { section, setSection } = useAppMode()
  const { session, logout } = useAuth()

  return (
    <div className="shell">
      <header className="shell__topbar">
        <div className="shell__brand">Uni-Lab 调试台</div>
        <ConnectionBar />
        <UserMenu userInfo={session?.userInfo ?? null} onLogout={logout} />
      </header>

      <div className="shell__body">
        <nav className="shell__nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`shell__nav-item ${section === item.key ? 'is-active' : ''}`}
              onClick={() => setSection(item.key)}
            >
              <span className="shell__nav-icon">{item.icon}</span>
              <span className="shell__nav-label">{item.label}</span>
            </button>
          ))}
        </nav>

        <main className="shell__main">
          <SectionView section={section} />
        </main>
      </div>
    </div>
  )
}

// 根据当前方向渲染对应面板
function SectionView({ section }: { section: WorkbenchSection }): JSX.Element {
  if (section === 'device') return <DevicePanel />
  if (section === 'material') return <MaterialPanel />
  return <WorkflowPanel />
}
