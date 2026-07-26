import {
  lazy,
  Suspense,
  useMemo
} from 'react'
import {
  CANONICAL_PANEL_MANIFEST,
  createPanelCapabilityUnavailable,
  createPanelRegistry,
  parsePanelLayoutDocument,
  type PanelAppAdapter,
  type PanelRendererProps,
  type PanelStoragePort
} from '@unilab/workbench-layout'
import {
  MaterialCapabilityNotice,
  MaterialCanvas,
  MaterialWorkbench
} from '@unilab/material'
import { useServices, type Services } from '@unilab/services'
import { WorkflowPanel } from '@unilab/workflow-editor'
import { useStore } from 'zustand'
import {
  useLabInteractionStore
} from './LabInteractionProvider'
import { useMaterialRuntime } from './MaterialRuntimeProvider'
import { materialIdsFromWorkflowArgs } from './workflowMaterialRefs'
import type { LabInteractionStore } from './interactionStore'
import { UnifiedLabViewport } from './UnifiedLabViewport'

export interface LabPanelScope {
  services: Services
  interaction: LabInteractionStore
}

const registry = createPanelRegistry(CANONICAL_PANEL_MANIFEST)
const SceneWorkbench = lazy(async () => {
  const module = await import('./SceneWorkbench')
  return { default: module.SceneWorkbench }
})

const storage: PanelStoragePort = {
  load: (key) => {
    const value = globalThis.localStorage?.getItem(key)
    return value ? JSON.parse(value) : null
  },
  save: (key, document) => {
    globalThis.localStorage?.setItem(key, JSON.stringify(document))
  }
}

function MaterialRenderer(
  props: PanelRendererProps<LabPanelScope> & {
    unified?: boolean
  }
): React.JSX.Element {
  const runtime = useMaterialRuntime()
  const selectedMaterialIds = useStore(
    props.scope.interaction,
    (state) => state.selectedMaterialIds
  )
  const highlightedMaterialIds = useStore(
    props.scope.interaction,
    (state) => state.highlightedMaterialIds
  )

  if (!runtime.store || !runtime.scope) {
    return (
      <MaterialCapabilityNotice
        title="请选择 Laboratory"
        status={{
          available: false,
          reason: '当前 Profile 使用 laboratory scope，需先选择 Laboratory'
        }}
      />
    )
  }

  return (
    <MaterialWorkbench
      catalog={props.scope.services.materials}
      profileId={props.scope.services.backend.id}
      scope={runtime.scope}
      capabilities={{
        readTemplates: runtime.getStatus('material.readTemplates'),
        readGraph: runtime.getStatus('material.readGraph'),
        create: runtime.getStatus('material.create'),
        updateConfig: runtime.getStatus('material.updateConfig'),
        move: runtime.getStatus('material.move')
      }}
      selectedMaterialIds={selectedMaterialIds}
      highlightedMaterialIds={highlightedMaterialIds}
      onSelectionChange={(materialIds) => {
        props.scope.interaction.getState().selectMaterials(materialIds)
      }}
      renderViewport={
        props.unified
          ? (viewportProps) => (
              <UnifiedLabViewport
                view2d={<MaterialCanvas {...viewportProps} />}
                view3d={<SceneRenderer {...props} />}
              />
            )
          : undefined
      }
    />
  )
}

function WorkflowRenderer(
  props: PanelRendererProps<LabPanelScope>
): React.JSX.Element {
  return (
    <WorkflowPanel
      runtime={props.scope.services.workflow}
      onStepFocus={(focus) => {
        const interaction = props.scope.interaction.getState()
        interaction.selectWorkflowStep(focus.stepId)
        interaction.highlightMaterials(
          materialIdsFromWorkflowArgs(focus.args)
        )
      }}
    />
  )
}

function SceneRenderer(
  _props: PanelRendererProps<LabPanelScope>
): React.JSX.Element {
  const runtime = useMaterialRuntime()
  if (!runtime.store || !runtime.scope) {
    return (
      <MaterialCapabilityNotice
        title="请选择 Laboratory"
        status={{
          available: false,
          reason: '当前 Profile 使用 laboratory scope，需先选择 Laboratory'
        }}
      />
    )
  }
  const readStatus = runtime.getStatus('material.readGraph')
  if (!readStatus.available) {
    return (
      <MaterialCapabilityNotice
        title="3D Material Scene 不可用"
        status={readStatus}
      />
    )
  }
  return (
    <Suspense
      fallback={<div className="app-loading">正在加载 3D 编辑器…</div>}
    >
      <SceneWorkbench />
    </Suspense>
  )
}

function UnifiedLayoutRenderer(
  props: PanelRendererProps<LabPanelScope>
): React.JSX.Element {
  return <MaterialRenderer {...props} unified />
}

/**
 * The app adapter is the only place where feature packages meet each other.
 * workbench-layout stays application-neutral and each feature remains independently
 * testable.
 */
export function useLabPanelAdapter(): PanelAppAdapter<LabPanelScope> {
  const services = useServices()
  const interaction = useLabInteractionStore()

  return useMemo<PanelAppAdapter<LabPanelScope>>(
    () => ({
      registry,
      storage,
      parseLayout: parsePanelLayoutDocument,
      scope: {
        resolve: () => ({ services, interaction })
      },
      renderers: {
        resolve: (panelInstance) => {
          if (panelInstance.panelType === 'layout-unified') {
            return { status: 'ready', Renderer: UnifiedLayoutRenderer }
          }
          if (panelInstance.panelType === 'layout-2d') {
            return { status: 'ready', Renderer: MaterialRenderer }
          }
          if (
            panelInstance.panelType === 'workflow-dag' ||
            panelInstance.panelType === 'workflow-steps' ||
            panelInstance.panelType === 'workflow-dag-picker'
          ) {
            return { status: 'ready', Renderer: WorkflowRenderer }
          }
          if (panelInstance.panelType === 'layout-3d') {
            return { status: 'ready', Renderer: SceneRenderer }
          }
          return createPanelCapabilityUnavailable(
            panelInstance.panelType,
            'This panel capability has not been migrated yet'
          )
        }
      }
    }),
    [interaction, services]
  )
}
