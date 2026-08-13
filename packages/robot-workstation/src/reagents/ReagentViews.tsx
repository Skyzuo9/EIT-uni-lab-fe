import { calculateAvailableQuantity } from './reagentModel'
import type { ReagentDefinition, ReagentLedgerRow } from '../types'
import { buttonClass, pillBaseClass, uiClass } from '../uiClasses'
import { WorkstationIcon, type WorkstationIconName } from '../WorkstationIcon'
import styles from '../workstation.module.scss'

export type ReagentViewDialog =
  | { kind: 'definition'; id?: string }
  | {
      kind: 'edit-ledger' | 'delete-ledger' | 'archive' | 'records'
      id: string
    }
  | { kind: 'delete-definition'; id: string }

export function LedgerView({
  rows,
  definitions,
  activeCount,
  availableRows,
  unknownCount,
  onDialog,
}: {
  rows: readonly ReagentLedgerRow[]
  definitions: readonly ReagentDefinition[]
  activeCount: number
  availableRows: number
  unknownCount: number
  onDialog: (dialog: ReagentViewDialog) => void
}): React.JSX.Element {
  return (
    <>
      <div className={styles.reagentStats}>
        <ReagentStat icon="flask" label="有效台账" value={activeCount} tone="info" />
        <ReagentStat icon="shield" label="有可用量" value={availableRows} tone="success" />
        <ReagentStat icon="point" label="状态不明" value={unknownCount} tone="warning" />
      </div>
      <div className={`${uiClass.panel} ${uiClass.tableScroll} ${styles.reagentLedgerPanel}`}>
        <table className={`${styles.dataTable} ${styles.reagentLedgerTable}`} aria-label="试剂台账">
          <thead>
            <tr>
              <th>试剂名称</th>
              <th>密度 / 条件</th>
              <th>供应商</th>
              <th>有效期</th>
              <th>数量</th>
              <th>库位名称</th>
              <th>当前任务</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const archived = row.displayStatus === '已归档'
              const name = definitionName(row, definitions)
              return (
                <tr key={row.id} data-archived={archived}>
                  <td data-label="试剂名称">
                    <strong>{name}</strong>
                  </td>
                  <td data-label="密度 / 条件">
                    {row.densityValue} {row.densityUnit}
                    <small>{row.densityCondition}</small>
                  </td>
                  <td data-label="供应商">{row.supplier}</td>
                  <td data-label="有效期" className={uiClass.mono}>
                    {row.expiresOn}
                  </td>
                  <td data-label="数量">
                    <strong>
                      {formatQuantity(row.remainingQuantity)} {row.unit}
                    </strong>
                    <small>
                      可用 {formatQuantity(calculateAvailableQuantity(row))} {row.unit}
                    </small>
                  </td>
                  <td data-label="库位名称">{row.siteLabel}</td>
                  <td data-label="当前任务">{row.workflowLabel ?? '—'}</td>
                  <td data-label="状态">
                    <ReagentStatus status={row.displayStatus} />
                    {archived ? <small>{formatArchive(row)}</small> : null}
                  </td>
                  <td data-label="操作">
                    <div className={uiClass.rowActions}>
                      <RowAction
                        icon="edit"
                        label={`编辑 ${name}`}
                        disabled={archived}
                        onClick={() => onDialog({ kind: 'edit-ledger', id: row.id })}
                      />
                      <RowAction
                        icon="trash"
                        label={`删除 ${name}`}
                        disabled={archived}
                        onClick={() => onDialog({ kind: 'delete-ledger', id: row.id })}
                      />
                      <RowAction
                        icon="folder"
                        label={`归档 ${name}`}
                        disabled={archived}
                        onClick={() => onDialog({ kind: 'archive', id: row.id })}
                      />
                      <RowAction
                        icon="history"
                        label={`查看 ${name} 记录`}
                        disabled={archived}
                        onClick={() => onDialog({ kind: 'records', id: row.id })}
                      />
                    </div>
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9}>
                  <div className={uiClass.compactEmptyState}>没有符合搜索条件的台账</div>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  )
}

