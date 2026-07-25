import { useMemo } from 'react'
import {
  CANONICAL_PANEL_MANIFEST,
  createPanelCapabilityUnavailable,
  createPanelRegistry,
  parsePanelLayoutDocument,
  type PanelAppAdapter,
  type PanelRendererProps,
  type PanelStoragePort
} from '@unilab/panel-runtime'
import { MaterialWorkbench } from '@unilab/material'
import { useServices, type Services } from '@unilab/services'
import { WorkflowPanel } from '@unilab/workflow-editor'
import { SceneWorkbench } from './SceneWorkbench'

import {
  useLabInteractionStore
} from './LabInteractionProvider'
import type { LabInteractionStore } from './interactionStore'

export interface LabPanelScope {
  services: Services
  interaction: LabInteractionStore
}

const registry = createPanelRegistry(CANONICAL_PANEL_MANIFEST)

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
  _props: PanelRendererProps<LabPanelScope>
): React.JSX.Element {
  return <MaterialWorkbench />
}

function WorkflowRenderer(
  _props: PanelRendererProps<LabPanelScope>
): React.JSX.Element {
  return <WorkflowPanel />
}

function SceneRenderer(
  _props: PanelRendererProps<LabPanelScope>
): React.JSX.Element {
  return <SceneWorkbench />
}

/**
 * The app adapter is the only place where feature packages meet each other.
 * panel-runtime stays application-neutral and each feature remains independently
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
          if (
            panelInstance.panelType === 'layout-unified' ||
            panelInstance.panelType === 'layout-2d'
          ) {
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
