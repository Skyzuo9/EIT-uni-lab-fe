import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { MaterialShapeThumbnail } from './MaterialShapeThumbnail'
import { parseShapeLibrary } from './shapeSpec'

describe('MaterialShapeThumbnail', () => {
  it('renders a registered lathe shape without template-specific artwork', () => {
    const [shape] = parseShapeLibrary([{
      id: 'beaker',
      bundle: 'szlab',
      displayName: '烧杯',
      categories: ['beaker'],
      categoryTokens: [],
      priority: 0,
      envelope: [86, 86, 120],
      units: 'ratio',
      shadow: 'round',
      sort: 'center',
      parts: [{
        type: 'lathe',
        style: 'glass',
        center: [0.5, 0.5],
        d: 0.88,
        z: [0, 1],
        rings: [{ z: 0, r: 0.88 }, { z: 1, r: 1 }]
      }]
    }])
    if (!shape) throw new Error('测试外形未通过注册表解析')

    const markup = renderToStaticMarkup(
      <MaterialShapeThumbnail shape={shape} />
    )

    expect(markup).toContain('data-material-shape-source="registry"')
    expect(markup).toContain('data-material-shape-id="beaker"')
    expect(markup).toContain('烧杯 2.5D 外形')
    expect(markup).toContain('<polygon')
    expect(markup).toContain('<ellipse')
  })
})
