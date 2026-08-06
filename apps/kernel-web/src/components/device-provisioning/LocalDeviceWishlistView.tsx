import { useCallback, useEffect, useMemo, useState } from 'react'
import type { LocalDeviceProvisioning } from '@unilab/device-provisioning'

import DeviceConfigurationForm from './DeviceConfigurationForm'
import {
  provisioningStatusView,
  type DeviceProvisioningApi,
  uiErrorMessage
} from './deviceProvisioningUi'
import styles from './DeviceSquarePanel.module.scss'

interface LocalDeviceWishlistViewProps {
  api: DeviceProvisioningApi
  items: LocalDeviceProvisioning[]
  selectedProvisioningId: string | null
  onSelectedProvisioningId: (value: string | null) => void
  onRefresh: () => Promise<void>
}

type ConfirmAction = 'activate' | 'remove' | 'restore'

/** 本地心愿单的配置、设备图变更、受控激活、移除与恢复工作区。 */
export default function LocalDeviceWishlistView({
  api,
  items,
  selectedProvisioningId,
  onSelectedProvisioningId,
  onRefresh
}: LocalDeviceWishlistViewProps): React.JSX.Element {
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const selected = useMemo(
    () => items.find((item) => item.provisioningId === selectedProvisioningId)
      ?? items[0]
      ?? null,
    [items, selectedProvisioningId]
  )

  useEffect(() => {
    if (!selected && selectedProvisioningId) onSelectedProvisioningId(null)
  }, [onSelectedProvisioningId, selected, selectedProvisioningId])

  /** 执行已明确确认的重启、移除或恢复，并以 Main 返回事实刷新界面。 */
  const runConfirmedAction = useCallback(async (): Promise<void> => {
    if (!selected || !confirmAction || working) return
    setWorking(true)
    setError(null)
    try {
      const updated = confirmAction === 'activate'
        ? await api.activate(selected.provisioningId)
        : confirmAction === 'remove'
          ? await api.remove(selected.provisioningId)
          : await api.restore(selected.provisioningId)
      if (updated.status === 'failed') {
        throw new Error(updated.diagnostic?.message || '本地设备操作失败')
      }
      setConfirmAction(null)
      await onRefresh()
    } catch (reason) {
      setError(uiErrorMessage(reason))
      await onRefresh()
    } finally {
      setWorking(false)
    }
  }, [api, confirmAction, onRefresh, selected, working])

  /** 按持久诊断记录的失败阶段重试，不创建第二个实例身份。 */
  const handleRetry = useCallback(async (): Promise<void> => {
    if (!selected || working) return
    setWorking(true)
    setError(null)
    try {
      const updated = await api.retry(selected.provisioningId)
      if (updated.status === 'failed') {
        throw new Error(updated.diagnostic?.message || '重试后仍未完成')
      }
      await onRefresh()
    } catch (reason) {
      setError(uiErrorMessage(reason))
      await onRefresh()
    } finally {
      setWorking(false)
    }
  }, [api, onRefresh, selected, working])

  if (!selected) {
    return (
      <div className={styles.emptyWorkspace}>
        <strong>心愿单还是空的</strong>
        <span>从“云端设备广场”添加设备后，驱动包、配置和接入进度会出现在这里。</span>
      </div>
    )
  }

  return (
    <div className={styles.splitView}>
      <div className={styles.wishlistList} aria-label="本地设备接入记录">
        {items.map((item) => {
          const status = provisioningStatusView(item.status)
          return (
            <button
              key={item.provisioningId}
              type="button"
              className={styles.wishlistRow}
              data-selected={item.provisioningId === selected.provisioningId}
              onClick={() => onSelectedProvisioningId(item.provisioningId)}
            >
              <span className={styles.statusDot} data-tone={status.tone} />
              <span>
                <strong>{item.displayName || item.cloudDisplayName || '未命名设备'}</strong>
                <small>{item.instanceId || item.packageName || '等待解析'}</small>
              </span>
              <em data-tone={status.tone}>{status.label}</em>
            </button>
          )
        })}
      </div>

      <article className={styles.provisioningDetail}>
        <ProvisioningHeader record={selected} />
        {selected.diagnostic ? (
          <div className={styles.errorBanner} role="alert">
            <strong>{selected.diagnostic.message}</strong>
            <span>失败阶段：{provisioningStatusView(selected.diagnostic.stage).label}</span>
          </div>
        ) : null}
        {error ? <div className={styles.errorBanner} role="alert">{error}</div> : null}

        {canConfigure(selected) ? (
          <DeviceConfigurationForm
            api={api}
            record={selected}
            disabled={working}
            onWorking={setWorking}
            onCompleted={() => void onRefresh()}
          />
        ) : (
          <ProvisioningFacts record={selected} />
        )}

        {confirmAction ? (
          <Confirmation action={confirmAction} record={selected}>
            <button type="button" className={styles.secondaryButton} disabled={working} onClick={() => setConfirmAction(null)}>
              取消
            </button>
            <button type="button" className={confirmAction === 'remove' ? styles.dangerButton : styles.primaryButton} disabled={working} onClick={() => void runConfirmedAction()}>
              {working ? '正在执行…' : confirmationButton(confirmAction)}
            </button>
          </Confirmation>
        ) : (
          <RecordActions
            record={selected}
            working={working}
            onConfirm={setConfirmAction}
            onRetry={() => void handleRetry()}
          />
        )}
      </article>
    </div>
  )
}

