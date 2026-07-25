import type { MaterialTemplateSummary } from './templateMaterial'

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
      className={`material-template-card${selected ? ' is-selected' : ''}`}
      onClick={() => onSelect(template.uuid)}
      aria-pressed={selected}
    >
      <span className="material-template-card__icon" aria-hidden="true">
        {template.icon || (template.resourceType === 'device' ? '◈' : '◇')}
      </span>
      <span className="material-template-card__body">
        <strong>{template.name}</strong>
        <span>
          {template.resourceType === 'device' ? '设备' : '资源'}
          {template.tags.length ? ` · ${template.tags.join(' · ')}` : ''}
        </span>
      </span>
    </button>
  )
}
