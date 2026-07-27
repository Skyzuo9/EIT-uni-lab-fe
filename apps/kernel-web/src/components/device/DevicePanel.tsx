/**
 * ============================================================
 * AI-GENERATED CODE METADATA
 * ============================================================
 * Model: Claude Opus 4.8
 * Generation Date: 2026-07-22
 * Prompt Summary: 设备方向面板(设备列表 + 选中详情 + 动作占位)
 * Context: 设备方向 MVP,离线示例/在线真实数据
 * Human Review Status: [ ] Pending  [ ] Reviewed  [ ] Approved
 * ============================================================
 */
import { useState, type ReactNode } from 'react'
import { useDevices } from '../../hooks/useDevices'
import { findDeviceStatus, useDeviceStatus } from '../../hooks/useDeviceStatus'
import type { DeviceStatus, OnlineDevice } from '../../data/lab'

// 设备方向:左列设备列表,右侧详情与动作(动作表单后续接入 JSON Schema)
export default function DevicePanel(): React.JSX.Element {
  const { devices, loading, error, refresh } = useDevices()
  const { statusMap, connected } = useDeviceStatus()
  const [selectedUuid, setSelectedUuid] = useState<string | null>(null)

  const selected = devices.find((item) => item.uuid === selectedUuid) ?? null
  const selectedStatus = selected
    ? findDeviceStatus(statusMap, [selected.uuid, selected.deviceKey, selected.nodeName])
    : null

  return (
    <section
      className={`section section--split device-page ${
        selected ? 'has-selection' : 'is-empty'
      }`}
    >
      <aside className="section__list" aria-label="仪器设备列表">
        <header className="section__list-head">
          <div>
            <h1 className="section__list-title">仪器设备</h1>
            <span className="section__list-meta">
              {devices.length ? `${devices.length} 台设备` : '等待设备接入'}
            </span>
          </div>
          <div className="section__list-actions">
            <span
              className={`device-live${connected ? ' is-live' : ''}`}
              role="status"
            >
              <span className="device-live__dot" aria-hidden="true" />
              {connected ? '实时状态' : '未订阅'}
            </span>
            <button
              type="button"
              className="section__refresh"
              onClick={() => void refresh()}
              disabled={loading}
            >
              {loading ? '刷新中…' : '刷新'}
            </button>
          </div>
        </header>

        {loading && (
          <div className="device-loading" role="status">
            正在获取设备…
          </div>
        )}
        {error && (
          <div className="device-empty device-empty--compact" role="alert">
            <strong>设备加载失败</strong>
            <p>请检查服务连接后重新加载。</p>
            <details>
              <summary>查看技术信息</summary>
              <code>{error}</code>
            </details>
            <button type="button" onClick={() => void refresh()}>
              重新加载
            </button>
          </div>
        )}
        {!loading && !error && devices.length === 0 && (
          <div className="device-empty device-empty--compact" role="status">
            <strong>暂无设备</strong>
            <p>连接在线服务后，可在这里查看设备及其实时状态。</p>
          </div>
        )}

        <ul className="device-list">
          {devices.map((device) => {
            const online = findDeviceStatus(statusMap, [
              device.uuid,
              device.deviceKey,
              device.nodeName
            ])
            return (
              <li key={device.uuid}>
                <button
                  type="button"
                  className={`device-list__item${
                    device.uuid === selectedUuid ? ' is-active' : ''
                  }`}
                  aria-pressed={device.uuid === selectedUuid}
                  onClick={() => setSelectedUuid(device.uuid)}
                >
                  <span className="device-list__row">
                    <span
                      className={`device-list__status ${
                        online ? 'is-online' : 'is-offline'
                      }`}
                      title={online ? '有实时状态推送' : '无实时状态'}
                    />
                    <span className="device-list__name">{device.machineName}</span>
                  </span>
                  <span className="device-list__key">{device.deviceKey}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </aside>

      <main className="section__detail">
        {selected ? (
          <DeviceDetail device={selected} status={selectedStatus} />
        ) : (
          <div className="device-empty device-empty--detail">
            <strong>尚未选择设备</strong>
            <p>从设备列表选择一项，即可查看基础信息、实时状态和可用动作。</p>
          </div>
        )}
      </main>
    </section>
  )
}

interface DeviceDetailProps {
  device: OnlineDevice
  status: DeviceStatus | null
}

// 设备详情:基础信息 + 实时状态 + 动作区占位(下一步接入 /actions 与 JSON Schema 表单)
function DeviceDetail({ device, status }: DeviceDetailProps): React.JSX.Element {
  return (
    <article className="device-detail">
      <header className="device-detail__header">
        <span>设备详情</span>
        <h2 className="device-detail__title">{device.machineName}</h2>
      </header>
      <dl className="device-detail__list">
        <DetailRow label="设备类">{device.deviceKey}</DetailRow>
        <DetailRow label="UUID">{device.uuid}</DetailRow>
        <DetailRow label="命名空间">{device.namespace}</DetailRow>
        <DetailRow label="节点">{device.nodeName}</DetailRow>
      </dl>

      <section className="device-detail__section">
        <h3 className="device-detail__subtitle">实时状态</h3>
        <DeviceLiveStatus status={status} />
      </section>

      <section className="device-detail__section">
        <h3 className="device-detail__subtitle">可用动作</h3>
        <Hint>
          在线连接后，此处将按设备 JSON Schema 渲染动作参数表单并支持下发。
        </Hint>
      </section>
    </article>
  )
}

interface DeviceLiveStatusProps {
  status: DeviceStatus | null
}

// 实时状态:把推送的 status 字典逐字段列出;无推送时给出提示
function DeviceLiveStatus({ status }: DeviceLiveStatusProps): React.JSX.Element {
  if (!status) {
    return <Hint>暂无实时状态推送。需在线连接并订阅 /ws/device_status。</Hint>
  }

  const entries = Object.entries(status.status)
  if (entries.length === 0) {
    return <Hint>已连接，但该设备当前无状态字段。</Hint>
  }

  return (
    <dl className="device-detail__list">
      {entries.map(([field, value]) => (
        <DetailRow key={field} label={field}>{formatStatusValue(value)}</DetailRow>
      ))}
    </dl>
  )
}

function Hint({
  children
}: {
  children: ReactNode
}): React.JSX.Element {
  return <p className="section__hint">{children}</p>
}

function DetailRow({
  label,
  children
}: {
  label: string
  children: ReactNode
}): React.JSX.Element {
  return (
    <div className="device-detail__row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

// 将状态值格式化为可读字符串(对象转 JSON,其余转字符串)
function formatStatusValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
