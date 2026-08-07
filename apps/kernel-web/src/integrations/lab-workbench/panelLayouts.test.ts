import {
  reducePanelLayout
} from '@unilab/workbench-layout'
import { describe, expect, it } from 'vitest'

import {
  findLabPanelRegionIds,
  hiddenLabPanelNodeIds,
  panelPresetDocument,
  parsePanelPresetDocument
} from './panelLayouts'

describe('lab panel workspace presets', () => {
  /** 证明实验室预设公开稳定的物料与工作流顶层区域身份。 */
  it('uses the canonical unified layout plus the Uni-Lab workflow editor', () => {
    const document = panelPresetDocument('lab')
    expect(JSON.stringify(document)).toContain('layout-unified')
    expect(JSON.stringify(document)).toContain('workflow-dag-picker')
    expect(findLabPanelRegionIds(document)).toEqual({
      materialNodeId: 'default-layout-group',
      materialActionGroupId: 'default-layout-group',
      workflowNodeId: 'default-workflow-group',
      workflowActionGroupId: 'default-workflow-group'
    })
  })

  /** 证明折叠只隐藏工作流区域，不卸载物料区域。 */
  it('hides only the workflow region on wide screens', () => {
    const regions = findLabPanelRegionIds(panelPresetDocument('lab'))

    expect(hiddenLabPanelNodeIds(regions, true)).toEqual([])
    expect(hiddenLabPanelNodeIds(regions, false)).toEqual([
      'default-workflow-group'
    ])
  })

  /** 证明嵌套分栏仍把隐藏与恢复入口锚定到可见的叶子标题栏。 */
  it('anchors region actions to leaf groups in nested layouts', () => {
    const document = parsePanelPresetDocument('lab', {
      version: 1,
      layout: {
        id: 'nested-root',
        type: 'split',
        direction: 'horizontal',
        children: [
          {
            id: 'material-region',
            type: 'split',
            direction: 'vertical',
            children: [
              {
                id: 'material-primary-group',
                type: 'group',
                panels: [{ id: 'material-2d', panelType: 'layout-2d' }],
                activePanelId: 'material-2d'
              },
              {
                id: 'material-secondary-group',
                type: 'group',
                panels: [{ id: 'material-3d', panelType: 'layout-3d' }],
                activePanelId: 'material-3d'
              }
            ]
          },
          {
            id: 'workflow-region',
            type: 'split',
            direction: 'vertical',
            children: [
              {
                id: 'workflow-primary-group',
                type: 'group',
                panels: [{
                  id: 'workflow-picker',
                  panelType: 'workflow-dag-picker'
                }],
                activePanelId: 'workflow-picker'
              },
              {
                id: 'workflow-secondary-group',
                type: 'group',
                panels: [{ id: 'workflow-dag', panelType: 'workflow-dag' }],
                activePanelId: 'workflow-dag'
              }
            ]
          }
        ]
      }
    })

    expect(findLabPanelRegionIds(document)).toEqual({
      materialNodeId: 'material-region',
      materialActionGroupId: 'material-primary-group',
      workflowNodeId: 'workflow-region',
      workflowActionGroupId: 'workflow-primary-group'
    })
  })

  /** 证明单功能预设仍可通过公共布局归约器更新。 */
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

  /** 证明工作流预设拒绝恢复物料面板，避免跨预设污染。 */
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

  /** 证明物料与工作流混合标签组不提供整块区域折叠。 */
  it('does not offer region hiding for a mixed material and workflow tab group', () => {
    const document = parsePanelPresetDocument('lab', {
      version: 1,
      layout: {
        id: 'mixed-group',
        type: 'group',
        panels: [
          { id: 'material', panelType: 'layout-unified' },
          { id: 'workflow', panelType: 'workflow-dag-picker' }
        ],
        activePanelId: 'material'
      }
    })

    expect(findLabPanelRegionIds(document)).toBeNull()
  })
})
