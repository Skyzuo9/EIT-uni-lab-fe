import { describe, expect, it } from 'vitest'

import { LabFloorplanSiteSchema } from '../schema'
import { siteBoundsTransform } from './SiteBoundsRenderer'

describe('SiteBoundsRenderer', () => {
  it('centers a Site-sized box in Pascal Y-up metres', () => {
    const site = LabFloorplanSiteSchema.parse({
      id: 'site-a',
      key: 'A1',
      name: 'A1',
      positionMm: [100, 200, 300],
      sizeMm: [40, 50, 60],
      visible: true,
      visualState: 'empty'
    })

    const transform = siteBoundsTransform(site)
    expect(transform.position[0]).toBeCloseTo(0.12)
    expect(transform.position[1]).toBeCloseTo(0.33)
    expect(transform.position[2]).toBeCloseTo(-0.225)
    expect(transform.scale).toEqual([0.04, 0.06, 0.05])
  })
})
