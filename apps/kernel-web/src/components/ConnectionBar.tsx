import { useEffect, useState } from 'react'

import { useWorkbench } from '../context/WorkbenchContext'
import { shouldShowConnectionRecovery } from '../context/connectionPolicy'
import { useBackendConnection } from '../hooks/useBackendConnection'

const INPUT_CLASS = 'connection-bar__field'

export default function ConnectionBar(): React.JSX.Element | null {
  const {
    backend,
    backendEnabled,
    connection,
    availableBackends,
    selectBackend,
    updateBackend
  } = useWorkbench()
  const { reconnect } = useBackendConnection()
  const [draftUrl, setDraftUrl] = useState(backend.apiUrl)

  useEffect(() => {
    setDraftUrl(backend.apiUrl)
  }, [backend.id, backend.apiUrl])

  const handleRetry = (): void => {
    const trimmed = draftUrl.trim()
    if (!trimmed) return
    if (trimmed !== backend.apiUrl) {
      updateBackend({ apiUrl: trimmed })
      return
    }
    void reconnect()
  }

  if (!shouldShowConnectionRecovery(backendEnabled, connection)) return null

  const targetName = backend.serverKind === 'edge' ? 'Edge' : backend.name

  return (
    <div
      className="connection-bar"
      role="alert"
      aria-label={`${targetName} 连接失败`}
    >
      <span className="connection-bar__status">
        <span className="connection-bar__status-dot" aria-hidden="true" />
        {targetName} 连接失败
      </span>
      <select
        className={INPUT_CLASS}
        aria-label="切换服务配置"
        value={backend.id}
        onChange={(event) => selectBackend(event.target.value)}
      >
        {availableBackends.map((candidate) => (
          <option key={candidate.id} value={candidate.id}>
            {candidate.name}
          </option>
        ))}
      </select>
      <input
        className={`${INPUT_CLASS} connection-bar__url`}
        aria-label="服务 API 地址"
        value={draftUrl}
        spellCheck={false}
        placeholder="服务 API 地址"
        onChange={(event) => setDraftUrl(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            handleRetry()
          }
        }}
      />
      <button
        type="button"
        className="connection-bar__retry"
        disabled={!draftUrl.trim()}
        onClick={handleRetry}
      >
        重试
      </button>
    </div>
  )
}
