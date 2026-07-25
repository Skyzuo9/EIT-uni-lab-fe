import { useEffect, useState } from 'react'

import type { ConnectionStatus } from '../data/lab'
import { useWorkbench } from '../context/WorkbenchContext'
import { useBackendConnection } from '../hooks/useBackendConnection'

const STATUS_META: Record<ConnectionStatus, { label: string; color: string }> = {
  disconnected: { label: '未连接', color: '#9ca3af' },
  connecting: { label: '连接中', color: '#f59e0b' },
  connected: { label: '已连接', color: '#22c55e' },
  error: { label: '连接失败', color: '#ef4444' }
}

const INPUT_CLASS =
  'w-[220px] rounded border border-[#d1d5db] px-2 py-[3px] font-mono text-[11px]'

export default function ConnectionBar(): React.JSX.Element {
  const {
    backend,
    backendEnabled,
    connection,
    availableBackends,
    selectBackend,
    updateBackend,
    setBackendEnabled
  } = useWorkbench()
  const { reconnect } = useBackendConnection()
  const [draftUrl, setDraftUrl] = useState(backend.apiUrl)
  const meta = STATUS_META[connection]

  useEffect(() => {
    setDraftUrl(backend.apiUrl)
  }, [backend.id, backend.apiUrl])

  const handleApplyUrl = (): void => {
    const trimmed = draftUrl.trim()
    if (trimmed !== backend.apiUrl) updateBackend({ apiUrl: trimmed })
  }

  return (
    <div className="ml-auto flex items-center gap-3">
      <button
        type="button"
        className={`cursor-pointer rounded-xl border px-3 py-[3px] text-xs transition-colors ${
          backendEnabled
            ? 'border-[#22c55e] bg-[#22c55e] text-white'
            : 'border-[#d1d5db] bg-white text-[#6b7280]'
        }`}
        onClick={() => setBackendEnabled(!backendEnabled)}
      >
        {backendEnabled ? '在线' : '离线'}
      </button>

      <select
        className={INPUT_CLASS}
        aria-label="后端配置"
        value={backend.id}
        onChange={(event) => selectBackend(event.target.value)}
      >
        {availableBackends.map((candidate) => (
          <option key={candidate.id} value={candidate.id}>
            {candidate.name}
          </option>
        ))}
      </select>

      {backendEnabled && (
        <div className="flex items-center gap-2.5">
          <input
            className={INPUT_CLASS}
            value={draftUrl}
            spellCheck={false}
            placeholder="后端 API 地址"
            onChange={(event) => setDraftUrl(event.target.value)}
            onBlur={handleApplyUrl}
            onKeyDown={(event) => {
              if (event.key === 'Enter') handleApplyUrl()
            }}
          />
          <span className="flex items-center gap-1.5 text-xs text-[#6b7280]">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: meta.color }}
            />
            {meta.label}
          </span>
          <button
            type="button"
            className="cursor-pointer rounded border border-[#d1d5db] bg-white px-2.5 py-[3px] text-xs disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!backend.apiUrl}
            onClick={() => void reconnect()}
          >
            重连
          </button>
        </div>
      )}
    </div>
  )
}
