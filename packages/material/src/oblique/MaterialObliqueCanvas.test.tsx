import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { materialAggregate } from '../testFixtures'
import { MaterialObliqueCanvas } from './MaterialObliqueCanvas'
import { parseShapeLibrary } from './shapeSpec'

describe('MaterialObliqueCanvas', () => {
  it('renders accessible viewport controls, fidelity status and selected details', () => {
    const selected = materialAggregate('selected', {
      config: {
        rendering: {
          kind: 'vision_cell',
          dimensionsMm: [340, 510, 329]
        }
      }
    })
    const fallback = materialAggregate('fallback', {
      placement: {
        kind: 'world',
        pose: {
          positionMm: [520, 0, 0],
          rotationDegXYZ: [0, 0, 0]
        }
      },
      config: {
        rendering: {
          kind: 'unknown_device',
          dimensionsMm: [200, 180, 160]
        }
      }
    })
    const shapes = parseShapeLibrary([
      {
        id: 'vision_cell',
        bundle: 'test',
        categories: ['vision_cell'],
        categoryTokens: [],
        priority: 0,
        units: 'ratio',
        shadow: 'box',
        sort: 'center',
        parts: [
          {
            type: 'box',
            style: 'body',
            from: [0, 0, 0],
            to: [1, 1, 1]
          }
        ]
      }
    ])

    const markup = renderToStaticMarkup(
      <MaterialObliqueCanvas
        aggregates={[selected, fallback]}
        shapes={shapes}
        selectedMaterialIds={['selected']}
        onSelectionChange={() => undefined}
      />
    )

    expect(markup).toContain('aria-label="2.5D 视图控制"')
    expect(markup).toContain('aria-label="放大 2.5D 视图"')
    expect(markup).toContain('aria-label="聚焦已选物料"')
    expect(markup).toContain('data-semantic-zoom="overview"')
    expect(markup).toContain('声明外形 1')
    expect(markup).toContain('包络近似 1')
    expect(markup).toContain('data-oblique-fidelity="declared"')
    expect(markup).toContain('data-oblique-fidelity="envelope"')
    expect(markup).toContain('aria-pressed="true"')
    expect(markup).toContain('X 0 · Y 0 · Z 0 mm')
    expect(markup).toContain('滚轮缩放')
  })

  it('explains an empty scene while keeping the viewport controls visible', () => {
    const markup = renderToStaticMarkup(
      <MaterialObliqueCanvas aggregates={[]} />
    )

    expect(markup).toContain('当前物料图没有可展示对象')
    expect(markup).toContain('aria-label="适应全部物料"')
    expect(markup).toContain('声明外形 0')
  })
})
