import {
  MaterialStoreProvider,
  MaterialWorkbench,
  createMaterialStore,
  type CreateMaterialInput,
  type MaterialAggregate,
  type MaterialGraphPort,
  type MaterialSite,
  type MaterialTemplateCatalogPort,
  type MaterialTemplateDetail
} from '@unilab/material'
import {
  QueryClient,
  QueryClientProvider
} from '@tanstack/react-query'
import { useState } from 'react'
import { createRoot } from 'react-dom/client'

import './material-create-fixture.css'

declare global {
  interface Window {
    __UNILAB_MATERIAL_CREATE_COMMAND__?: CreateMaterialInput
  }
}

const initialAggregates = createFixtureGraph()
const templateCatalog = createTemplateCatalog()
const materialGraph = createMaterialGraphPort(initialAggregates)
const materialStore = createMaterialStore({
  scope: { kind: 'singleton' },
  graph: materialGraph,
  requireCapability: () => undefined,
  createIdempotencyKey: () => 'material-create-e2e'
})
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false }
  }
})

function MaterialCreateFixture(): React.JSX.Element {
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<
    readonly string[]
  >([])

  return (
    <QueryClientProvider client={queryClient}>
      <MaterialStoreProvider store={materialStore}>
        <main className="material-create-e2e-app">
          <MaterialWorkbench
            catalog={templateCatalog}
            profileId="e2e-material-authoring"
            scope={{ kind: 'singleton' }}
            capabilities={{
              readTemplates: { available: true },
              readGraph: { available: true },
              create: { available: true },
              updateConfig: {
                available: false,
                reason: 'E2E 夹具不测试属性写入'
              },
              move: {
                available: false,
                reason: 'E2E 夹具使用只读位置'
              }
            }}
            selectedMaterialIds={selectedMaterialIds}
            onSelectionChange={setSelectedMaterialIds}
          />
        </main>
      </MaterialStoreProvider>
    </QueryClientProvider>
  )
}

function createMaterialGraphPort(
  aggregates: readonly MaterialAggregate[]
): MaterialGraphPort {
  const unsupported = async (): Promise<never> => {
    throw new Error('Unexpected MaterialGraphPort command in E2E fixture')
  }

  return {
    getGraph: async () => structuredClone(aggregates),
    createMaterial: async (_scope, input) => {
      window.__UNILAB_MATERIAL_CREATE_COMMAND__ = structuredClone(input)
      const created = materialAggregate({
        id: 'run-plate-01',
        code: 'RUN_PLATE_01',
        name: input.name,
        templateId: input.templateId,
        placement: {
          kind: 'world',
          pose: {
            positionMm: [760, 0, 0],
            rotationDegXYZ: [0, 0, 0]
          }
        },
        config: plateRendering(),
        sites: plateSites('run-plate-01')
      })
      return {
        aggregates: [created],
        primaryMaterialId: created.material.id,
        creationOperationId: 'create-run-plate-01',
        edgeSyncState: 'not-required' as const
      }
    },
    undoCreate: unsupported,
    updateConfig: unsupported,
    move: unsupported,
    attach: unsupported,
    detach: unsupported,
    updateSite: unsupported,
    getEdgeOperations: async () => []
  }
}

function createTemplateCatalog(): MaterialTemplateCatalogPort {
  const templates: MaterialTemplateDetail[] = [
    template({
      uuid: 'template-host',
      key: 'host_node',
      displayName: '通用控制节点',
      tags: ['控制节点'],
      kind: 'device',
      description: '实验室控制节点'
    }),
    template({
      uuid: 'template-prcxi',
      key: 'liquid_handler.prcxi',
      displayName: 'PRCXI 移液工作站',
      tags: ['移液工作站'],
      kind: 'device',
      description: '自动化移液工作站'
    }),
    template({
      uuid: 'template-96-well-plate',
      key: 'plate-96',
      displayName: '96 孔板',
      tags: ['孔板', '耗材'],
      kind: 'resource',
      description: '标准化几何浏览器验收模板',
      containerLayout: {
        type: 'grid',
        containerKind: 'well',
        rows: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
        columns: 12,
        columnLabels: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
        naming: 'row-column',
        geometry: {
          dimensionsMm: { x: 8, y: 8, z: 10 },
          depthMm: 10,
          shape: 'circle',
          pitchMm: { x: 9, y: -9 },
          offsetMm: { x: 10, y: 70, z: 2 },
          firstKey: 'A1'
        }
      }
    }),
    template({
      uuid: 'template-tip-rack',
      key: 'tip-rack-96',
      displayName: '移液枪头盒',
      tags: ['枪头', '耗材'],
      kind: 'resource',
      description: '96 位移液枪头盒'
    })
  ]

  return {
    listTemplates: async () => ({
      revision: 'fixture-catalog-1',
      stale: false,
      items: structuredClone(templates)
    }),
    getTemplate: async (_scope, templateId) => {
      const template = templates.find(
        (candidate) => candidate.uuid === templateId
      )
      if (!template) throw new Error(`Unknown template ${templateId}`)
      return structuredClone(template)
    }
  }
}

