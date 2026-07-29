import {
  CANONICAL_PANEL_MANIFEST,
  parsePanelLayoutDocument,
  type PanelLayoutDocument
} from '@unilab/workbench-layout'
import {
  LAB_MAP_V2_PANEL_DEFINITION,
  LAB_MAP_V2_PANEL_ID
} from '../../experiments/lab-map-v2/experimentFlag'

export type LabPanelPreset = 'lab' | 'scene' | 'workflow'

export interface LabPanelPresetOptions {
  experimentalLabMapV2?: boolean
}

export function panelPresetDocument(
  preset: LabPanelPreset,
  options: LabPanelPresetOptions = {}
): PanelLayoutDocument {
  const definitions = options.experimentalLabMapV2
    ? [...CANONICAL_PANEL_MANIFEST, LAB_MAP_V2_PANEL_DEFINITION]
    : CANONICAL_PANEL_MANIFEST
  if (preset === 'lab') {
    if (options.experimentalLabMapV2) {
      return parsePanelLayoutDocument(
        {
          version: 1,
          layout: {
            id: 'experimental-lab-map-v2-group',
            type: 'group',
            panels: [
              {
                id: 'layout-unified-primary',
                panelType: 'layout-unified',
                title: '实验室视图'
              },
              {
                id: 'experimental-lab-map-v2-primary',
                panelType: LAB_MAP_V2_PANEL_ID,
                title: '实验室地图（实验）'
              },
              {
                id: 'workflow-dag-picker-primary',
                panelType: 'workflow-dag-picker',
                title: '工作流调试'
              }
            ],
            activePanelId: 'layout-unified-primary'
          }
        },
        definitions
      )
    }
    return parsePanelLayoutDocument(
      {
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
      },
      definitions
    )
  }

  const panelType =
    preset === 'scene' ? 'layout-3d' : 'workflow-dag'
  return parsePanelLayoutDocument(
    {
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
    },
    definitions
  )
}
