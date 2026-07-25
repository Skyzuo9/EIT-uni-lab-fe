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
  name: '96 Well Plate',
  resourceType: 'resource',
  tags: ['plate', 'liquid'],
  configInfos: [
    {
      type: 'well',
      data: { liquids: [['Buffer', 100]] }
    }
  ]
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

  it('keeps creation disabled and explains the capability', () => {
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
    expect(markup).toContain('默认 Water 500')
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
