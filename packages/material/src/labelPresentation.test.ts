import { describe, expect, it } from 'vitest'

import { shouldShowMaterialLabelByDefault } from './labelPresentation'

describe('shouldShowMaterialLabelByDefault', () => {
  it.each([
    'robot',
    'magnetic_stirrer',
    'workbench',
    'beaker_stack',
    'plate-hotel'
  ])('shows navigation landmark %s by default', (kind) => {
    expect(shouldShowMaterialLabelByDefault(kind)).toBe(true)
  })

  it.each([
    'beaker_500ml',
    'sample-vial',
    'reagent_bottle',
    'tube',
    'plate',
    'tip_rack',
    'tip_box_96',
    'tipbox',
    'labware',
    'container',
    'trash',
    'deck'
  ])('keeps ordinary labware %s interaction-only', (kind) => {
    expect(shouldShowMaterialLabelByDefault(kind)).toBe(false)
  })

  it('normalizes case and separators', () => {
    expect(shouldShowMaterialLabelByDefault('BEAKER_STACK')).toBe(true)
    expect(shouldShowMaterialLabelByDefault('BEAKER-500ML')).toBe(false)
  })
})
