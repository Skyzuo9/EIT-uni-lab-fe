import { useMemo, useState } from 'react'

import { DataAuthorityNotice, ModuleHeader, WorkstationDataState } from '../ModuleHeader'
import { BackendReagentDeleteDialog, BackendReagentEditorDialog } from '../reagents/BackendReagentDialogs'
import { BackendReagentHistory } from '../reagents/BackendReagentHistory'
import type {
  ReagentCreateCommand,
  ReagentInventoryProjection,
  ReagentManagement,
  ReagentUpdateCommand,
  WorkstationDataStatus
} from '../types'
import { buttonClass, pillBaseClass, uiClass } from '../uiClasses'
import { WorkstationIcon, type WorkstationIconName } from '../WorkstationIcon'
import styles from '../workstation.module.scss'

type ReagentDialog =
  | { kind: 'create' }
  | { kind: 'edit'; id: string }
  | { kind: 'delete'; id: string }
  | null

/**
 * 展示真实试剂库存，并在 Backend capability 可用时提供 CRUD 与历史查询。
 * @param props 权威试剂条目、加载状态和可选 Backend 管理端口。
 * @returns Edge 只读或 Backend 可管理的单一试剂工作表面。
 */
export function ReagentModule({
  items,
  status,
  management
}: {
  items?: readonly ReagentInventoryProjection[]
  status: WorkstationDataStatus
  management?: ReagentManagement
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [dialog, setDialog] = useState<ReagentDialog>(null)
  const [historyId, setHistoryId] = useState<string>()
  const [feedback, setFeedback] = useState('')
  const visibleItems = useMemo(() => filterItems(items ?? [], query), [items, query])
  const totals = useMemo(() => summarize(items ?? []), [items])
  const dialogItem = dialog && dialog.kind !== 'create'
    ? items?.find(item => item.id === dialog.id)
    : undefined
  const historyItem = items?.find(item => item.id === historyId)
  const occupiedMaterialIds = useMemo(
    () => new Set((items ?? []).flatMap(item => item.materialId ? [item.materialId] : [])),
    [items]
  )
  const createReady = Boolean(
    management &&
    status.phase === 'ready' &&
    management.containerStatus.phase === 'ready'
  )

  /** 创建提交成功后关闭模态框并等待列表权威回读。 */
  async function createReagent(command: ReagentCreateCommand): Promise<void> {
    if (!management) return
    await management.create(command)
    setDialog(null)
    setFeedback('试剂已由 Backend 创建，正在刷新权威列表。')
  }

  /** 更新提交成功后关闭模态框；界面不在本地推进修订或数量。 */
  async function updateReagent(command: ReagentUpdateCommand): Promise<void> {
    if (!management) return
    await management.update(command)
    setDialog(null)
    setFeedback('试剂修改已提交，正在读取 Backend 最新修订。')
  }

  /** 删除提交成功后清理详情选择，并等待 Backend 软删除后的列表。 */
  async function deleteReagent(item: ReagentInventoryProjection): Promise<void> {
    if (!management) return
    await management.delete(item.id)
    if (historyId === item.id) setHistoryId(undefined)
    setDialog(null)
    setFeedback('试剂已软删除，余量闭合记录已由 Backend 写入台账。')
  }

  return (
    <div className={uiClass.modulePage} data-testid="workstation-reagents">
      <ModuleHeader
        title="试剂管理"
        description={management
          ? '管理 Backend 中容器级试剂实例、当前余量与不可变变更历史。'
          : '读取真实试剂容器或 Edge 库存批次；当前连接不提供同构试剂写接口。'}
        actions={(
          <>
            {management ? (
              <button
                className={buttonClass('primary', 'compact')}
                type="button"
                disabled={!createReady}
                title={createReady ? '新增试剂实例' : management.containerStatus.message}
                onClick={() => setDialog({ kind: 'create' })}
                data-testid="reagent-create"
              >
                <WorkstationIcon name="plus" />
                新增试剂
              </button>
            ) : null}
            {status.retry ? (
              <button className={buttonClass('secondary', 'compact')} type="button" onClick={status.retry}>刷新数据</button>
            ) : null}
          </>
        )}
      />
      {status.phase !== 'ready' || !items ? (
        <WorkstationDataState status={status} title={reagentStateTitle(status)} icon="flask" />
      ) : (
        <>
          <DataAuthorityNotice>
            {management
              ? '试剂身份、数量、修订与历史由 Go Backend 持久化；修改使用 expected_revision，失败或冲突时不会覆盖当前界面事实。'
              : '数量、批次和库区来自当前 Edge 库存权威快照；接口没有返回的维度保持“—”，前端不提供本地写入。'}
          </DataAuthorityNotice>
          <section className={styles.reagentToolbar} aria-label="试剂库存搜索与摘要">
            <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--unilab-color-text-muted)]">
              <strong className="text-[var(--unilab-color-text)]">{totals.count} 条库存</strong>
              <span>可用 {totals.available}</span>
              <span>预留 {totals.reserved}</span>
              <span>隔离 {totals.quarantined}</span>
            </div>
            <label className={styles.searchField}>
              <WorkstationIcon name="search" />
              <span className={uiClass.screenReaderOnly}>搜索试剂库存</span>
              <input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索名称、CAS、容器或 UUID" />
            </label>
          </section>
          {items.length === 0 ? (
            <WorkstationDataState
              status={{
                phase: 'empty',
                message: management
                  ? 'Backend 试剂接口已连接，但当前没有试剂实例。可以选择一个空容器物料创建试剂。'
                  : 'Edge 库存接口已连接，但当前没有明确标记为试剂的批次。',
                retry: status.retry
              }}
              title="暂无试剂库存"
              icon="flask"
            />
          ) : (
            <div className={`${uiClass.panel} ${uiClass.tableScroll} ${styles.reagentLedgerPanel}`}>
              <table className={`${styles.dataTable} ${styles.reagentLedgerTable}`} aria-label="试剂库存">
                <thead>
                  <tr>
                    <th>试剂</th>
                    <th>容器 / 批次</th>
                    <th>当前数量</th>
                    <th>可用 / 预留</th>
                    <th>浓度</th>
                    <th>修订 / 更新时间</th>
                    <th>状态</th>
                    {management ? <th>操作</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {visibleItems.map(item => (
                    <tr key={item.id}>
                      <td data-label="试剂">
                        <strong>{item.name}</strong>
                        <small>{[item.cas, item.molecularFormula, item.physicalState].filter(Boolean).join(' · ') || item.reagentInfoId || item.id}</small>
                      </td>
                      <td data-label="容器 / 批次">
                        {item.lotLabel ?? item.siteLabel ?? '—'}
                        <small>{item.materialId ?? item.id}</small>
                      </td>
                      <td data-label="当前数量">{formatQuantity(item.totalQuantity, item.unit)}</td>
                      <td data-label="可用 / 预留">{formatAvailability(item)}</td>
                      <td data-label="浓度">{formatQuantity(item.concentrationValue, item.concentrationUnit)}</td>
                      <td data-label="修订 / 更新时间">
                        {item.revision ?? '—'}
                        <small>{formatDateTime(item.updatedAt)}</small>
                      </td>
                      <td data-label="状态"><InventoryStatus status={item.status} /></td>
                      {management ? (
                        <td data-label="操作">
                          <div className={uiClass.rowActions}>
                            <RowAction icon="edit" label={`编辑 ${item.name}`} disabled={item.revision == null} onClick={() => setDialog({ kind: 'edit', id: item.id })} />
                            <RowAction icon="history" label={`查看 ${item.name} 历史`} disabled={!item.materialId} onClick={() => setHistoryId(item.id)} />
                            <RowAction icon="trash" label={`删除 ${item.name}`} disabled={item.revision == null} onClick={() => setDialog({ kind: 'delete', id: item.id })} />
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                  {visibleItems.length === 0 ? (
                    <tr><td colSpan={management ? 8 : 7}><div className={uiClass.compactEmptyState}>没有符合搜索条件的试剂库存</div></td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}
          {feedback ? <p className={styles.feedbackLine} role="status">{feedback}</p> : null}
          {historyItem && management ? (
            <BackendReagentHistory
              key={historyItem.id}
              item={historyItem}
              readHistory={management.readHistory}
              onClose={() => setHistoryId(undefined)}
            />
          ) : null}
        </>
      )}
      {dialog?.kind === 'create' && management && management.containers ? (
        <BackendReagentEditorDialog
          mode="create"
          containers={management.containers}
          occupiedMaterialIds={occupiedMaterialIds}
          onSave={createReagent}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === 'edit' && dialogItem && management ? (
        <BackendReagentEditorDialog
          mode="edit"
          item={dialogItem}
          containers={management.containers ?? []}
          occupiedMaterialIds={occupiedMaterialIds}
          onSave={updateReagent}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === 'delete' && dialogItem && management ? (
        <BackendReagentDeleteDialog
          item={dialogItem}
          onDelete={() => deleteReagent(dialogItem)}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </div>
  )
}

/** 按名称、化学身份、容器和稳定 UUID 筛选试剂库存。 */
function filterItems(items: readonly ReagentInventoryProjection[], query: string): readonly ReagentInventoryProjection[] {
  const normalized = query.trim().toLocaleLowerCase('zh-CN')
  if (!normalized) return items
  return items.filter(item => [
    item.name, item.cas, item.molecularFormula, item.lotLabel, item.siteLabel,
    item.materialId, item.reagentInfoId, item.id
  ].filter(Boolean).join(' ').toLocaleLowerCase('zh-CN').includes(normalized))
}

/** 汇总当前权威条目的状态数量，不跨单位相加库存数量。 */
function summarize(items: readonly ReagentInventoryProjection[]): { count: number; available: number; reserved: number; quarantined: number } {
  return {
    count: items.length,
    available: items.filter(item => item.status === 'available').length,
    reserved: items.filter(item => item.status === 'reserved').length,
    quarantined: items.filter(item => item.status === 'quarantined').length
  }
}

/** 格式化一个已知数量；缺失维度显示为未知。 */
function formatQuantity(value: number | undefined, unit: string | undefined): string {
  return value == null ? '—' : `${value.toLocaleString('zh-CN')} ${unit ?? ''}`.trim()
}

/** 同列展示权威可用量与预留量，并保留缺失维度。 */
function formatAvailability(item: ReagentInventoryProjection): string {
  return `${formatQuantity(item.availableQuantity, item.unit)} / ${formatQuantity(item.reservedQuantity, item.unit)}`
}

/** 格式化 Backend 更新时间；缺失或非法值保持未知。 */
function formatDateTime(value: string | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' }).format(date)
}

/** 渲染同时包含文字与语义样式的库存状态。 */
function InventoryStatus({ status }: { status: ReagentInventoryProjection['status'] }): React.JSX.Element {
  return <span className={`${pillBaseClass} ${styles.statusBadge}`} data-status={inventoryStatusTone(status)}>{inventoryStatusLabel(status)}</span>
}

/** 把库存状态映射为现有语义色层级。 */
function inventoryStatusTone(status: ReagentInventoryProjection['status']): 'empty' | 'occupied' | 'unknown' {
  if (status === 'available') return 'empty'
  if (status === 'reserved') return 'occupied'
  return 'unknown'
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
function RowAction({ icon, label, disabled, onClick }: { icon: WorkstationIconName; label: string; disabled: boolean; onClick: () => void }): React.JSX.Element {
  return (
    <button className={buttonClass('secondary', 'icon')} type="button" disabled={disabled} onClick={onClick} aria-label={label} title={disabled ? `${label}（权威字段缺失）` : label}>
      <WorkstationIcon name={icon} />
    </button>
  )
}

/** 返回试剂接口状态的简短标题。 */
function reagentStateTitle(status: WorkstationDataStatus): string {
  if (status.phase === 'loading') return '正在读取试剂库存'
  if (status.phase === 'error') return '试剂库存读取失败'
  if (status.phase === 'unavailable') return '试剂库存接口不可用'
  return '暂无试剂库存'
}
