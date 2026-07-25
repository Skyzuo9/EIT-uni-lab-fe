import {
  reducePanelLayout
} from '@unilab/panel-runtime'
import { describe, expect, it } from 'vitest'

import { panelPresetDocument } from './panelLayouts'

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
})
