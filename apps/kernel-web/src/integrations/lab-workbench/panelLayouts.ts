import {
  parsePanelLayoutDocument,
  type CanonicalPanelId,
  type PanelLayoutDocument,
  type PanelLayoutNode
} from '@unilab/workbench-layout'

export type LabPanelPreset = 'lab' | 'scene' | 'workflow'

const PRESET_PANEL_TYPES: Readonly<
  Record<LabPanelPreset, ReadonlySet<CanonicalPanelId>>
> = {
  lab: new Set([
    'layout-unified',
    'layout-2d',
    'layout-3d',
    'workflow-dag',
    'workflow-steps',
    'workflow-dag-picker'
  ]),
  scene: new Set(['layout-3d']),
  workflow: new Set([
    'workflow-dag',
    'workflow-steps',
    'workflow-dag-picker'
  ])
}

export function parsePanelPresetDocument(
  preset: LabPanelPreset,
  input: unknown
): PanelLayoutDocument {
  const document = parsePanelLayoutDocument(input)
  const unsupportedPanelType = findUnsupportedPanelType(
    document.layout,
    PRESET_PANEL_TYPES[preset]
  )

  if (unsupportedPanelType) {
    throw new Error(
      `The ${preset} preset does not allow panel type "${unsupportedPanelType}".`
    )
  }

  return document
}

function findUnsupportedPanelType(
  node: PanelLayoutNode,
  allowedPanelTypes: ReadonlySet<CanonicalPanelId>
): string | null {
  if (node.type === 'group') {
    return (
      node.panels.find(
        (panel) =>
          !allowedPanelTypes.has(panel.panelType as CanonicalPanelId)
      )?.panelType ?? null
    )
  }

  for (const child of node.children) {
    const unsupportedPanelType = findUnsupportedPanelType(
      child,
      allowedPanelTypes
    )
    if (unsupportedPanelType) {
      return unsupportedPanelType
    }
  }

  return null
}

export function panelPresetDocument(
  preset: LabPanelPreset
): PanelLayoutDocument {
  if (preset === 'lab') {
    return parsePanelLayoutDocument({
      version: 1,
      layout: {
        id: 'default-panel-layout-root',
        type: 'split',
        direction: 'horizontal',
        sizes: [55, 45],
        children: [
          {
            id: 'default-layout-group',
            type: 'group',
            panels: [
              {
                id: 'layout-unified-primary',
                panelType: 'layout-unified',
                title: '实验室视图'
              }
            ],
            activePanelId: 'layout-unified-primary'
          },
          {
            id: 'default-workflow-group',
            type: 'group',
            panels: [
              {
                id: 'workflow-dag-picker-primary',
                panelType: 'workflow-dag-picker',
                title: '工作流调试'
              }
            ],
            activePanelId: 'workflow-dag-picker-primary'
          }
        ]
      }
    })
  }

  const panelType =
    preset === 'scene' ? 'layout-3d' : 'workflow-dag'
  return parsePanelLayoutDocument({
    version: 1,
    layout: {
      id: `${preset}-workspace-group`,
      type: 'group',
      panels: [
        {
          id: `${panelType}-primary`,
          panelType,
          title: preset === 'workflow' ? '工作流' : '三维场景'
        }
      ],
      activePanelId: `${panelType}-primary`
    }
  })
}
