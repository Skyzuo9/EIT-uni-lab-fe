import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'

import {
  MaterialCapabilityNotice,
  type CapabilityStatus
} from './MaterialCapabilityNotice'
import { MaterialCreateDialog } from './MaterialCreateDialog'
import { MaterialTemplateCard } from './MaterialTemplateCard'
import { materialScopeClassName } from './materialStyles'
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
  kind?: 'device' | 'resource'
  title?: string
  readStatus: CapabilityStatus
  createStatus: CapabilityStatus
  existingNames: readonly string[]
  onClose?: () => void
  onCreate: (
    template: MaterialTemplateDetail,
    draft: TemplateMaterialDraft
  ) => Promise<void> | void
}

export function MaterialTemplateLibrary({
  catalog,
  profileId,
  scope,
  kind,
  title = '物料模板',
  readStatus,
  createStatus,
  existingNames,
  onClose,
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
      scopeKey
    ],
    queryFn: () => catalog.listTemplates(scope),
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
  const filteredTemplates = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('zh-CN')
    return (templates.data?.items ?? []).filter((template) => {
      if (kind && template.kind !== kind) return false
      if (!needle) return true
      return [
        template.displayName,
        template.key,
        ...template.tags,
        ...template.categoryPath
      ].some((value) =>
        value.toLocaleLowerCase('zh-CN').includes(needle)
      )
    })
  }, [kind, search, templates.data?.items])
  const createReason =
    templates.data?.stale
      ? '当前展示缓存目录，重新连接 OS 后方可创建'
      : selectedTemplate.data?.status !== 'ready'
        ? selectedTemplate.data?.statusReason ?? '模板实现当前不可用'
        : selectedTemplate.data?.creation.available === false
          ? selectedTemplate.data.creation.reason
          : createStatus.reason
  const canCreate = Boolean(
    createStatus.available &&
    !templates.data?.stale &&
    selectedTemplate.data?.status === 'ready' &&
    selectedTemplate.data.creation.available
  )

  return (
    <aside
      className={materialScopeClassName('material-template-library')}
    >
      <header>
        <div>
          <span>物料目录</span>
          <h2>{title}</h2>
        </div>
        <div className="material-template-library__header-actions">
          <span
            className="material-template-library__count"
            aria-label={`共 ${filteredTemplates.length} 个物料模板`}
          >
            {filteredTemplates.length}
          </span>
          {onClose ? (
            <button
              type="button"
              aria-label="关闭模板目录"
              onClick={onClose}
            >
              ×
            </button>
          ) : null}
        </div>
      </header>

      <MaterialCapabilityNotice
        title="模板目录不可用"
        status={readStatus}
      />

      {readStatus.available ? (
        <>
          {templates.data?.stale ? (
            <div
              className="material-template-library__stale"
              role="status"
            >
              <span>当前展示缓存模板目录，创建功能已禁用。</span>
              <button
                type="button"
                onClick={() => void templates.refetch()}
              >
                重新连接
              </button>
            </div>
          ) : null}
          <input
            className="material-template-library__search"
            type="search"
            value={search}
            aria-label="搜索物料模板"
            placeholder="搜索名称、类型键、分类或标签"
            onChange={(event) => setSearch(event.target.value)}
          />

          <div className="material-template-library__list">
            {templates.isPending ? (
              <div
                className="material-template-library__skeleton"
                aria-label="正在加载模板"
              >
                <i />
                <i />
                <i />
              </div>
            ) : templates.isError ? (
              <div className="material-template-library__error">
                <p className="is-error">
                  模板加载失败，请检查 OS Registry 连接。
                </p>
                <button
                  type="button"
                  onClick={() => void templates.refetch()}
                >
                  重试
                </button>
              </div>
            ) : filteredTemplates.length ? (
              filteredTemplates.map((template) => (
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
                <strong>{selectedSummary.displayName}</strong>
                <span className="material-template-library__key">
                  {selectedSummary.key}
                </span>
                <p>
                  {selectedTemplate.data?.description ||
                    selectedSummary.description ||
                    '暂无模板说明'}
                </p>
                <button
                  type="button"
                  disabled={
                    !canCreate ||
                    selectedTemplate.isPending ||
                    !selectedTemplate.data
                  }
                  title={createReason}
                  onClick={() => setCreating(true)}
                >
                  从该模板创建
                </button>
                {!canCreate && selectedTemplate.data ? (
                  <small>
                    {createReason ?? '当前服务配置不支持创建物料'}
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
