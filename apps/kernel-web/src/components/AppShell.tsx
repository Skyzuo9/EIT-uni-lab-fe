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
import {
  lazy,
  Suspense
} from 'react'
import { useWorkbench } from '../context/WorkbenchContext'
import { useAuth } from '../context/AuthContext'
import {
  AppShellLayout,
  type AppShellNavigationItem
} from '@unilab/app-shell'
import ConnectionBar from './ConnectionBar'
import UserMenu from './auth/UserMenu'
import DevicePanel from './device/DevicePanel'
import { MaterialWorkbench } from '@unilab/material'
import { WorkflowPanel } from '@unilab/workflow-editor'
import type { WorkbenchSection } from '../data/lab'

const SceneWorkbench = lazy(async () => {
  const module = await import('../integrations/lab-workbench/SceneWorkbench')
  return { default: module.SceneWorkbench }
})

// 左侧导航项定义
const NAV_ITEMS: readonly AppShellNavigationItem[] = [
  { id: 'device', label: '仪器设备', icon: '⚙' },
  { id: 'material', label: '物料', icon: '⬡' },
  { id: 'scene', label: '3D 场景', icon: '◇' },
  { id: 'workflow', label: '工作流', icon: '⇄' }
]

// 统一外壳:顶栏 + 左侧导航 + 主区
export default function AppShell(): React.JSX.Element {
  const { section, setSection } = useWorkbench()
  const { session, logout } = useAuth()

  return (
    <AppShellLayout
      brand="Uni-Lab 调试台"
      topbar={
        <>
          <ConnectionBar />
          {session ? (
            <UserMenu userInfo={session.userInfo} onLogout={logout} />
          ) : null}
        </>
      }
      navigation={NAV_ITEMS}
      activeNavigationId={section}
      onNavigate={(navigationId) => setSection(navigationId as WorkbenchSection)}
    >
      <SectionView section={section} />
    </AppShellLayout>
  )
}

// 根据当前方向渲染对应面板
function SectionView({ section }: { section: WorkbenchSection }): React.JSX.Element {
  if (section === 'device') return <DevicePanel />
  if (section === 'material') return <MaterialWorkbench />
  if (section === 'scene') {
    return (
      <Suspense fallback={<div className="app-loading">正在加载 3D 编辑器…</div>}>
        <SceneWorkbench />
      </Suspense>
    )
  }
  return <WorkflowPanel />
}
