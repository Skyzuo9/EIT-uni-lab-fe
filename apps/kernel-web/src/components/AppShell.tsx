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
import { useWorkbench } from '../context/WorkbenchContext'
import { useAuth } from '../context/AuthContext'
import {
  AppShellLayout,
  type AppShellNavigationItem
} from '@unilab/app-shell'
import ConnectionBar from './ConnectionBar'
import UserMenu from './auth/UserMenu'
import DevicePanel from './device/DevicePanel'
import { LabPanelWorkspace } from '../integrations/lab-workbench/LabPanelWorkspace'
import type { WorkbenchSection } from '../data/lab'

// 左侧导航项定义
const NAV_ITEMS: readonly AppShellNavigationItem[] = [
  { id: 'device', label: '仪器设备', icon: <DeviceIcon /> },
  { id: 'material', label: '物料', icon: <MaterialIcon /> },
  { id: 'scene', label: '3D 场景', icon: <SceneIcon /> },
  { id: 'workflow', label: '工作流', icon: <WorkflowIcon /> }
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
  if (section === 'material') {
    return <LabPanelWorkspace key="material-workspace" preset="lab" />
  }
  if (section === 'scene') {
    return <LabPanelWorkspace key="scene-workspace" preset="scene" />
  }
  return <LabPanelWorkspace key="workflow-workspace" preset="workflow" />
}

function DeviceIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <circle cx="10" cy="10" r="3.2" />
      <path d="M10 2.2v2M10 15.8v2M2.2 10h2M15.8 10h2M4.5 4.5l1.4 1.4M14.1 14.1l1.4 1.4M15.5 4.5l-1.4 1.4M5.9 14.1l-1.4 1.4" />
    </svg>
  )
}

function MaterialIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path d="m10 2.5 6.5 3.75v7.5L10 17.5l-6.5-3.75v-7.5L10 2.5Z" />
      <path d="m3.8 6.4 6.2 3.5 6.2-3.5M10 9.9v7.2" />
    </svg>
  )
}

function SceneIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path d="m10 2 7 4v8l-7 4-7-4V6l7-4Z" />
      <path d="m3.4 6.2 6.6 3.7 6.6-3.7M10 9.9v7.7" />
    </svg>
  )
}

function WorkflowIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <circle cx="4" cy="5" r="1.5" />
      <circle cx="16" cy="5" r="1.5" />
      <circle cx="16" cy="15" r="1.5" />
      <path d="M5.5 5h3a3 3 0 0 1 3 3v4a3 3 0 0 0 3 3M11.5 8a3 3 0 0 1 3-3" />
    </svg>
  )
}
