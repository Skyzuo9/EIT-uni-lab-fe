/** [AI] Model: Claude Opus 4.8 | 2026-07-31 | 应用根:可选登录 + 统一外壳 + 模式 Provider */
import { lazy, Suspense, useCallback, type ReactNode } from 'react'
import { ServicesProvider } from '@unilab/services'
import type { HttpRequestTraceEvent } from '@unilab/services'
import { WorkflowSessionProvider } from '@unilab/workflow-editor'
import {
  WorkbenchProvider,
  useWorkbench
} from './context/WorkbenchContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import { LabInteractionProvider } from './integrations/lab-workbench/LabInteractionProvider'
import { MaterialRuntimeProvider } from './integrations/lab-workbench/MaterialRuntimeProvider'
import AppShell from './components/AppShell'
import { DeviceCardAuthoringTargetConnector } from './components/device-cards/DeviceCardAuthoringTargetConnector'
import { DeviceStatusProvider } from './hooks/useDeviceStatus'

const AssetPipelineFixturePage = lazy(() =>
  import('./integrations/asset-pipeline-e2e/AssetPipelineFixturePage')
)
const KinematicPreviewPage = lazy(() =>
  import('./integrations/asset-pipeline-kinematic-preview/KinematicPreviewPage')
)

function isAssetPipelineFixtureMode(): boolean {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).has('asset-pipeline-e2e')
}

function isKinematicPreviewMode(): boolean {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).has(
    'asset-pipeline-kinematic-preview'
  )
}

export default function App(): React.JSX.Element {
  if (isKinematicPreviewMode()) {
    return (
      <Suspense fallback={<div className="app-loading">正在加载运动预览…</div>}>
        <KinematicPreviewPage />
      </Suspense>
    )
  }
  if (isAssetPipelineFixtureMode()) {
    return (
      <Suspense fallback={<div className="app-loading">正在加载资产管线夹具…</div>}>
        <AssetPipelineFixturePage />
      </Suspense>
    )
  }

  return (
    <AuthProvider>
      <WorkbenchProvider>
        <ActiveServices>
          <MaterialRuntimeProvider>
            <ActiveInteraction>
              <WorkflowSessionProvider>
                <AppShell />
              </WorkflowSessionProvider>
            </ActiveInteraction>
          </MaterialRuntimeProvider>
        </ActiveServices>
      </WorkbenchProvider>
    </AuthProvider>
  )
}

function ActiveInteraction({
  children
}: {
  children: ReactNode
}): React.JSX.Element {
  const { backend } = useWorkbench()
  return (
    <LabInteractionProvider
      key={[
        backend.id,
        backend.apiUrl,
        backend.realtimeUrl,
        backend.workspaceMode
      ].join(':')}
    >
      {children}
    </LabInteractionProvider>
  )
}

function ActiveServices({ children }: { children: ReactNode }): React.JSX.Element {
  const { backend } = useWorkbench()
  const { session } = useAuth()
  const getAccessToken = useCallback(() => session?.token ?? null, [session?.token])
  const traceRequest = useCallback((event: HttpRequestTraceEvent) => {
    return globalThis.window?.api?.observability?.recordHttpRequest?.(event)
  }, [])

  return (
    <ServicesProvider
      backend={backend}
      getAccessToken={getAccessToken}
      traceRequest={traceRequest}
    >
      <DeviceStatusProvider>
        <DeviceCardAuthoringTargetConnector />
        {children}
      </DeviceStatusProvider>
    </ServicesProvider>
  )
}
