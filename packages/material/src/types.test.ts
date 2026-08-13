import { describe, expect, it } from 'vitest'

import {
  MATERIAL_MEASUREMENT_UNITS,
  isMaterialMeasurementUnit
} from './types'

describe('material domain types', () => {
  it('accepts only declared measurement unit codes at runtime', () => {
    for (const unit of MATERIAL_MEASUREMENT_UNITS) {
      expect(isMaterialMeasurementUnit(unit)).toBe(true)
    }

    expect(isMaterialMeasurementUnit('microliters')).toBe(false)
    expect(isMaterialMeasurementUnit('500 uL')).toBe(false)
    expect(isMaterialMeasurementUnit('')).toBe(false)
  })
})