/** 展示云端身份、包身份与当前接入状态，不把缓存误报为可运行。 */
function ProvisioningHeader({ record }: { record: LocalDeviceProvisioning }): React.JSX.Element {
  const status = provisioningStatusView(record.status)
  return (
    <header className={styles.provisioningHeader}>
      <div>
        <h2>{record.displayName || record.cloudDisplayName || '本地设备接入'}</h2>
        <p>{record.packageName ? `${record.packageName} ${record.packageVersion}` : record.templateUuid}</p>
      </div>
      <span className={styles.statusBadge} data-tone={status.tone}>
        <i /> {status.label}
      </span>
      <p className={styles.statusDescription}>{status.description}</p>
    </header>
  )
}

/** 展示 Main 已持久化的设备图和运行对账事实。 */
function ProvisioningFacts({ record }: { record: LocalDeviceProvisioning }): React.JSX.Element {
  const facts = [
    ['本地实例', record.instanceId || '尚未配置'],
    ['设备定义', record.definitionFqid || '正在解析'],
    ['设备图', record.graphPath || '等待当前 Runtime'],
    ['Action', record.status === 'ready' ? `${record.actionCount} 个可用` : '尚未确认'],
    ['包缓存', record.cacheKey || '尚未下载'],
    ['图摘要', record.graphFingerprint || '尚未写图']
  ]
  return (
    <dl className={styles.provisioningFacts}>
      {facts.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd title={value}>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** 根据状态只提供安全且有意义的下一步。 */
function RecordActions({
  record,
  working,
  onConfirm,
  onRetry
}: {
  record: LocalDeviceProvisioning
  working: boolean
  onConfirm: (action: ConfirmAction) => void
  onRetry: () => void
}): React.JSX.Element {
  const canActivate = record.status === 'restart_required' || record.status === 'graph_staged'
  const canRemove = Boolean(record.instanceId && record.graphFingerprint)
    && record.status !== 'removed'
    && record.status !== 'canceled'
  return (
    <div className={styles.recordActions}>
      {record.status === 'failed' ? (
        <button type="button" className={styles.secondaryButton} disabled={working} onClick={onRetry}>
          按失败阶段重试
        </button>
      ) : null}
      {record.backupPath ? (
        <button type="button" className={styles.secondaryButton} disabled={working} onClick={() => onConfirm('restore')}>
          恢复设备图备份
        </button>
      ) : null}
      {canRemove ? (
        <button type="button" className={styles.dangerButton} disabled={working} onClick={() => onConfirm('remove')}>
          从本地移除
        </button>
      ) : null}
      {canActivate ? (
        <button type="button" className={styles.primaryButton} disabled={working} onClick={() => onConfirm('activate')}>
          重启并确认设备可运行
        </button>
      ) : null}
    </div>
  )
}

/** 在执行会重启或改变设备图的动作前给出具体影响。 */
function Confirmation({
  action,
  record,
  children
}: {
  action: ConfirmAction
  record: LocalDeviceProvisioning
  children: React.ReactNode
}): React.JSX.Element {
  const copy = action === 'activate'
    ? ['确认重启当前 Edge？', 'Main 会先检查所有运行中 Action；存在忙碌动作时会拒绝重启。']
    : action === 'remove'
      ? ['确认移除本地设备实例？', `将从 ${record.graphPath} 原子移除 ${record.instanceId}，并保留可恢复备份。`]
      : ['确认恢复设备图备份？', `将用 ${record.backupPath} 替换当前设备图；运行中的 Edge 会先受控停止。`]
  return (
    <div className={styles.confirmation} role="alert">
      <div><strong>{copy[0]}</strong><span>{copy[1]}</span></div>
      <div>{children}</div>
    </div>
  )
}

/** 失败在配置阶段时允许用户修正输入；其他阶段显示权威事实。 */
function canConfigure(record: LocalDeviceProvisioning): boolean {
  return record.status === 'configuration_required'
    || (record.status === 'failed' && record.diagnostic?.stage === 'configuration_required')
}

/** 返回确认按钮的明确动作名称。 */
function confirmationButton(action: ConfirmAction): string {
  if (action === 'activate') return '确认重启并对账'
  if (action === 'remove') return '确认移除设备'
  return '确认恢复备份'
}
