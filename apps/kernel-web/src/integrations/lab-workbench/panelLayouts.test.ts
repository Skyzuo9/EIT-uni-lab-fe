import {
  reducePanelLayout
} from '@unilab/workbench-layout'
import { describe, expect, it } from 'vitest'

import { panelPresetDocument } from './panelLayouts'

describe('lab panel workspace presets', () => {
  it('uses the canonical unified layout plus the Uni-Lab workflow editor', () => {
    const document = panelPresetDocument('lab')
    expect(JSON.stringify(document)).toContain('layout-unified')
    expect(JSON.stringify(document)).toContain('workflow-dag-picker')
    expect(JSON.stringify(document)).not.toContain(
      'experimental-lab-map-v2'
    )
  })

  it('adds Lab Map V2 only to an explicitly experimental layout', () => {
    const document = panelPresetDocument('lab', {
      experimentalLabMapV2: true
    })
    expect(JSON.stringify(document)).toContain(
      'experimental-lab-map-v2'
    )
    expect(JSON.stringify(document)).toContain(
      'workflow-dag-picker'
    )
    expect(document.layout).toMatchObject({
      type: 'group',
      id: 'experimental-lab-map-v2-group'
    })
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
