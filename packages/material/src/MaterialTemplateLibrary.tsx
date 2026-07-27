import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'

import {
  MaterialCapabilityNotice,
  type CapabilityStatus
} from './MaterialCapabilityNotice'
import { MaterialCreateDialog } from './MaterialCreateDialog'
import { MaterialTemplateCard } from './MaterialTemplateCard'
import type {
  MaterialTemplateCatalogPort,
  MaterialTemplateDetail,
  TemplateMaterialDraft
} from './templateMaterial'
import type { MaterialScope } from './types'

export interface MaterialTemplateLibraryProps {
  catalog: MaterialTemplateCatalogPort
  profileId: string
  scope: MaterialScope
  readStatus: CapabilityStatus
  createStatus: CapabilityStatus
  existingNames: readonly string[]
  onCreate: (
    template: MaterialTemplateDetail,
    draft: TemplateMaterialDraft
  ) => Promise<void> | void
}

export function MaterialTemplateLibrary({
  catalog,
  profileId,
  scope,
  readStatus,
  createStatus,
  existingNames,
  onCreate
}: MaterialTemplateLibraryProps): React.JSX.Element {
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const scopeKey =
    scope.kind === 'singleton' ? 'singleton' : scope.laboratoryId

  const templates = useQuery({
    queryKey: [
      'material-templates',
      profileId,
      scopeKey,
      search.trim()
    ],
    queryFn: () =>
      catalog.listTemplates(scope, {
        name: search.trim() || undefined,
        page: 1,
        pageSize: 50
      }),
    enabled: readStatus.available
  })

  const selectedTemplate = useQuery({
    queryKey: [
      'material-template',
      profileId,
      scopeKey,
      selectedId
    ],
    queryFn: () => catalog.getTemplate(scope, selectedId ?? ''),
    enabled: readStatus.available && Boolean(selectedId)
  })

  const selectedSummary = useMemo(
    () =>
      templates.data?.items.find((item) => item.uuid === selectedId) ?? null,
    [selectedId, templates.data?.items]
  )

  return (
    <aside className="material-template-library">
      <header>
        <div>
          <span>物料目录</span>
          <h2>物料模板</h2>
        </div>
        <span className="material-template-library__count">
          {templates.data?.total ?? 0}
        </span>
      </header>

      <MaterialCapabilityNotice
        title="模板目录不可用"
        status={readStatus}
      />

      {readStatus.available ? (
        <>
          <input
            className="material-template-library__search"
            type="search"
            value={search}
            placeholder="搜索模板名称"
            onChange={(event) => setSearch(event.target.value)}
          />

          <div className="material-template-library__list">
            {templates.isPending ? (
              <p>正在加载模板…</p>
            ) : templates.isError ? (
              <p className="is-error">
                模板加载失败，请检查服务连接后重试。
              </p>
            ) : templates.data?.items.length ? (
              templates.data.items.map((template) => (
                <MaterialTemplateCard
                  key={template.uuid}
                  template={template}
                  selected={template.uuid === selectedId}
                  onSelect={setSelectedId}
                />
              ))
            ) : (
              <p>没有匹配的模板</p>
            )}
          </div>

          <div className="material-template-library__detail">
            {selectedSummary ? (
              <>
                <strong>{selectedSummary.name}</strong>
                <p>
                  {selectedTemplate.data?.description ||
                    selectedSummary.description ||
                    '暂无模板说明'}
                </p>
                <button
                  type="button"
                  disabled={
                    !createStatus.available ||
                    selectedTemplate.isPending ||
                    !selectedTemplate.data
                  }
                  title={createStatus.reason}
                  onClick={() => setCreating(true)}
                >
                  从该模板创建
                </button>
                {!createStatus.available ? (
                  <small>
                    {createStatus.reason ?? '当前服务配置不支持创建物料'}
                  </small>
                ) : null}
              </>
            ) : (
              <p>选择模板查看详情</p>
            )}
          </div>
        </>
      ) : null}

      {creating && selectedTemplate.data ? (
        <MaterialCreateDialog
          template={selectedTemplate.data}
          existingNames={existingNames}
          createStatus={createStatus}
          onCancel={() => setCreating(false)}
          onCreate={async (draft) => {
            await onCreate(selectedTemplate.data, draft)
            setCreating(false)
          }}
        />
      ) : null}
    </aside>
  )
}
