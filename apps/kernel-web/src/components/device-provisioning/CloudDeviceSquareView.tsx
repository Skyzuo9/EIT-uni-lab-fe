import { useCallback, useEffect, useState } from 'react'
import type {
  DeviceSquareDetail,
  DeviceSquareItem
} from '@unilab/services'
import type { LocalDeviceProvisioning } from '@unilab/device-provisioning'

import type { DeviceProvisioningApi } from './deviceProvisioningUi'
import { uiErrorMessage } from './deviceProvisioningUi'
import styles from './DeviceSquarePanel.module.scss'

interface CloudDeviceSquareViewProps {
  api: DeviceProvisioningApi
  onProvisioningStarted: (record: LocalDeviceProvisioning) => void
}

/** 云端设备广场的检索、列表、详情和两种下载意图。 */
export default function CloudDeviceSquareView({
  api,
  onProvisioningStarted
}: CloudDeviceSquareViewProps): React.JSX.Element {
  const [keyword, setKeyword] = useState('')
  const [committedKeyword, setCommittedKeyword] = useState('')
  const [devices, setDevices] = useState<DeviceSquareItem[]>([])
  const [total, setTotal] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<DeviceSquareDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [operation, setOperation] = useState<'wishlist' | 'download' | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  /** 从现有 Backend 广场接口读取第一页并选择第一项。 */
  const loadDevices = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const page = await api.listCloudDevices({
        page: 1,
        pageSize: 40,
        keyword: committedKeyword || undefined
      })
      setDevices(page.items)
      setTotal(page.total)
      setSelectedId((current) => (
        current && page.items.some((item) => item.templateUuid === current)
          ? current
          : page.items[0]?.templateUuid ?? null
      ))
    } catch (reason) {
      setDevices([])
      setTotal(0)
      setSelectedId(null)
      setError(uiErrorMessage(reason))
    } finally {
      setLoading(false)
    }
  }, [api, committedKeyword])

  useEffect(() => {
    void loadDevices()
  }, [loadDevices])

  useEffect(() => {
    if (!selectedId) {
      setDetail(null)
      return
    }
    let active = true
    setDetailLoading(true)
    setError(null)
    void api.getCloudDevice(selectedId)
      .then((value) => {
        if (active) setDetail(value)
      })
      .catch((reason: unknown) => {
        if (active) setError(uiErrorMessage(reason))
      })
      .finally(() => {
        if (active) setDetailLoading(false)
      })
    return () => {
      active = false
    }
  }, [api, selectedId])

  /** 提交关键词，触发一次明确搜索，不在每个按键上请求云端。 */
  const handleSearch = useCallback((event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setCommittedKeyword(keyword.trim())
  }, [keyword])

  /** 下载、校验并创建持久心愿单，后续由配置与激活阶段继续。 */
  const handleAddWishlist = useCallback(async (): Promise<void> => {
    if (!detail || operation) return
    setOperation('wishlist')
    setError(null)
    setNotice('正在解析发布信息并下载校验设备包…')
    try {
      const record = await api.start(detail.templateUuid)
      if (record.status === 'failed') {
        throw new Error(record.diagnostic?.message || '添加心愿单失败')
      }
      onProvisioningStarted(record)
    } catch (reason) {
      setError(uiErrorMessage(reason))
      setNotice(null)
    } finally {
      setOperation(null)
    }
  }, [api, detail, onProvisioningStarted, operation])

  /** 只把设备包写入 OS 受管缓存，不创建实例也不修改设备图。 */
  const handleDownloadOnly = useCallback(async (): Promise<void> => {
    if (!detail || operation) return
    setOperation('download')
    setError(null)
    setNotice('正在下载并校验设备包，不会修改当前设备图…')
    try {
      const result = await api.downloadOnly(detail.templateUuid)
      setNotice(
        `${result.distribution} ${result.version} 已${result.cacheHit ? '命中' : '写入'}受管缓存`
      )
    } catch (reason) {
      setError(uiErrorMessage(reason))
      setNotice(null)
    } finally {
      setOperation(null)
    }
  }, [api, detail, operation])

  return (
    <div className={styles.squareView}>
      <div className={styles.toolbar}>
        <form className={styles.searchForm} onSubmit={handleSearch}>
          <label htmlFor="device-square-search">搜索云端设备</label>
          <div>
            <input
              id="device-square-search"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="设备名称、型号或标签"
            />
            <button type="submit">搜索</button>
          </div>
        </form>
        <div className={styles.toolbarMeta}>
          <span>共 {total} 个设备定义</span>
          <button type="button" onClick={() => void loadDevices()} disabled={loading}>
            {loading ? '读取中…' : '刷新'}
          </button>
        </div>
      </div>

      {error ? <div className={styles.errorBanner} role="alert">{error}</div> : null}
      {notice ? <div className={styles.infoBanner} role="status">{notice}</div> : null}

      <div className={styles.splitView}>
        <div className={styles.deviceList} aria-label="设备定义列表">
          {loading ? <ListSkeleton /> : null}
          {!loading && devices.length === 0 ? (
            <EmptyMessage title="没有匹配的设备" body="换一个关键词，或刷新设备广场后再试。" />
          ) : null}
          {devices.map((device) => (
            <button
              key={device.templateUuid}
              type="button"
              className={styles.deviceRow}
              data-selected={selectedId === device.templateUuid}
              onClick={() => setSelectedId(device.templateUuid)}
            >
              <DeviceGlyph name={device.displayName} image={device.icon || device.cover} />
              <span className={styles.deviceRowText}>
                <strong>{device.displayName}</strong>
                <small>{device.manufacturer?.name || device.name}</small>
                <span>{device.description || '云端设备定义'}</span>
              </span>
            </button>
          ))}
        </div>

        <article className={styles.deviceDetail} aria-live="polite">
          {detailLoading ? <DetailSkeleton /> : null}
          {!detailLoading && detail ? (
            <>
              <div className={styles.detailTitle}>
                <DeviceGlyph name={detail.displayName} image={detail.cover || detail.icon} large />
                <div>
                  <h2>{detail.displayName}</h2>
                  <p>{detail.manufacturer?.name || detail.name}</p>
                </div>
              </div>
              <p className={styles.description}>
                {detail.description || '该设备定义尚未提供描述。'}
              </p>
              <DetailFacts detail={detail} />
              {detail.tags.length > 0 ? (
                <div className={styles.tags} aria-label="设备标签">
                  {detail.tags.map((tag) => <span key={tag}>{tag}</span>)}
                </div>
              ) : null}
              <div className={styles.actionBar}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={operation !== null}
                  onClick={() => void handleDownloadOnly()}
                >
                  {operation === 'download' ? '正在下载…' : '仅下载设备包'}
                </button>
                <button
                  type="button"
                  className={styles.primaryButton}
                  disabled={operation !== null}
                  onClick={() => void handleAddWishlist()}
                >
                  {operation === 'wishlist' ? '正在添加…' : '添加心愿单并接入本地'}
                </button>
              </div>
              <p className={styles.safetyNote}>
                添加心愿单会先停在配置阶段；只有确认配置后才写入当前设备图，激活前会检查运行中 Action。
              </p>
            </>
          ) : null}
          {!detailLoading && !detail ? (
            <EmptyMessage title="选择一个设备" body="查看设备包身份并决定仅下载或接入本地。" />
          ) : null}
        </article>
      </div>
    </div>
  )
}

