import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { materialAggregate } from '../testFixtures'
import type { MaterialSite } from '../types'
import { MaterialNodePresentation } from './MaterialNode'

describe('MaterialNode', () => {
  /**
   * 验证有物理尺寸的通用仓体仍投影其公开库位（Site），避免只为 deck/labware
   * 生成库位 DOM 而丢失真实库存位置。参数与返回：无。异常：缺少库位 DOM 时
   * 由 Vitest 失败。
   */
  it('renders sites for a generic physical warehouse', () => {
    const warehouse = materialAggregate('warehouse', {
      config: {
        rendering: {
          kind: 'beaker-stack',
          dimensionsMm: [790, 560, 200]
        }
      },
      sites: [warehouseSite()]
    })

    const markup = renderToStaticMarkup(
      <MaterialNodePresentation
        aggregate={warehouse}
        selected={false}
      />
    )

    expect(markup).toContain('data-site-key="L1C1"')
  })
})

/**
 * 构造通用仓体中的一个可见库位（Site）测试事实。
 *
 * @returns 具有位置、尺寸与占用信息的库位。
 * @throws 无。
 */
function warehouseSite(): MaterialSite {
  return {
    id: 'site-l1c1',
    ownerMaterialId: 'warehouse',
    key: 'L1C1',
    name: 'L1C1',
    anchor: { kind: 'root' },
    poseInAnchor: {
      positionMm: [15, 50, 210],
      rotationDegXYZ: [0, 0, 0]
    },
    sizeMm: [70, 70, 70],
    capacity: 1,
    allowedTemplateIds: [],
    occupiedMaterialIds: ['powder-bottle'],
    kind: 'site',
    shape: 'rectangle',
    visible: true,
    visual: { state: 'occupied', fillFraction: 1 }
  }
}
