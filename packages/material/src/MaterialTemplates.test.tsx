import {
  QueryClient,
  QueryClientProvider
} from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { MaterialCreateDialog } from './MaterialCreateDialog'
import { MaterialTemplateCard } from './MaterialTemplateCard'
import { MaterialTemplateLibrary } from './MaterialTemplateLibrary'
import type {
  MaterialTemplateCatalogPort,
  MaterialTemplateDetail
} from './templateMaterial'

const TEMPLATE: MaterialTemplateDetail = {
  uuid: 'template-1',
  key: 'plate-96',
  sourceNamespace: 'unilabos',
  displayName: '96 Well Plate',
  kind: 'resource',
  tags: ['plate', 'liquid'],
  categoryPath: ['plates'],
  status: 'ready',
  contentHash: 'sha256:template-1',
  creation: {
    mode: 'resource-tree',
    available: false,
    reason: '当前 Edge 尚未开放物料创建'
  },
  containerLayout: {
    type: 'grid',
    containerKind: 'well',
    rows: ['A', 'B'],
    columns: 2,
    columnLabels: [1, 2],
    naming: 'row-column',
    geometry: {
      dimensionsMm: { x: 8, y: 8, z: 10 },
      depthMm: 10,
      shape: 'circle',
      pitchMm: { x: 9, y: -9 },
      offsetMm: { x: 10, y: 20, z: 2 },
      firstKey: 'A1'
    }
  },
  compatibility: {},
  configuration: { schema: {}, uiSchema: {} },
  assets: {}
}

describe('material template components', () => {
  it('renders a template card in the Uni-Lab component vocabulary', () => {
    const markup = renderToStaticMarkup(
      <MaterialTemplateCard
        template={TEMPLATE}
        selected
        onSelect={() => undefined}
      />
    )

    expect(markup).toContain('96 Well Plate')
    expect(markup).toContain('plate · liquid')
    expect(markup).toContain('aria-pressed="true"')
  })

  it('keeps creation disabled without restoring Cloud liquid defaults', () => {
    const markup = renderToStaticMarkup(
      <MaterialCreateDialog
        template={TEMPLATE}
        existingNames={[]}
        createStatus={{
          available: false,
          reason: '当前 Go Backend 不支持原子创建'
        }}
        onCancel={() => undefined}
        onCreate={() => undefined}
      />
    )

    expect(markup).toContain('当前 Go Backend 不支持原子创建')
    expect(markup).toContain('disabled=""')
    expect(markup).not.toContain('Water 500')
  })

  it('shows a duplicate-name error instead of changing the name', () => {
    const markup = renderToStaticMarkup(
      <MaterialCreateDialog
        template={TEMPLATE}
        existingNames={['96 WELL PLATE']}
        createStatus={{ available: true }}
        onCancel={() => undefined}
        onCreate={() => undefined}
      />
    )

    expect(markup).toContain('当前物料图中已存在同名物料')
    expect(markup).toContain('aria-invalid="true"')
    expect(markup).not.toContain('96 Well Plate 2')
  })

  it('does not query an unsupported template catalog', () => {
    const catalog: MaterialTemplateCatalogPort = {
      listTemplates: vi.fn(),
      getTemplate: vi.fn()
    }
    const markup = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <MaterialTemplateLibrary
          catalog={catalog}
          profileId="local-python"
          scope={{ kind: 'singleton' }}
          readStatus={{
            available: false,
            reason: '当前 Uni-Lab-OS 不支持模板目录'
          }}
          createStatus={{ available: false }}
          existingNames={[]}
          onCreate={() => undefined}
        />
      </QueryClientProvider>
    )

    expect(markup).toContain('模板目录不可用')
    expect(markup).toContain('当前 Uni-Lab-OS 不支持模板目录')
    expect(catalog.listTemplates).not.toHaveBeenCalled()
    expect(catalog.getTemplate).not.toHaveBeenCalled()
  })
})