/** 展示详情中可公开核验的现有包身份。 */
function DetailFacts({ detail }: { detail: DeviceSquareDetail }): React.JSX.Element {
  const packageInfo = detail.packageInfo
  const facts = [
    ['设备标识', detail.name],
    ['包名称', text(packageInfo.name) || '未发布当前设备包'],
    ['版本', text(packageInfo.version) || '—'],
    ['资源类型', detail.resourceType || 'device']
  ]
  return (
    <dl className={styles.factGrid}>
      {facts.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** 显示远端图片；缺少图片时使用稳定首字符占位。 */
function DeviceGlyph({
  name,
  image,
  large = false
}: {
  name: string
  image: string
  large?: boolean
}): React.JSX.Element {
  return (
    <span className={styles.deviceGlyph} data-large={large} aria-hidden="true">
      {image ? <img src={image} alt="" /> : (name.trim()[0] || '仪')}
    </span>
  )
}

/** 列表加载期间保持左右面板几何位置稳定。 */
function ListSkeleton(): React.JSX.Element {
  return <div className={styles.skeletonList} aria-label="正在读取设备广场"><i /><i /><i /></div>
}

/** 详情加载期间保持操作区不跳动。 */
function DetailSkeleton(): React.JSX.Element {
  return <div className={styles.skeletonDetail} aria-label="正在读取设备详情"><i /><i /><i /><i /></div>
}

/** 统一渲染无数据或未选择状态。 */
function EmptyMessage({ title, body }: { title: string; body: string }): React.JSX.Element {
  return <div className={styles.empty}><strong>{title}</strong><span>{body}</span></div>
}

/** 从 Backend 不稳定记录读取展示字符串。 */
function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}