function template(
  input: Pick<
    MaterialTemplateDetail,
    'uuid' | 'key' | 'displayName' | 'kind' | 'tags' | 'description'
  > &
    Partial<MaterialTemplateDetail>
): MaterialTemplateDetail {
  return {
    sourceNamespace: 'e2e',
    categoryPath: [input.kind === 'device' ? 'devices' : 'resources'],
    status: 'ready',
    contentHash: `hash-${input.uuid}`,
    creation: {
      mode:
        input.kind === 'device' ? 'dynamic-device' : 'resource-tree',
      available: true
    },
    compatibility: {},
    configuration: { schema: {}, uiSchema: {} },
    assets: {},
    ...input
  }
}

function createFixtureGraph(): readonly MaterialAggregate[] {
  const host = materialAggregate({
    id: 'host-node',
    code: 'host_node',
    name: 'host_node',
    templateId: 'template-host',
    config: {
      presentation: { category: 'control-node' },
      resourceType: 'device'
    },
    placement: {
      kind: 'world',
      pose: {
        positionMm: [-360, 180, 0],
        rotationDegXYZ: [0, 0, 0]
      }
    }
  })
  const device = materialAggregate({
    id: 'prcxi',
    code: 'PRCXI',
    name: 'PRCXI',
    templateId: 'template-prcxi',
    config: {
      resourceConfig: { type: 'liquid-handler-device' }
    },
    placement: {
      kind: 'world',
      pose: {
        positionMm: [0, 0, 0],
        rotationDegXYZ: [0, 0, 0]
      }
    }
  })
  const deck = materialAggregate({
    id: 'prcxi-deck',
    code: 'PRCXI_Deck',
    name: 'PRCXI_Deck',
    templateId: 'template-deck',
    placement: {
      kind: 'parent',
      parentId: 'prcxi',
      anchor: { kind: 'root' },
      localPose: {
        positionMm: [0, -420, 0],
        rotationDegXYZ: [0, 0, 0]
      }
    },
    config: {
      rendering: {
        kind: 'deck',
        dimensionsMm: [470, 40, 370],
        footprintMm: [470, 370]
      }
    },
    sites: deckSites()
  })
  const plate = materialAggregate({
    id: 'pcr-plate',
    code: 'PCR_PLATE',
    name: 'PCR Plate',
    templateId: 'template-96-well-plate',
    placement: {
      kind: 'site',
      parentId: 'prcxi-deck',
      siteId: 'deck-T1',
      offsetPose: {
        positionMm: [0, 0, 0],
        rotationDegXYZ: [0, 0, 0]
      }
    },
    config: plateRendering(),
    sites: plateSites('pcr-plate')
  })
  deck.sites = deck.sites.map((site) =>
    site.id === 'deck-T1'
      ? { ...site, occupiedMaterialIds: [plate.material.id] }
      : site
  )
  return [host, device, deck, plate]
}

function materialAggregate({
  id,
  code,
  name,
  templateId,
  placement,
  config = {},
  sites = []
}: {
  id: string
  code: string
  name: string
  templateId: string
  placement: MaterialAggregate['placement']
  config?: Record<string, unknown>
  sites?: readonly MaterialSite[]
}): MaterialAggregate {
  return {
    material: {
      id,
      sourceTemplateId: templateId,
      code,
      name,
      config,
      createdAt: '2026-07-28T00:00:00.000Z',
      updatedAt: '2026-07-28T00:00:00.000Z'
    },
    placement,
    sites,
    revision: 1
  }
}

function deckSites(): readonly MaterialSite[] {
  return Array.from({ length: 16 }, (_, index) => {
    const column = index % 4
    const row = Math.floor(index / 4)
    const key = `T${index + 1}`
    return {
      id: `deck-${key}`,
      ownerMaterialId: 'prcxi-deck',
      key,
      name: key,
      anchor: { kind: 'root' as const },
      poseInAnchor: {
        positionMm: [
          12 + column * 114,
          370 - 12 - 78 - row * 88,
          0
        ] as const,
        rotationDegXYZ: [0, 0, 0] as const
      },
      sizeMm: [104, 78, 20] as const,
      capacity: 1,
      allowedTemplateIds: [],
      occupiedMaterialIds: [],
      kind: 'deck-slot' as const,
      shape: 'rectangle' as const,
      visible: true
    }
  })
}

function plateSites(ownerMaterialId: string): readonly MaterialSite[] {
  return Array.from({ length: 96 }, (_, index) => {
    const column = index % 12
    const row = Math.floor(index / 12)
    const key = `${String.fromCharCode(65 + row)}${column + 1}`
    return {
      id: `${ownerMaterialId}-${key}`,
      ownerMaterialId,
      key,
      name: key,
      anchor: { kind: 'root' as const },
      poseInAnchor: {
        positionMm: [14.4 + column * 9, 11.2 + row * 9, 0] as const,
        rotationDegXYZ: [0, 0, 0] as const
      },
      sizeMm: [6.9, 6.9, 10] as const,
      capacity: 1,
      allowedTemplateIds: [],
      occupiedMaterialIds: [],
      kind: 'well' as const,
      shape: 'circle' as const,
      visible: true,
      visual: {
        state: 'empty' as const,
        fillFraction: 0
      }
    }
  })
}

function plateRendering(): Record<string, unknown> {
  return {
    rendering: {
      kind: 'plate',
      dimensionsMm: [127.8, 14.4, 85.5],
      footprintMm: [127.8, 85.5]
    }
  }
}

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root')
createRoot(root).render(<MaterialCreateFixture />)
