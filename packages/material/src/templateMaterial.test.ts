import { describe, expect, it } from 'vitest'

import {
  createMaterialDraftFromTemplate,
  validateMaterialName
} from './templateMaterial'

describe('createMaterialDraftFromTemplate', () => {
  it('does not manufacture contents from template metadata', () => {
    const draft = createMaterialDraftFromTemplate(
      {
        uuid: 'template-1',
        displayName: 'Plate'
      },
      {
        existingNames: [],
        requestedName: '  Plate  '
      }
    )

    expect(draft.createInput).toEqual({
      templateId: 'template-1',
      name: 'Plate',
      placement: { kind: 'unplaced' },
      initialContents: []
    })
    expect(draft.nameValidation.valid).toBe(true)
    expect(JSON.stringify(draft)).not.toContain('containerLayout')
  })

  it('preserves an explicit placement and typed initial contents', () => {
    const initialContents = [
      {
        target: {
          kind: 'managed-component' as const,
          componentKey: 'A1'
        },
        content: {
          kind: 'reagent' as const,
          reagentInfo: {
            kind: 'existing' as const,
            reagentInfoId: 'reagent-info-1'
          },
          quantity: { value: 100, unit: 'uL' as const }
        }
      }
    ]
    const draft = createMaterialDraftFromTemplate(
      {
        uuid: 'template-2',
        displayName: 'Robot'
      },
      {
        existingNames: [],
        placement: {
          kind: 'world',
          pose: {
            positionMm: [100, 200, 0],
            rotationDegXYZ: [0, 0, 0]
          }
        },
        initialContents
      }
    )

    expect(draft.createInput.name).toBe('Robot')
    expect(draft.createInput.initialContents).toEqual(initialContents)
    expect(draft.createInput.initialContents).not.toBe(initialContents)
  })

  it('reports duplicate names without silently appending a suffix', () => {
    const result = validateMaterialName('  ｐＬＡＴＥ  ', [
      'Plate',
      'Plate 2'
    ])

    expect(result).toEqual({
      valid: false,
      value: 'pLATE',
      code: 'duplicate',
      message: '当前物料图中已存在同名物料'
    })
  })

  it('rejects an empty material name', () => {
    expect(validateMaterialName('   ', [])).toMatchObject({
      valid: false,
      code: 'required',
      value: ''
    })
  })
})