export function LibraryView({
  definitions,
  onDialog,
}: {
  definitions: readonly ReagentDefinition[]
  onDialog: (dialog: ReagentViewDialog) => void
}): React.JSX.Element {
  return (
    <section className={uiClass.panel}>
      <div className={uiClass.panelHeader}>
        <div>
          <h2>试剂基础信息</h2>
          <small>内部编码不在列表显示</small>
        </div>
        <button className={buttonClass('secondary', 'compact')} type="button" onClick={() => onDialog({ kind: 'definition' })}>
          <WorkstationIcon name="plus" />
          新增
        </button>
      </div>
      <div className={uiClass.tableScroll}>
        <table className={styles.dataTable} aria-label="试剂基础信息库">
          <thead>
            <tr>
              <th>试剂名称</th>
              <th>CAS 号</th>
              <th>分子式</th>
              <th>结构式</th>
              <th>分子量</th>
              <th>常温形态</th>
              <th>自定义参数</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {definitions.map((definition) => (
              <tr key={definition.id}>
                <td>
                  <strong>{definition.name}</strong>
                </td>
                <td className={uiClass.mono}>{definition.cas}</td>
                <td>{definition.formula}</td>
                <td className={uiClass.mono}>{definition.structure}</td>
                <td>{definition.molecularWeight || '—'}</td>
                <td>{definition.form}</td>
                <td>{formatCustom(definition.custom)}</td>
                <td>
                  <div className={uiClass.rowActions}>
                    <RowAction
                      icon="edit"
                      label={`编辑 ${definition.name}`}
                      onClick={() => onDialog({ kind: 'definition', id: definition.id })}
                    />
                    <RowAction
                      icon="trash"
                      label={`删除 ${definition.name}`}
                      onClick={() =>
                        onDialog({
                          kind: 'delete-definition',
                          id: definition.id,
                        })
                      }
                    />
                  </div>
                </td>
              </tr>
            ))}
            {definitions.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <div className={uiClass.compactEmptyState}>没有符合搜索条件的试剂定义</div>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function ReagentStat({
  icon,
  label,
  value,
  tone,
}: {
  icon: 'flask' | 'shield' | 'point'
  label: string
  value: number | string
  tone: 'info' | 'success' | 'warning'
}): React.JSX.Element {
  return (
    <div data-tone={tone}>
      <span>
        <WorkstationIcon name={icon} />
      </span>
      <span>
        <small>{label}</small>
        <strong>{value}</strong>
      </span>
    </div>
  )
}

function ReagentStatus({ status }: { status: ReagentLedgerRow['displayStatus'] }): React.JSX.Element {
  const tone = status === '已归档' ? 'archived' : status === '可用' ? 'success' : status === '状态不明' ? 'warning' : 'info'
  return (
    <span className={`${pillBaseClass} ${styles.reagentStatus}`} data-tone={tone}>
      <span aria-hidden="true" />
      {status}
    </span>
  )
}

function RowAction({
  icon,
  label,
  disabled = false,
  onClick,
}: {
  icon: WorkstationIconName
  label: string
  disabled?: boolean
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      className={buttonClass('secondary', 'icon')}
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      title={disabled ? `${label}（已归档，操作不可用）` : label}
    >
      <WorkstationIcon name={icon} />
    </button>
  )
}

export function definitionName(row: ReagentLedgerRow, definitions: readonly ReagentDefinition[]): string {
  return definitions.find((definition) => definition.id === row.reagentId)?.name ?? '未知试剂'
}

function formatCustom(custom: ReagentDefinition['custom']): string {
  return custom.length ? custom.map((parameter) => `${parameter.name}: ${parameter.value}${parameter.unit}`).join('；') : '—'
}

function formatQuantity(value: number): string {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 3 }).format(value)
}

function formatArchive(row: ReagentLedgerRow): string {
  const date = row.archivedAt
    ? new Intl.DateTimeFormat('zh-CN', {
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(new Date(row.archivedAt))
    : '时间未知'
  return `${date} · ${row.archiveReason ?? '无原因'}`
}
