import {
  parsePanelLayoutDocument,
  type PanelLayoutDocument
} from '@unilab/workbench-layout'

export type LabPanelPreset = 'lab' | 'scene' | 'workflow'

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
