import {
  reducePanelLayout
} from '@unilab/workbench-layout'
import { describe, expect, it } from 'vitest'

import {
  panelPresetDocument,
  parsePanelPresetDocument
} from './panelLayouts'

describe('lab panel workspace presets', () => {
  it('uses the canonical unified layout plus the Uni-Lab workflow editor', () => {
    const document = panelPresetDocument('lab')
    expect(JSON.stringify(document)).toContain('layout-unified')
    expect(JSON.stringify(document)).toContain('workflow-dag-picker')
  })

  it('produces reducible single-feature presets', () => {
    const document = panelPresetDocument('scene')
    const next = reducePanelLayout(document, {
      type: 'activate-tab',
      groupId: 'scene-workspace-group',
      panelInstanceId: 'layout-3d-primary'
    })

    expect(next.layout).toMatchObject({
      type: 'group',
      activePanelId: 'layout-3d-primary'
    })
  })

  it('rejects material panels restored into the workflow preset', () => {
    expect(() =>
      parsePanelPresetDocument('workflow', {
        version: 1,
        layout: {
          id: 'legacy-mixed-workflow-root',
          type: 'split',
          direction: 'horizontal',
          children: [
            {
              id: 'legacy-material-group',
              type: 'group',
              panels: [
                {
                  id: 'legacy-layout-unified',
                  panelType: 'layout-unified'
                }
              ],
              activePanelId: 'legacy-layout-unified'
            },
            {
              id: 'legacy-workflow-group',
              type: 'group',
              panels: [
                {
                  id: 'legacy-workflow-dag',
                  panelType: 'workflow-dag'
                }
              ],
              activePanelId: 'legacy-workflow-dag'
            }
          ]
        }
      })
    ).toThrow(/workflow.*layout-unified/)
  })
})
