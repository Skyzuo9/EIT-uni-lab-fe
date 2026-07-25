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
    <div className="connbar">
      <button
        type="button"
        className={`connbar__mode connbar__mode--${backendEnabled ? 'online' : 'offline'}`}
        onClick={() => setBackendEnabled(!backendEnabled)}
      >
        {backendEnabled ? '在线' : '离线'}
      </button>

      <select
        className="connbar__input"
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
        <div className="connbar__endpoint">
          <input
            className="connbar__input"
            value={draftUrl}
            spellCheck={false}
            placeholder="后端 API 地址"
            onChange={(event) => setDraftUrl(event.target.value)}
            onBlur={handleApplyUrl}
            onKeyDown={(event) => {
              if (event.key === 'Enter') handleApplyUrl()
            }}
          />
          <span className="connbar__status">
            <span
              className="connbar__dot"
              style={{ backgroundColor: meta.color }}
            />
            {meta.label}
          </span>
          <button
            type="button"
            className="connbar__reconnect"
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
