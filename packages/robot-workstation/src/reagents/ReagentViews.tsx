import { Button } from '@unilab/design-system'

import type { ReagentInfoProjection, ReagentInventoryProjection } from '../types'
import { pillBaseClass, uiClass } from '../uiClasses'
import { WorkstationIcon, type WorkstationIconName } from '../WorkstationIcon'
import styles from '../workstation.module.scss'

export interface ReagentLedgerActions {
  edit(item: ReagentInventoryProjection): void
  history(item: ReagentInventoryProjection): void
  delete(item: ReagentInventoryProjection): void
}

export interface ReagentInfoActions {
  edit(item: ReagentInfoProjection): void
  delete(item: ReagentInfoProjection): void
}

/**
 * 按附件的信息层级展示真实试剂台账，不把缺失的业务字段补成示例值。
 * @param props 权威库存条目、搜索词和可选 Backend 行操作。
 * @returns 包含三项摘要和库存业务列的台账视图。
 */
export function ReagentLedgerView({
  items,
  query,
  actions
}: {
  items: readonly ReagentInventoryProjection[]
  query: string
  actions?: ReagentLedgerActions
}): React.JSX.Element {
  const visibleItems = filterReagentInventory(items, query)
  const totals = summarizeReagentInventory(items)
  return (
    <>
      <div className={styles.reagentStats} aria-label="试剂台账摘要">
        <ReagentStat icon="flask" label="库存实例" value={totals.count} tone="info" />
        <ReagentStat icon="shield" label="当前可用" value={totals.available} tone="success" />
        <ReagentStat icon="point" label="任务预留中" value={totals.reserved} tone="warning" />
      </div>
      <div className={`${uiClass.panel} ${uiClass.tableScroll} ${styles.reagentLedgerPanel}`}>
        <table className={`${styles.dataTable} ${styles.reagentLedgerTable}`} aria-label="试剂台账">
          <thead>
            <tr>
              <th>试剂名称</th>
              <th>密度</th>
              <th>供应商</th>
              <th>有效期</th>
              <th>试剂量</th>
              <th>库位名称</th>
              <th>当前任务</th>
              <th>状态</th>
              {actions ? <th>操作</th> : null}
            </tr>
          </thead>
          <tbody>
            {visibleItems.map(item => (
              <tr key={item.id}>
                <td data-label="试剂名称">
                  <strong>{item.name}</strong>
                  <small>{[item.cas, item.lotLabel].filter(Boolean).join(' · ') || '—'}</small>
                </td>
                <td data-label="密度">{formatDensity(item)}</td>
                <td data-label="供应商">{metadataText(item.metadata, ['supplier', 'vendor']) ?? '—'}</td>
                <td data-label="有效期" className={uiClass.mono}>{formatDate(item.expiresAt)}</td>
                <td data-label="试剂量">
                  <strong>{formatQuantity(item.totalQuantity, item.unit)}</strong>
                  <small>可用 / 预留：{formatAvailability(item)}</small>
                </td>
                <td data-label="库位名称">{item.siteLabel ?? '—'}</td>
                <td data-label="当前任务">{metadataText(item.metadata, ['current_task', 'workflow_task', 'task_id']) ?? '—'}</td>
                <td data-label="状态"><InventoryStatus status={item.status} /></td>
                {actions ? (
                  <td data-label="操作">
                    <div className={uiClass.rowActions}>
                      <RowAction icon="edit" label={`编辑 ${item.name}`} disabled={item.revision == null} onClick={() => actions.edit(item)} />
                      <RowAction icon="history" label={`查看 ${item.name} 历史`} disabled={!item.materialId} onClick={() => actions.history(item)} />
                      <RowAction icon="trash" label={`删除 ${item.name}`} disabled={item.revision == null} onClick={() => actions.delete(item)} />
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
            {visibleItems.length === 0 ? (
              <tr><td colSpan={actions ? 9 : 8}><div className={uiClass.compactEmptyState}>没有符合搜索条件的试剂台账</div></td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  )
}

/**
 * 展示 Backend 化学品字典，并在能力开放时提供纠错与受限删除入口。
 * @param props 权威基础信息条目、当前搜索词和可选行操作。
 * @returns 与附件试剂库列结构一致的表格。
 */
export function ReagentLibraryView({
  infos,
  query,
  actions
}: {
  infos: readonly ReagentInfoProjection[]
  query: string
  actions?: ReagentInfoActions
}): React.JSX.Element {
  const visibleInfos = filterReagentInfos(infos, query)
  return (
    <section className={uiClass.panel}>
      <div className={uiClass.panelHeader}>
        <div>
          <h2>试剂基础信息</h2>
          <small>Backend 化学品字典，共 {infos.length} 条</small>
        </div>
        <span className={`${pillBaseClass} ${styles.libraryModeBadge}`}>
          {actions ? '可维护' : '只读'}
        </span>
      </div>
      <div className={uiClass.tableScroll}>
        <table className={`${styles.dataTable} ${styles.reagentLibraryTable}`} aria-label="试剂基础信息库">
          <thead>
            <tr>
              <th>试剂名称</th>
              <th>CAS 号</th>
              <th>分子式</th>
              <th>结构式</th>
              <th>分子量</th>
              <th>常温形态</th>
              <th>自定义参数</th>
              {actions ? <th>操作</th> : null}
            </tr>
          </thead>
          <tbody>
            {visibleInfos.map(info => (
              <tr key={info.id}>
                <td data-label="试剂名称">
                  <strong>{info.name}</strong>
                  <small>{formatAliases(info)}</small>
                </td>
                <td data-label="CAS 号" className={uiClass.mono}>{info.cas ?? '—'}</td>
                <td data-label="分子式">{info.molecularFormula ?? '—'}</td>
                <td data-label="结构式" className={uiClass.mono}>{info.smiles ?? '—'}</td>
                <td data-label="分子量">{info.molecularWeight == null ? '—' : `${info.molecularWeight.toLocaleString('zh-CN')} g/mol`}</td>
                <td data-label="常温形态">{physicalStateLabel(info.physicalState)}</td>
                <td data-label="自定义参数">{formatInfoParameters(info)}</td>
                {actions ? (
                  <td data-label="操作">
                    <div className={uiClass.rowActions}>
                      <RowAction icon="edit" label={`编辑试剂基础信息 ${info.name}`} disabled={false} onClick={() => actions.edit(info)} />
                      <RowAction icon="trash" label={`删除试剂基础信息 ${info.name}`} disabled={false} onClick={() => actions.delete(info)} />
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
            {visibleInfos.length === 0 ? (
              <tr><td colSpan={actions ? 8 : 7}><div className={uiClass.compactEmptyState}>没有符合搜索条件的试剂基础信息</div></td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/** 按台账所有可见业务身份筛选权威库存条目。 */
export function filterReagentInventory(
  items: readonly ReagentInventoryProjection[],
  query: string
): readonly ReagentInventoryProjection[] {
  const normalized = normalizeQuery(query)
  if (!normalized) return items
  return items.filter(item => [
    item.name, item.cas, item.molecularFormula, item.lotLabel, item.siteLabel,
    item.materialId, item.reagentInfoId, item.id,
    ...['supplier', 'vendor', 'current_task', 'workflow_task', 'task_id']
      .map(key => metadataText(item.metadata, [key]))
  ].filter(Boolean).join(' ').toLocaleLowerCase('zh-CN').includes(normalized))
}

/** 按名称、别名、CAS 和结构字段筛选试剂基础信息。 */
export function filterReagentInfos(
  infos: readonly ReagentInfoProjection[],
  query: string
): readonly ReagentInfoProjection[] {
  const normalized = normalizeQuery(query)
  if (!normalized) return infos
  return infos.filter(info => [
    info.name, info.nameEn, ...info.aliases, info.cas, info.molecularFormula,
    info.smiles, info.inchiKey, info.physicalState
  ].filter(Boolean).join(' ').toLocaleLowerCase('zh-CN').includes(normalized))
}

/** 汇总库存实例数、可用实例数和可被证明的预留实例数。 */
function summarizeReagentInventory(items: readonly ReagentInventoryProjection[]): {
  count: number
  available: number
  reserved: number | '—'
} {
  const reservedKnown = items.some(item => item.reservedQuantity != null || item.status === 'reserved')
  return {
    count: items.length,
    available: items.filter(item => item.status === 'available').length,
    reserved: reservedKnown
      ? items.filter(item => (item.reservedQuantity ?? 0) > 0 || item.status === 'reserved').length
      : '—'
  }
}

/** 渲染附件风格的紧凑台账摘要项。 */
function ReagentStat({
  icon,
  label,
  value,
  tone
}: {
  icon: 'flask' | 'shield' | 'point'
  label: string
  value: number | string
  tone: 'info' | 'success' | 'warning'
}): React.JSX.Element {
  return (
    <div data-tone={tone}>
      <span><WorkstationIcon name={icon} /></span>
      <span><small>{label}</small><strong>{value}</strong></span>
    </div>
  )
}

/** 渲染同时包含文字与语义色的库存状态。 */
function InventoryStatus({ status }: { status: ReagentInventoryProjection['status'] }): React.JSX.Element {
  return (
    <span className={`${pillBaseClass} ${styles.reagentStatus}`} data-tone={inventoryStatusTone(status)}>
      <span aria-hidden="true" />
      {inventoryStatusLabel(status)}
    </span>
  )
}

/** 将库存状态映射到现有语义色层级。 */
function inventoryStatusTone(status: ReagentInventoryProjection['status']): 'success' | 'info' | 'warning' | 'archived' {
  if (status === 'available') return 'success'
  if (status === 'reserved') return 'info'
  if (status === 'empty') return 'archived'
  return 'warning'
}

/** 返回库存状态中文标签。 */
function inventoryStatusLabel(status: ReagentInventoryProjection['status']): string {
  if (status === 'available') return '可用'
  if (status === 'reserved') return '已预留'
  if (status === 'empty') return '已耗尽'
  if (status === 'quarantined') return '已隔离'
  return '状态不明'
}

/** 渲染带可访问名称的紧凑行操作。 */
function RowAction({
  icon,
  label,
  disabled,
  onClick
}: {
  icon: WorkstationIconName
  label: string
  disabled: boolean
  onClick: () => void
}): React.JSX.Element {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      title={disabled ? `${label}（权威字段缺失）` : label}
    >
      <WorkstationIcon name={icon} />
    </Button>
  )
}

/** 格式化实例密度及其可选测定条件。 */
function formatDensity(item: ReagentInventoryProjection): string {
  if (item.densityGPerMl == null) return '—'
  const condition = metadataText(item.metadata, ['density_condition'])
  return `${item.densityGPerMl.toLocaleString('zh-CN')} g/mL${condition ? ` · ${condition}` : ''}`
}

/** 格式化一个已知数量；缺失维度显示为未知。 */
function formatQuantity(value: number | undefined, unit: string | undefined): string {
  return value == null ? '—' : `${value.toLocaleString('zh-CN')} ${unit ?? ''}`.trim()
}

/** 同列展示权威可用量与预留量，并保留缺失维度。 */
function formatAvailability(item: ReagentInventoryProjection): string {
  return `${formatQuantity(item.availableQuantity, item.unit)} / ${formatQuantity(item.reservedQuantity, item.unit)}`
}

/** 格式化有效期为本地日期；非法值保持原文。 */
function formatDate(value: string | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(date)
}

/** 从元数据中的候选键读取第一个标量文本，不解释对象结构。 */
function metadataText(metadata: Record<string, unknown> | undefined, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = metadata?.[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return undefined
}

/** 合并英文名和别名作为名称的次级说明。 */
function formatAliases(info: ReagentInfoProjection): string {
  return [info.nameEn, ...info.aliases].filter(Boolean).join(' · ') || '—'
}

/** 把参考密度和标量元数据显示为只读自定义参数。 */
function formatInfoParameters(info: ReagentInfoProjection): string {
  const entries = Object.entries(info.metadata ?? {}).flatMap(([key, value]) =>
    typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
      ? [`${metadataLabel(key)}: ${String(value)}`]
      : []
  )
  if (info.densityGPerMl != null) entries.unshift(`参考密度: ${info.densityGPerMl.toLocaleString('zh-CN')} g/mL`)
  return entries.slice(0, 3).join('；') || '—'
}

/** 将常见元数据键转为产品中文，其余键保持服务端名称。 */
function metadataLabel(key: string): string {
  if (key === 'storage') return '储存要求'
  if (key === 'hazard') return '危险性'
  if (key === 'supplier') return '供应商'
  return key
}

/** 将 Backend 物态枚举转为中文产品文案。 */
function physicalStateLabel(value: string): string {
  if (value === 'liquid') return '液体'
  if (value === 'solid') return '固体'
  if (value === 'gas') return '气体'
  if (value === 'other') return '其他'
  if (value === 'unknown') return '未知'
  return value || '—'
}

/** 规范搜索词，使用中文区域的小写规则。 */
function normalizeQuery(query: string): string {
  return query.trim().toLocaleLowerCase('zh-CN')
}
