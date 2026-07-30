import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'

import type { CapabilityStatus } from './MaterialCapabilityNotice'
import { materialScopeClassName } from './materialStyles'
import { MaterialTemplateLibrary } from './MaterialTemplateLibrary'
import type {
  MaterialTemplateCatalogPort,
  MaterialTemplateDetail,
  TemplateMaterialDraft
} from './templateMaterial'
import type { MaterialScope } from './types'

type TemplateKind = 'device' | 'resource'

export interface MaterialTemplateLauncherProps {
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

export function MaterialTemplateLauncher({
  catalog,
  profileId,
  scope,
  readStatus,
  createStatus,
  existingNames,
  onCreate
}: MaterialTemplateLauncherProps): React.JSX.Element {
  const [activeKind, setActiveKind] = useState<TemplateKind | null>(null)
  const scopeKey =
    scope.kind === 'singleton' ? 'singleton' : scope.laboratoryId
  const templates = useQuery({
    queryKey: ['material-templates', profileId, scopeKey],
    queryFn: () => catalog.listTemplates(scope),
    enabled: readStatus.available
  })
  useEffect(() => setActiveKind(null), [profileId, scopeKey])

  const tabs = useMemo(
    () =>
      [
        {
          kind: 'device' as const,
          label: '仪器设备',
          count: templates.data?.items.filter(
            (template) => template.kind === 'device'
          ).length
        },
        {
          kind: 'resource' as const,
          label: '物料耗材',
          count: templates.data?.items.filter(
            (template) => template.kind === 'resource'
          ).length
        }
      ] satisfies readonly {
        kind: TemplateKind
        label: string
        count: number | undefined
      }[],
    [templates.data?.items]
  )
  const activeTab = tabs.find((tab) => tab.kind === activeKind)

  return (
    <div
      className={materialScopeClassName('material-template-launcher')}
    >
      <div
        className="material-template-launcher__tabs"
        aria-label="添加物料"
        role="group"
      >
        {tabs.map((tab) => (
          <button
            key={tab.kind}
            type="button"
            aria-expanded={activeKind === tab.kind}
            className={activeKind === tab.kind ? 'is-active' : undefined}
            disabled={!readStatus.available}
            title={
              readStatus.available
                ? `浏览${tab.label}模板`
                : readStatus.reason
            }
            onClick={() =>
              setActiveKind((current) =>
                current === tab.kind ? null : tab.kind
              )
            }
          >
            <span>{tab.label}</span>
            <small>
              {readStatus.available ? tab.count ?? '…' : '—'}
            </small>
          </button>
        ))}
      </div>

      {activeKind && activeTab ? (
        <>
          <button
            type="button"
            className="material-template-launcher__backdrop"
            aria-label="关闭模板目录"
            onClick={() => setActiveKind(null)}
          />
          <div className="material-template-launcher__panel">
            <MaterialTemplateLibrary
              catalog={catalog}
              profileId={profileId}
              scope={scope}
              kind={activeKind}
              title={activeTab.label}
              readStatus={readStatus}
              createStatus={createStatus}
              existingNames={existingNames}
              onClose={() => setActiveKind(null)}
              onCreate={onCreate}
            />
          </div>
        </>
      ) : null}
    </div>
  )
}
