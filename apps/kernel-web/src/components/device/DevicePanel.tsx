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
    <div className="flex h-full w-full">
      <div className="flex basis-[280px] flex-col overflow-y-auto border-r border-[#e5e7eb]">
        <div className="flex items-center justify-between border-b border-[#e5e7eb] bg-[#f9fafb] px-3.5 py-2.5">
          <span className="text-[13px] font-semibold">设备</span>
          <span className={`ml-auto mr-2 inline-flex items-center gap-[5px] text-[11px] ${
            connected ? 'text-[#16a34a]' : 'text-[#9ca3af]'
          }`}>
            <span
              className={`h-[7px] w-[7px] rounded-full ${
                connected
                  ? 'bg-[#22c55e] shadow-[0_0_0_3px_rgba(34,197,94,0.18)]'
                  : 'bg-[#ced4da]'
              }`}
            />
            {connected ? '实时' : '未订阅'}
          </span>
          <button
            type="button"
            className="cursor-pointer rounded border border-[#d1d5db] bg-white px-2.5 py-0.5 text-xs"
            onClick={() => void refresh()}
          >
            刷新
          </button>
        </div>

        {loading && <Hint>加载设备中…</Hint>}
        {error && <Hint error>{error}</Hint>}
        {!loading && !error && devices.length === 0 && (
          <Hint>暂无设备。切换到在线模式并连接后端可查看真实设备。</Hint>
        )}

        <ul className="m-0 list-none p-1.5">
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
                  className={`flex w-full cursor-pointer flex-col gap-0.5 rounded-md border px-2.5 py-2 text-left transition-colors hover:bg-[#f3f4f6] ${
                    device.uuid === selectedUuid
                      ? 'border-[#74c0fc] bg-[#e7f5ff]'
                      : 'border-transparent bg-transparent'
                  }`}
                  onClick={() => setSelectedUuid(device.uuid)}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        online
                          ? 'bg-[#22c55e] shadow-[0_0_0_3px_rgba(34,197,94,0.18)]'
                          : 'bg-[#ced4da]'
                      }`}
                      title={online ? '有实时状态推送' : '无实时状态'}
                    />
                    <span className="text-[13px] text-[#1f2329]">{device.machineName}</span>
                  </span>
                  <span className="font-mono text-[11px] text-[#868e96]">{device.deviceKey}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      <div className="min-w-0 flex-1 overflow-y-auto px-5 py-4">
        {selected ? <DeviceDetail device={selected} status={selectedStatus} /> : (
          <Hint>从左侧选择一个设备查看详情与可用动作</Hint>
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
function DeviceDetail({ device, status }: DeviceDetailProps): React.JSX.Element {
  return (
    <div>
      <h3 className="mb-3 mt-0 text-base">{device.machineName}</h3>
      <dl className="m-0">
        <DetailRow label="设备类">{device.deviceKey}</DetailRow>
        <DetailRow label="UUID">{device.uuid}</DetailRow>
        <DetailRow label="命名空间">{device.namespace}</DetailRow>
        <DetailRow label="节点">{device.nodeName}</DetailRow>
      </dl>

      <div className="mt-5 border-t border-[#e5e7eb] pt-4">
        <h4 className="mb-2 mt-0 text-[13px] text-[#495057]">实时状态</h4>
        <DeviceLiveStatus status={status} />
      </div>

      <div className="mt-5 border-t border-[#e5e7eb] pt-4">
        <h4 className="mb-2 mt-0 text-[13px] text-[#495057]">可用动作</h4>
        <Hint>
          在线连接后,此处将按设备 JSON Schema 渲染动作参数表单并支持下发。
        </Hint>
      </div>
    </div>
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
    return <Hint>已连接,但该设备当前无状态字段。</Hint>
  }

  return (
    <dl className="m-0">
      {entries.map(([field, value]) => (
        <DetailRow key={field} label={field}>{formatStatusValue(value)}</DetailRow>
      ))}
    </dl>
  )
}

function Hint({
  children,
  error = false
}: {
  children: ReactNode
  error?: boolean
}): React.JSX.Element {
  return (
    <p className={`px-3.5 py-3 text-xs ${error ? 'text-[#ef4444]' : 'text-[#9ca3af]'}`}>
      {children}
    </p>
  )
}

function DetailRow({
  label,
  children
}: {
  label: string
  children: ReactNode
}): React.JSX.Element {
  return (
    <div className="flex gap-2 py-[3px] text-xs">
      <dt className="basis-[52px] text-[#6b7280]">{label}</dt>
      <dd className="m-0 break-all font-mono text-[11px] text-[#24292f]">{children}</dd>
    </div>
  )
}

// 将状态值格式化为可读字符串(对象转 JSON,其余转字符串)
function formatStatusValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
