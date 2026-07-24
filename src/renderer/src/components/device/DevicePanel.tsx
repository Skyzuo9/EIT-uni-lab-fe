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
import { useState } from 'react'
import { useDevices } from '../../hooks/useDevices'
import { findDeviceStatus, useDeviceStatus } from '../../hooks/useDeviceStatus'
import type { DeviceStatus, OnlineDevice } from '../../data/lab'

// 设备方向:左列设备列表,右侧详情与动作(动作表单后续接入 JSON Schema)
export default function DevicePanel(): JSX.Element {
  const { devices, loading, error, refresh } = useDevices()
  const { statusMap, connected } = useDeviceStatus()
  const [selectedUuid, setSelectedUuid] = useState<string | null>(null)

  const selected = devices.find((item) => item.uuid === selectedUuid) ?? null
  const selectedStatus = selected
    ? findDeviceStatus(statusMap, [selected.uuid, selected.deviceKey, selected.nodeName])
    : null

  return (
    <div className="section section--split">
      <div className="section__list">
        <div className="section__list-head">
          <span className="section__list-title">设备</span>
          <span className={`device-live ${connected ? 'is-live' : ''}`}>
            <span className="device-live__dot" />
            {connected ? '实时' : '未订阅'}
          </span>
          <button type="button" className="section__refresh" onClick={() => void refresh()}>
            刷新
          </button>
        </div>

        {loading && <p className="section__hint">加载设备中…</p>}
        {error && <p className="section__error">{error}</p>}
        {!loading && !error && devices.length === 0 && (
          <p className="section__hint">暂无设备。切换到在线模式并连接后端可查看真实设备。</p>
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
                  className={`device-list__item ${device.uuid === selectedUuid ? 'is-active' : ''}`}
                  onClick={() => setSelectedUuid(device.uuid)}
                >
                  <span className="device-list__row">
                    <span
                      className={`device-list__status ${online ? 'is-online' : 'is-offline'}`}
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
      </div>

      <div className="section__detail">
        {selected ? <DeviceDetail device={selected} status={selectedStatus} /> : (
          <p className="section__hint">从左侧选择一个设备查看详情与可用动作</p>
        )}
      </div>
    </div>
  )
}

interface DeviceDetailProps {
  device: OnlineDevice
  status: DeviceStatus | null
}

// 设备详情:基础信息 + 实时状态 + 动作区占位(下一步接入 /actions 与 JSON Schema 表单)
function DeviceDetail({ device, status }: DeviceDetailProps): JSX.Element {
  return (
    <div className="device-detail">
      <h3 className="device-detail__title">{device.machineName}</h3>
      <dl className="detail">
        <div className="detail__row">
          <dt>设备类</dt>
          <dd className="detail__mono">{device.deviceKey}</dd>
        </div>
        <div className="detail__row">
          <dt>UUID</dt>
          <dd className="detail__mono">{device.uuid}</dd>
        </div>
        <div className="detail__row">
          <dt>命名空间</dt>
          <dd className="detail__mono">{device.namespace}</dd>
        </div>
        <div className="detail__row">
          <dt>节点</dt>
          <dd className="detail__mono">{device.nodeName}</dd>
        </div>
      </dl>

      <div className="device-detail__section">
        <h4 className="device-detail__subtitle">实时状态</h4>
        <DeviceLiveStatus status={status} />
      </div>

      <div className="device-detail__section">
        <h4 className="device-detail__subtitle">可用动作</h4>
        <p className="section__hint">
          在线连接后,此处将按设备 JSON Schema 渲染动作参数表单并支持下发。
        </p>
      </div>
    </div>
  )
}

interface DeviceLiveStatusProps {
  status: DeviceStatus | null
}

// 实时状态:把推送的 status 字典逐字段列出;无推送时给出提示
function DeviceLiveStatus({ status }: DeviceLiveStatusProps): JSX.Element {
  if (!status) {
    return <p className="section__hint">暂无实时状态推送。需在线连接并订阅 /ws/device_status。</p>
  }

  const entries = Object.entries(status.status)
  if (entries.length === 0) {
    return <p className="section__hint">已连接,但该设备当前无状态字段。</p>
  }

  return (
    <dl className="detail">
      {entries.map(([field, value]) => (
        <div key={field} className="detail__row">
          <dt>{field}</dt>
          <dd className="detail__mono">{formatStatusValue(value)}</dd>
        </div>
      ))}
    </dl>
  )
}

// 将状态值格式化为可读字符串(对象转 JSON,其余转字符串)
function formatStatusValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
