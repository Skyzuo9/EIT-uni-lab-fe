import { useMemo, useState, type ReactNode } from 'react'

import type { CapabilityStatus } from './MaterialCapabilityNotice'
import { MaterialInspector } from './MaterialInspector'
import {
  useMaterialStore,
  useMaterialStoreApi
} from './MaterialStoreProvider'
import { MaterialTemplateLibrary } from './MaterialTemplateLibrary'
import { MaterialCanvas } from './react-flow/MaterialCanvas'
import type { MaterialTemplateCatalogPort } from './templateMaterial'
import type { MaterialId, MaterialScope } from './types'

export interface MaterialWorkbenchCapabilities {
  readTemplates: CapabilityStatus
  readGraph: CapabilityStatus
  create: CapabilityStatus
  updateConfig: CapabilityStatus
  move: CapabilityStatus
}

export interface MaterialWorkbenchProps {
  catalog: MaterialTemplateCatalogPort
  profileId: string
  scope: MaterialScope
  capabilities: MaterialWorkbenchCapabilities
  selectedMaterialIds?: readonly MaterialId[]
  highlightedMaterialIds?: readonly MaterialId[]
  onSelectionChange?: (materialIds: readonly MaterialId[]) => void
  renderViewport?: (props: MaterialWorkbenchViewportProps) => ReactNode
}

export interface MaterialWorkbenchViewportProps {
  readStatus: CapabilityStatus
  moveStatus: CapabilityStatus
  selectedMaterialIds: readonly MaterialId[]
  highlightedMaterialIds: readonly MaterialId[]
  onSelectionChange?: (materialIds: readonly MaterialId[]) => void
}

/**
 * The Material package composes its own catalog, 2D projection and inspector.
 * Application-specific Services/Profile and cross-panel stores stay injected.
 */
export function MaterialWorkbench({
  catalog,
  profileId,
  scope,
  capabilities,
  selectedMaterialIds = [],
  highlightedMaterialIds = [],
  onSelectionChange,
  renderViewport
}: MaterialWorkbenchProps): React.JSX.Element {
  const [compactView, setCompactView] = useState<
    'templates' | 'viewport' | 'inspector'
  >('viewport')
  const store = useMaterialStoreApi()
  const aggregatesById = useMaterialStore(
    (state) => state.aggregatesById
  )
  const existingNames = useMemo(
    () =>
      Object.values(aggregatesById).map(
        (aggregate) => aggregate.material.name
      ),
    [aggregatesById]
  )
  const inspectedMaterialId = selectedMaterialIds[0] ?? null

  return (
    <div
      className={`material-workbench material-workbench--compact-${compactView}`}
    >
      <div
        aria-label="物料工作区视图"
        className="material-workbench__compact-switch"
        role="group"
      >
        <button
          type="button"
          aria-pressed={compactView === 'templates'}
          disabled={!capabilities.readTemplates.available}
          onClick={() => setCompactView('templates')}
        >
          模板
        </button>
        <button
          type="button"
          aria-pressed={compactView === 'viewport'}
          onClick={() => setCompactView('viewport')}
        >
          画布
        </button>
        <button
          type="button"
          aria-pressed={compactView === 'inspector'}
          onClick={() => setCompactView('inspector')}
        >
          属性
        </button>
      </div>
      {capabilities.readTemplates.available ? (
        <MaterialTemplateLibrary
          catalog={catalog}
          profileId={profileId}
          scope={scope}
          readStatus={capabilities.readTemplates}
          createStatus={capabilities.create}
          existingNames={existingNames}
          onCreate={async (template, draft) => {
            await store.getState().createMaterial({
              templateId: template.uuid,
              name: draft.createInput.name
            })
          }}
        />
      ) : null}
      <div className="material-workbench__viewport">
        {renderViewport ? (
          renderViewport({
            readStatus: capabilities.readGraph,
            moveStatus: capabilities.move,
            selectedMaterialIds,
            highlightedMaterialIds,
            onSelectionChange
          })
        ) : (
          <MaterialCanvas
            readStatus={capabilities.readGraph}
            moveStatus={capabilities.move}
            selectedMaterialIds={selectedMaterialIds}
            highlightedMaterialIds={highlightedMaterialIds}
            onSelectionChange={onSelectionChange}
          />
        )}
      </div>
      <MaterialInspector
        materialId={inspectedMaterialId}
        updateStatus={capabilities.updateConfig}
      />
    </div>
  )
}
