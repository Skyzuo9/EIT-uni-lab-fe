import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties
} from 'react'

import { useMaterialStore } from './MaterialStoreProvider'
import type {
  MaterialAggregate,
  MaterialId,
  MaterialPlacement
} from './types'

export interface MaterialTreeSidebarProps {
  selectedMaterialIds?: readonly MaterialId[]
  onSelectionChange?: (materialIds: readonly MaterialId[]) => void
}

export interface MaterialTreeEntry {
  aggregate: MaterialAggregate
  children: readonly MaterialTreeEntry[]
}

export function MaterialTreeSidebar({
  selectedMaterialIds = [],
  onSelectionChange
}: MaterialTreeSidebarProps): React.JSX.Element {
  const [open, setOpen] = useState(true)
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<MaterialId>>(
    new Set()
  )
  const aggregatesById = useMaterialStore(
    (state) => state.aggregatesById
  )
  const graphIndex = useMaterialStore((state) => state.graphIndex)
  const entries = useMemo(
    () => buildMaterialTree(aggregatesById, graphIndex.childrenByParentId),
    [aggregatesById, graphIndex.childrenByParentId]
  )
  const selected = new Set(selectedMaterialIds)

  useEffect(() => {
    if (selectedMaterialIds.length === 0) return
    setExpandedIds((current) => {
      const next = new Set(current)
      for (const materialId of selectedMaterialIds) {
        let aggregate = aggregatesById[materialId]
        while (aggregate) {
          const parentId = placementParentId(aggregate.placement)
          if (!parentId) break
          next.add(parentId)
          aggregate = aggregatesById[parentId]
        }
      }
      return next
    })
  }, [aggregatesById, selectedMaterialIds])

  if (!open) {
    return (
      <aside
        aria-label="物料列表"
        className="material-tree-sidebar is-collapsed"
      >
        <button
          type="button"
          className="material-tree-sidebar__reopen"
          aria-label="展开物料列表"
          onClick={() => setOpen(true)}
        >
          <PanelOpenIcon />
        </button>
      </aside>
    )
  }

  return (
    <aside className="material-tree-sidebar">
      <header>
        <div>
          <span>物料列表</span>
          <strong>({Object.keys(aggregatesById).length})</strong>
        </div>
        <button
          type="button"
          aria-label="收起物料列表"
          onClick={() => setOpen(false)}
        >
          <PanelCloseIcon />
        </button>
      </header>
      <div className="material-tree-sidebar__tree" role="tree">
        {entries.length === 0 ? (
          <p>暂无物料</p>
        ) : (
          entries.map((entry) => (
            <MaterialTreeRow
              key={entry.aggregate.material.id}
              depth={0}
              entry={entry}
              expandedIds={expandedIds}
              selectedIds={selected}
              onSelect={(materialId) =>
                onSelectionChange?.([materialId])
              }
              onToggle={(materialId) => {
                setExpandedIds((current) => {
                  const next = new Set(current)
                  if (next.has(materialId)) next.delete(materialId)
                  else next.add(materialId)
                  return next
                })
              }}
            />
          ))
        )}
      </div>
      <div
        className="material-tree-sidebar__resize-hint"
        aria-hidden="true"
      />
    </aside>
  )
}

function MaterialTreeRow({
  entry,
  depth,
  expandedIds,
  selectedIds,
  onSelect,
  onToggle
}: {
  entry: MaterialTreeEntry
  depth: number
  expandedIds: ReadonlySet<MaterialId>
  selectedIds: ReadonlySet<MaterialId>
  onSelect: (materialId: MaterialId) => void
  onToggle: (materialId: MaterialId) => void
}): React.JSX.Element {
  const materialId = entry.aggregate.material.id
  const hasChildren = entry.children.length > 0
  const expanded = hasChildren && expandedIds.has(materialId)
  const rowStyle = {
    '--material-tree-depth': depth
  } as CSSProperties

  return (
    <>
      <div
        className="material-tree-sidebar__row"
        data-material-tree-id={materialId}
        role="treeitem"
        aria-expanded={hasChildren ? expanded : undefined}
        aria-level={depth + 1}
        aria-selected={selectedIds.has(materialId)}
        style={rowStyle}
      >
        <span className="material-tree-sidebar__grip" aria-hidden="true">
          ⠿
        </span>
        {hasChildren ? (
          <button
            type="button"
            className="material-tree-sidebar__toggle"
            aria-label={`${expanded ? '收起' : '展开'} ${entry.aggregate.material.name}`}
            onClick={() => onToggle(materialId)}
          >
            <ChevronIcon expanded={expanded} />
          </button>
        ) : (
          <span className="material-tree-sidebar__toggle-spacer" />
        )}
        <button
          type="button"
          className="material-tree-sidebar__label"
          title={entry.aggregate.material.name}
          onClick={() => onSelect(materialId)}
        >
          {entry.aggregate.material.name}
        </button>
      </div>
      {expanded
        ? entry.children.map((child) => (
            <MaterialTreeRow
              key={child.aggregate.material.id}
              depth={depth + 1}
              entry={child}
              expandedIds={expandedIds}
              selectedIds={selectedIds}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))
        : null}
    </>
  )
}

export function buildMaterialTree(
  aggregatesById: Readonly<Record<MaterialId, MaterialAggregate>>,
  childrenByParentId: Readonly<Record<MaterialId, readonly MaterialId[]>>
): readonly MaterialTreeEntry[] {
  const roots = Object.values(aggregatesById)
    .filter((aggregate) => !placementParentId(aggregate.placement))
    .sort(compareAggregates)

  const build = (aggregate: MaterialAggregate): MaterialTreeEntry => ({
    aggregate,
    children: (childrenByParentId[aggregate.material.id] ?? [])
      .map((materialId) => aggregatesById[materialId])
      .filter(
        (candidate): candidate is MaterialAggregate => candidate != null
      )
      .sort(compareAggregates)
      .map(build)
  })

  return roots.map(build)
}

function compareAggregates(
  left: MaterialAggregate,
  right: MaterialAggregate
): number {
  return (
    left.material.name.localeCompare(right.material.name, 'zh-CN') ||
    left.material.id.localeCompare(right.material.id)
  )
}

function placementParentId(
  placement: MaterialPlacement
): MaterialId | null {
  return placement.kind === 'parent' || placement.kind === 'site'
    ? placement.parentId
    : null
}

function ChevronIcon({
  expanded
}: {
  expanded: boolean
}): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      className={expanded ? 'is-expanded' : undefined}
      viewBox="0 0 12 12"
    >
      <path d="m4 2.5 3.5 3.5L4 9.5" />
    </svg>
  )
}

function PanelCloseIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 18 18">
      <path d="M3 4.5h12M3 9h12M3 13.5h12M6 3v12" />
      <path d="m11 7-2 2 2 2" />
    </svg>
  )
}

function PanelOpenIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 18 18">
      <path d="M3 4.5h12M3 9h12M3 13.5h12M6 3v12" />
      <path d="m9 7 2 2-2 2" />
    </svg>
  )
}
