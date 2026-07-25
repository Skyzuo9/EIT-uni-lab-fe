import { describe, expect, it } from 'vitest'

import { createMaterialDraftFromTemplate } from './templateMaterial'

describe('createMaterialDraftFromTemplate', () => {
  it('preserves Cloud template creation semantics for liquid wells', () => {
    const configInfos = [
      {
        type: 'well',
        data: {
          liquids: [['Ethanol', 100] as const]
        }
      },
      {
        type: 'mount',
        data: { label: 'deck' }
      }
    ] as const

    const draft = createMaterialDraftFromTemplate(
      {
        uuid: 'template-1',
        name: 'Plate',
        configInfos
      },
      ['Plate', 'Plate 2']
    )

    expect(draft.createInput).toEqual({
      displayName: 'Plate 3',
      name: 'Plate 3',
      resourceTemplateId: 'template-1',
      plateWellData: {}
    })
    expect(draft.requiresLiquidConfiguration).toBe(true)
    expect(draft.wells[0]?.data).toMatchObject({
      liquids: [['Water', 500]],
      pendingLiquids: [['Water', 500]],
      liquidHistory: ['Water']
    })
    expect(configInfos[0]?.data.liquids).toEqual([['Ethanol', 100]])
  })

  it('creates directly when the template has no configured liquid', () => {
    const draft = createMaterialDraftFromTemplate(
      {
        uuid: 'template-2',
        name: 'Robot',
        configInfos: [{ type: 'device', data: {} }]
      },
      []
    )

    expect(draft.requiresLiquidConfiguration).toBe(false)
    expect(draft.createInput.name).toBe('Robot')
  })
})
