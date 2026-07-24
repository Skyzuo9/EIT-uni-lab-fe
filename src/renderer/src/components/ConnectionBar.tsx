/**
 * ============================================================
 * AI-GENERATED CODE METADATA
 * ============================================================
 * Model: Claude Opus 4.8
 * Generation Date: 2026-07-22
 * Prompt Summary: 顶栏连接控制条(离线/在线切换 + 地址配置 + 状态灯)
 * Context: 调试客户端统一外壳顶部,控制后端连接
 * Human Review Status: [ ] Pending  [ ] Reviewed  [ ] Approved
 * ============================================================
 */
import { useState } from 'react'
import { useAppMode } from '../context/AppModeContext'
import { useBackendConnection } from '../hooks/useBackendConnection'
import type { ConnectionStatus } from '../data/lab'

// 连接状态对应的文案与颜色
const STATUS_META: Record<ConnectionStatus, { label: string; color: string }> = {
  disconnected: { label: '未连接', color: '#9ca3af' },
  connecting: { label: '连接中', color: '#f59e0b' },
  connected: { label: '已连接', color: '#22c55e' },
  error: { label: '连接失败', color: '#ef4444' }
}

// 顶栏:模式切换 + 后端地址 + 连接状态灯 + 重连
export default function ConnectionBar(): JSX.Element {
  const { mode, baseUrl, connection, setMode, setBaseUrl } = useAppMode()
  const { reconnect } = useBackendConnection()
  const [draftUrl, setDraftUrl] = useState(baseUrl)

  const isOnline = mode === 'online'
  const meta = STATUS_META[connection]

  const handleToggleMode = (): void => {
    setMode(isOnline ? 'offline' : 'online')
  }

  const handleApplyUrl = (): void => {
    const trimmed = draftUrl.trim()
    if (trimmed && trimmed !== baseUrl) setBaseUrl(trimmed)
  }

  return (
    <div className="connbar">
      <button
        type="button"
        className={`connbar__mode connbar__mode--${mode}`}
        onClick={handleToggleMode}
      >
        {isOnline ? '在线' : '离线'}
      </button>

      {isOnline && (
        <div className="connbar__endpoint">
          <input
            className="connbar__input"
            value={draftUrl}
            spellCheck={false}
            onChange={(event) => setDraftUrl(event.target.value)}
            onBlur={handleApplyUrl}
            onKeyDown={(event) => {
              if (event.key === 'Enter') handleApplyUrl()
            }}
          />
          <span className="connbar__status">
            <span className="connbar__dot" style={{ backgroundColor: meta.color }} />
            {meta.label}
          </span>
          <button type="button" className="connbar__reconnect" onClick={() => void reconnect()}>
            重连
          </button>
        </div>
      )}
    </div>
  )
}
