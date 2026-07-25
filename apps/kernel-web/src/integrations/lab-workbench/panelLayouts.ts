import {
  createDefaultPanelLayout,
  parsePanelLayoutDocument,
  type PanelLayoutDocument
} from '@unilab/workbench-layout'

export type LabPanelPreset = 'lab' | 'scene' | 'workflow'

export function panelPresetDocument(
  preset: LabPanelPreset
): PanelLayoutDocument {
  if (preset === 'lab') return createDefaultPanelLayout()

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
          panelType
        }
      ],
      activePanelId: `${panelType}-primary`
    }
  })
}
