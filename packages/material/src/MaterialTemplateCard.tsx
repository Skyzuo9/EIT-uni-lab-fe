import type { MaterialTemplateSummary } from './templateMaterial'
import { materialScopeClassName } from './materialStyles'

export function MaterialTemplateCard({
  template,
  selected,
  onSelect
}: {
  template: MaterialTemplateSummary
  selected: boolean
  onSelect: (templateId: string) => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={materialScopeClassName(
        `material-template-card${selected ? ' is-selected' : ''}`
      )}
      onClick={() => onSelect(template.uuid)}
      aria-pressed={selected}
    >
      <span className="material-template-card__icon" aria-hidden="true">
        {isAssetUrl(template.icon) ? (
          <img src={template.icon} alt="" />
        ) : (
          templateGlyph(template.icon, template.kind)
        )}
      </span>
      <span className="material-template-card__body">
        <strong>{template.displayName}</strong>
        <span>
          {template.kind === 'device' ? '仪器设备' : '物料耗材'}
          {template.tags.length ? ` · ${template.tags.join(' · ')}` : ''}
        </span>
        {template.status === 'unresolved' ? (
          <small title={template.statusReason}>实现不可用</small>
        ) : null}
      </span>
    </button>
  )
}

function isAssetUrl(icon: string | undefined): icon is string {
  return Boolean(
    icon &&
      (/^(?:https?:)?\/\//.test(icon) || icon.startsWith('/'))
  )
}

function templateGlyph(
  icon: string | undefined,
  kind: MaterialTemplateSummary['kind']
): string {
  if (icon === 'liquid-handler') return '⇣'
  if (icon === 'plate') return '▦'
  if (icon === 'container') return '▤'
  return kind === 'device' ? '◇' : '▦'
}
