import MenuUnfoldOutlined from '@ant-design/icons/MenuUnfoldOutlined'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties
} from 'react'

import { useMaterialStore } from './MaterialStoreProvider'
import { materialScopeClassName } from './materialStyles'
import type {
  MaterialAggregate,
  MaterialId,
  MaterialPlacement,
  MaterialSite
} from './types'

export interface MaterialTreeSidebarProps {
  selectedMaterialIds?: readonly MaterialId[]
  onSelectionChange?: (materialIds: readonly MaterialId[]) => void
}

export interface MaterialTreeEntry {
  kind: 'material'
  aggregate: MaterialAggregate
  occupyingSite?: MaterialSite
  children: readonly MaterialTreeNode[]
}

export interface MaterialTreeSiteEntry {
  kind: 'empty-site'
  ownerMaterialId: MaterialId
  site: MaterialSite
}

export type MaterialTreeNode = MaterialTreeEntry | MaterialTreeSiteEntry

export function MaterialTreeSidebar({
  selectedMaterialIds = [],
  onSelectionChange
}: MaterialTreeSidebarProps): React.JSX.Element {
  const [open, setOpen] = useState(initialMaterialTreeOpen)
  const reopenButtonRef = useRef<HTMLButtonElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const previousOpenRef = useRef(open)
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

  useEffect(() => {
    if (previousOpenRef.current === open) return
    const target = open ? closeButtonRef.current : reopenButtonRef.current
    previousOpenRef.current = open
    target?.focus()
  }, [open])

  useEffect(() => {
    if (!open || !isMobileMaterialViewport()) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    globalThis.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      globalThis.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  if (!open) {
    return (
      <button
        ref={reopenButtonRef}
        type="button"
        className={materialScopeClassName(
          'material-tree-sidebar__reopen'
        )}
        aria-label="展开物料列表"
        aria-controls="material-tree-sidebar"
        onClick={() => setOpen(true)}
      >
        <MenuUnfoldOutlined aria-hidden="true" />
      </button>
    )
  }

  return (
    <>
      <button
        type="button"
        className={materialScopeClassName(
          'material-tree-sidebar__backdrop'
        )}
        aria-label="关闭物料列表"
        onClick={() => setOpen(false)}
      />
      <aside
        id="material-tree-sidebar"
        className={materialScopeClassName('material-tree-sidebar')}
        aria-label="物料目录"
      >
      <header>
        <div>
          <span>物料列表</span>
          <strong>({Object.keys(aggregatesById).length})</strong>
        </div>
        <button
          ref={closeButtonRef}
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
    </>
  )
}

export function initialMaterialTreeOpen(): boolean {
  return !isMobileMaterialViewport()
}

function isMobileMaterialViewport(): boolean {
  return typeof globalThis.matchMedia !== 'function'
    ? false
    : globalThis.matchMedia('(max-width: 720px)').matches
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
        data-material-tree-site-id={entry.occupyingSite?.id}
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
        {entry.occupyingSite ? (
          <SiteStatus site={entry.occupyingSite} occupied />
        ) : null}
      </div>
      {expanded
        ? entry.children.map((child) =>
            child.kind === 'material' ? (
              <MaterialTreeRow
                key={child.aggregate.material.id}
                depth={depth + 1}
                entry={child}
                expandedIds={expandedIds}
                selectedIds={selectedIds}
                onSelect={onSelect}
                onToggle={onToggle}
              />
            ) : (
              <MaterialTreeEmptySiteRow
                key={child.site.id}
                depth={depth + 1}
                entry={child}
              />
            )
          )
        : null}
    </>
  )
}

function MaterialTreeEmptySiteRow({
  entry,
  depth
}: {
  entry: MaterialTreeSiteEntry
  depth: number
}): React.JSX.Element {
  return (
    <div
      className="material-tree-sidebar__row material-tree-sidebar__row--site"
      data-material-tree-site-id={entry.site.id}
      data-site-occupancy="empty"
      role="treeitem"
      aria-label={`${entry.site.name}，未占用`}
      aria-level={depth + 1}
      style={{ '--material-tree-depth': depth } as CSSProperties}
    >
      <span className="material-tree-sidebar__grip" aria-hidden="true" />
      <span className="material-tree-sidebar__toggle-spacer" />
      <span
        className="material-tree-sidebar__site-label"
        title={entry.site.name}
      >
        {entry.site.name}
      </span>
      <SiteStatus site={entry.site} occupied={false} />
    </div>
  )
}

function SiteStatus({
  site,
  occupied
}: {
  site: MaterialSite
  occupied: boolean
}): React.JSX.Element {
  const state = occupied ? 'occupied' : 'empty'
  return (
    <span
      className={`material-tree-sidebar__site-status is-${state}`}
      data-site-occupancy={state}
      role="img"
      aria-label={`${site.name}，${occupied ? '已占用' : '未占用'}`}
      title={`${site.name} · ${occupied ? '已占用' : '未占用'}`}
    />
  )
}

export function buildMaterialTree(
  aggregatesById: Readonly<Record<MaterialId, MaterialAggregate>>,
  childrenByParentId: Readonly<Record<MaterialId, readonly MaterialId[]>>
): readonly MaterialTreeEntry[] {
  const roots = Object.values(aggregatesById)
    .filter((aggregate) => !placementParentId(aggregate.placement))
    .sort(compareAggregates)

  const build = (
    aggregate: MaterialAggregate,
    occupyingSite?: MaterialSite
  ): MaterialTreeEntry => {
    const directChildren = (childrenByParentId[aggregate.material.id] ?? [])
      .map((materialId) => aggregatesById[materialId])
      .filter(
        (candidate): candidate is MaterialAggregate => candidate != null
      )
    const childById = new Map(
      directChildren.map((child) => [child.material.id, child])
    )
    const siteOccupantIds = new Set<MaterialId>()
    const siteNodes = aggregate.sites.map((site): MaterialTreeNode => {
      const occupantId = site.occupiedMaterialIds[0]
      const occupant = occupantId ? childById.get(occupantId) : undefined
      if (occupant) {
        siteOccupantIds.add(occupant.material.id)
        return build(occupant, site)
      }
      return {
        kind: 'empty-site',
        ownerMaterialId: aggregate.material.id,
        site
      }
    })
    const unboundChildren = directChildren
      .filter((child) => !siteOccupantIds.has(child.material.id))
      .sort(compareAggregates)
      .map((child) => build(child))
    return {
      kind: 'material',
      aggregate,
      occupyingSite,
      children: [...siteNodes, ...unboundChildren]
    }
  }

  return roots.map((aggregate) => build(aggregate))
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
