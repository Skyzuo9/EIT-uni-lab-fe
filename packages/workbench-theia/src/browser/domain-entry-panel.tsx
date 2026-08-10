import * as React from 'react'

import type { WorkbenchViewMode } from './workbench-view-state'

export interface DomainEntryDefinition {
  mode: WorkbenchViewMode
  label: string
  caption: string
  description: string
  iconClass: string
  eyebrow: string
}

export function DomainEntryPanel({
  entry,
  active,
  onOpen
}: {
  entry: DomainEntryDefinition
  active: boolean
  onOpen: () => void
}): React.JSX.Element {
  return (
    <section
      className="unilab-domain-entry"
      data-domain-entry={entry.mode}
      aria-label={`${entry.label}入口`}
    >
      <span className="unilab-domain-entry__eyebrow">{entry.eyebrow}</span>
      <div className="unilab-domain-entry__identity">
        <span className={`codicon ${entry.iconClass}`} aria-hidden="true" />
        <div>
          <strong>{entry.label}</strong>
          <small>{active ? '已在主区打开' : '可在主区打开'}</small>
        </div>
      </div>
      <p>{entry.description}</p>
      <button type="button" onClick={onOpen}>
        {active ? '聚焦主区' : `打开${entry.label}`}
      </button>
    </section>
  )
}
