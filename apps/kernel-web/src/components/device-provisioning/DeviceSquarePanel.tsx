import { useCallback, useEffect, useState } from 'react'
import {
  CLOUD_ENVIRONMENT_OPTIONS,
  type CloudEnvironment,
  type LocalDeviceProvisioning
} from '@unilab/device-provisioning'

import CloudDeviceSquareView from './CloudDeviceSquareView'
import DevicePackageUploadView from './DevicePackageUploadView'
import LocalDeviceWishlistView from './LocalDeviceWishlistView'
import type { DeviceProvisioningApi } from './deviceProvisioningUi'
import styles from './DeviceSquarePanel.module.scss'

type DeviceProvisioningTab = 'square' | 'wishlist' | 'upload'

const TABS: ReadonlyArray<{
  id: DeviceProvisioningTab
  label: string
}> = [
  { id: 'square', label: '云端设备广场' },
  { id: 'wishlist', label: '本地心愿单' },
  { id: 'upload', label: '上传设备包' }
]

/**
 * 把云端发现、本地设备接入和 CLI 发布组织成一个 Electron 操作台。
 *
 * @returns 仅在 Electron 安全预加载桥存在时可操作的设备包工作区。
 */
export default function DeviceSquarePanel(): React.JSX.Element {
  const api = window.api?.deviceProvisioning
  const [tab, setTab] = useState<DeviceProvisioningTab>('square')
  const [items, setItems] = useState<LocalDeviceProvisioning[]>([])
  const [cloudEnvironment, setCloudEnvironment] = useState<CloudEnvironment>('test')
  const [selectedProvisioningId, setSelectedProvisioningId] = useState<string | null>(null)
  const [recordsError, setRecordsError] = useState<string | null>(null)

  /** 重新读取 Main 持久事实，并保持最近接入项可见。 */
  const refreshRecords = useCallback(async (): Promise<void> => {
    if (!api) return
    try {
      const records = await api.list()
      setItems(records)
      setRecordsError(null)
      setSelectedProvisioningId((current) => (
        current && records.some((item) => item.provisioningId === current)
          ? current
          : records[0]?.provisioningId ?? null
      ))
    } catch (error) {
      setRecordsError(error instanceof Error ? error.message : String(error))
    }
  }, [api])

  useEffect(() => {
    if (!api) return
    void refreshRecords()
    return api.onChanged((records) => {
      setItems(records)
    })
  }, [api, refreshRecords])

  /** 新接入下载完成后切换到表单阶段，并锁定刚创建的持久记录。 */
  const handleProvisioningStarted = useCallback((record: LocalDeviceProvisioning) => {
    setSelectedProvisioningId(record.provisioningId)
    setTab('wishlist')
    void refreshRecords()
  }, [refreshRecords])

  /**
   * 切换固定云端环境；子视图据此丢弃旧请求并读取新环境。
   *
   * @param event 只可能来自三项固定 option 的 select 变更事件。
   * @returns 无返回值；环境状态提交后由子视图重新读取。
   */
  const handleCloudEnvironmentChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>): void => {
      setCloudEnvironment(event.target.value as CloudEnvironment)
    },
    []
  )

  if (!api) return <DesktopOnlyNotice />

  return (
    <section className={styles.workspace} aria-label="设备包与本地设备接入">
      <header className={styles.header}>
        <div>
          <h1>设备广场与本地接入</h1>
          <p>
            从云端选择设备定义，下载可信驱动包，写入当前设备图并由本地 OS 验证 Action。
          </p>
        </div>
        <div className={styles.headerControls}>
          <label className={styles.environmentSelect}>
            <span>云端环境</span>
            <select
              aria-label="云端环境"
              value={cloudEnvironment}
              onChange={handleCloudEnvironmentChange}
            >
              {CLOUD_ENVIRONMENT_OPTIONS.map((environment) => (
                <option key={environment.id} value={environment.id}>
                  {environment.label} · {environment.host}
                </option>
              ))}
            </select>
          </label>
          <div className={styles.flowSummary} aria-label="接入顺序">
            <span>云端定义</span>
            <b aria-hidden="true">→</b>
            <span>本地设备图</span>
            <b aria-hidden="true">→</b>
            <span>驱动可运行</span>
          </div>
        </div>
      </header>

      <nav className={styles.tabs} aria-label="设备包操作">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={styles.tab}
            data-active={tab === item.id}
            aria-current={tab === item.id ? 'page' : undefined}
            onClick={() => setTab(item.id)}
          >
            {item.label}
            {item.id === 'wishlist' && items.length > 0 ? (
              <span className={styles.count}>{items.length}</span>
            ) : null}
          </button>
        ))}
      </nav>

      <div className={styles.content}>
        {recordsError ? (
          <div className={styles.errorBanner} role="alert">{recordsError}</div>
        ) : null}
        {tab === 'square' ? (
          <CloudDeviceSquareView
            key={cloudEnvironment}
            api={api}
            cloudEnvironment={cloudEnvironment}
            onProvisioningStarted={handleProvisioningStarted}
          />
        ) : null}
        {tab === 'wishlist' ? (
          <LocalDeviceWishlistView
            api={api}
            items={items}
            selectedProvisioningId={selectedProvisioningId}
            onSelectedProvisioningId={setSelectedProvisioningId}
            onRefresh={refreshRecords}
          />
        ) : null}
        {tab === 'upload' ? (
          <DevicePackageUploadView
            api={api}
            cloudEnvironment={cloudEnvironment}
          />
        ) : null}
      </div>
    </section>
  )
}

/** 在普通浏览器构建中诚实说明该能力的 Electron Main 依赖。 */
function DesktopOnlyNotice(): React.JSX.Element {
  return (
    <section className={styles.desktopOnly}>
      <div aria-hidden="true" className={styles.desktopOnlyMark}>⌁</div>
      <h1>设备包操作仅在 Electron 调试台可用</h1>
      <p>
        该流程需要 Main 进程调用当前 Uni-Lab-OS CLI、修改本地设备图并受控重启 Edge。
      </p>
    </section>
  )
}
