import { describe, expect, it } from 'vitest'

import {
  createLabMapDraftEquipment,
  moveLabMapDraftEquipment,
  readLabMapDraftEquipment,
  removeLabMapDraftEquipment,
  rotateLabMapDraftEquipment
} from './draftEquipment'

describe('Lab Map V2 draft equipment', () => {
  it('creates and moves a map-only equipment draft on the 100 mm grid', () => {
    const item = createLabMapDraftEquipment({
      id: 'draft-1',
      templateId: 'centrifuge',
      positionMm: [1249, 3461]
    })
    const moved = moveLabMapDraftEquipment(
      [item],
      item.id,
      [1888, 2122]
    )

    expect(item).toMatchObject({
      positionMm: [1200, 3500],
      rotationDeg: 0
    })
    expect(moved[0]?.positionMm).toEqual([1900, 2100])
  })

  it('rotates and removes a draft without Material semantics', () => {
    const item = createLabMapDraftEquipment({
      id: 'draft-1',
      templateId: 'workbench',
      positionMm: [1000, 1000]
    })
    const rotated = rotateLabMapDraftEquipment(
      [item],
      item.id
    )

    expect(rotated[0]?.rotationDeg).toBe(90)
    expect(removeLabMapDraftEquipment(rotated, item.id)).toEqual([])
    expect(rotated[0]).not.toHaveProperty('materialId')
  })

  it('drops corrupt or unknown persisted drafts', () => {
    expect(
      readLabMapDraftEquipment([
        {
          id: 'valid',
          templateId: 'plate-reader',
          name: '酶标仪',
          positionMm: [1000, 2000],
          rotationDeg: -90
        },
        {
          id: 'unknown',
          templateId: 'not-registered',
          name: '未知设备',
          positionMm: [0, 0],
          rotationDeg: 0
        }
      ])
    ).toEqual([
      {
        id: 'valid',
        templateId: 'plate-reader',
        name: '酶标仪',
        positionMm: [1000, 2000],
        rotationDeg: 270
      }
    ])
  })
})
