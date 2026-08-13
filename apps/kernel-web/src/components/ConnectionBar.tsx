import { useEffect, useState } from 'react'

import { useWorkbench } from '../context/WorkbenchContext'
import { shouldShowConnectionRecovery } from '../context/connectionPolicy'
import { useBackendConnection } from '../hooks/useBackendConnection'

import styles from './ConnectionBar.module.scss'
import LocalRuntimeLauncher, {
  LocalRuntimeLogLauncher
} from './LocalRuntimeLauncher'

const LOCAL_RUNTIME_EDGE_API_URL = 'http://127.0.0.1:18003'
const LOCAL_RUNTIME_DISCONNECT_GRACE_MS = 250

export default function ConnectionBar(): React.JSX.Element {
  const {
    backend,
    backendEnabled,
    connection,
    capabilityHealth,
    availableBackends,
    selectBackend,
    updateBackend,
    setBackendEnabled,
    requestRecovery
  } = useWorkbench()
  const { disconnect, reconnect } = useBackendConnection()
  const [draftUrl, setDraftUrl] = useState(backend.apiUrl)
  const [recovering, setRecovering] = useState(false)

  useEffect(() => {
    setDraftUrl(backend.apiUrl)
  }, [backend.id, backend.apiUrl])

  const showRecovery = shouldShowConnectionRecovery(
    backendEnabled,
    connection
  )
  const trimmedDraftUrl = draftUrl.trim()
  const hasDraftChange = trimmedDraftUrl !== backend.apiUrl
  const targetName = backend.serverKind === 'edge' ? 'Edge' : backend.name
  const capabilityErrors = Object.values(capabilityHealth).filter(
    (health) => health.status === 'error'
  ).length
  const showAttention = showRecovery || capabilityErrors > 0
  const showConnected = backendEnabled && connection === 'connected'
  const showDisconnected = backendEnabled && connection === 'disconnected'
  const statusLabel = showRecovery
    ? `${targetName} 连接失败`
    : showConnected
      ? capabilityErrors > 0
        ? `${targetName} 已连接 · ${capabilityErrors} 项待恢复`
        : `${targetName} 已连接`
      : showDisconnected
        ? `${targetName} 未连接`
        : !backendEnabled
            ? `${targetName} 未连接`
            : null

  const handleApply = (): void => {
    const trimmed = draftUrl.trim()
    if (!trimmed) return
    // Applying an address is an explicit request to connect to an externally
    // managed backend, even when the Electron local launcher is still idle.
    setBackendEnabled(true)
    if (trimmed !== backend.apiUrl) {
      updateBackend({ apiUrl: trimmed })
      return
    }
    void reconnect().then(requestRecovery)
  }

  const handleRecover = async (): Promise<void> => {
    const trimmed = draftUrl.trim()
    if (!trimmed || recovering) return
    setRecovering(true)
    try {
      setBackendEnabled(true)
      if (trimmed !== backend.apiUrl) {
        updateBackend({ apiUrl: trimmed })
        requestRecovery()
        return
      }
      await reconnect()
      requestRecovery()
    } finally {
      setRecovering(false)
    }
  }

  const handleRuntimeReady = (): void => {
    setBackendEnabled(true)
    if (backend.id !== 'local-python') {
      selectBackend('local-python')
      return
    }
    if (backend.apiUrl !== LOCAL_RUNTIME_EDGE_API_URL) {
      updateBackend({ apiUrl: LOCAL_RUNTIME_EDGE_API_URL })
      return
    }
    void reconnect().then(requestRecovery)
  }

  const handleRuntimeStopping = async (): Promise<void> => {
    if (
      backend.id === 'local-python'
      && backend.apiUrl === LOCAL_RUNTIME_EDGE_API_URL
    ) {
      disconnect()
      setBackendEnabled(false)
      // Let React tear down health/device polling and allow any request already
      // in flight to settle while Edge is still available. Closing the local
      // port before this drain produces user-visible ERR_CONNECTION_REFUSED.
      await new Promise<void>((resolve) => {
        globalThis.setTimeout(resolve, LOCAL_RUNTIME_DISCONNECT_GRACE_MS)
      })
    }
  }

  return (
    <div
      className={[
        styles.root,
        showAttention ? styles.error : '',
        showConnected ? styles.connected : ''
      ].filter(Boolean).join(' ')}
      role="group"
      aria-label={`${targetName} 连接配置`}
      data-connection-state={connection}
    >
      <LocalRuntimeLogLauncher />
      {statusLabel ? (
        <span
          className={styles.status}
          role={showAttention ? 'alert' : 'status'}
        >
          <span className={styles.statusDot} aria-hidden="true" />
          {statusLabel}
        </span>
      ) : null}
      <details className={styles.details}>
        <summary>运行状态</summary>
        <div className={styles.popover}>
          <ul className={styles.healthList} aria-label="连接影响范围">
            <HealthRow
              label={targetName}
              status={connection === 'connected' ? 'ready' : connection}
              summary={statusLabel ?? `${targetName} 状态未知`}
            />
            <HealthRow label="设备目录" {...capabilityHealth.devices} />
            <HealthRow label="物料图" {...capabilityHealth.materials} />
            <HealthRow label="工作流目录" {...capabilityHealth.workflows} />
          </ul>
          <div className={styles.configuration}>
            <label>
              <span>后端权威</span>
              <select
                className={styles.field}
                aria-label="切换后端权威"
                value={backend.id}
                onChange={(event) => {
                  setBackendEnabled(true)
                  selectBackend(event.target.value)
                }}
              >
                {availableBackends.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>API 地址</span>
              <input
                className={`${styles.field} ${styles.url}`}
                aria-label="后端权威 API 地址"
                value={draftUrl}
                spellCheck={false}
                placeholder="后端权威 API 地址"
                aria-invalid={showRecovery || undefined}
                onChange={(event) => setDraftUrl(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    if (hasDraftChange || showRecovery || !backendEnabled) {
                      handleApply()
                    }
                  }
                }}
              />
            </label>
            {hasDraftChange || showRecovery || !backendEnabled ? (
              <button
                type="button"
                className={styles.action}
                disabled={!trimmedDraftUrl}
                onClick={handleApply}
              >
                {hasDraftChange ? '应用地址' : backendEnabled ? '重试连接' : '连接'}
              </button>
            ) : null}
          </div>
        </div>
      </details>
      {showAttention || !backendEnabled ? (
        <button
          type="button"
          className={styles.action}
          disabled={!trimmedDraftUrl || recovering}
          onClick={() => void handleRecover()}
        >
          {recovering ? '恢复中…' : backendEnabled ? '重连并重新读取' : '连接'}
        </button>
      ) : null}
      <LocalRuntimeLauncher
        onReady={handleRuntimeReady}
        onStopping={handleRuntimeStopping}
      />
    </div>
  )
}

function HealthRow({
  label,
  status,
  summary,
  technicalDetail
}: {
  label: string
  status: string
  summary: string
  technicalDetail?: string
}): React.JSX.Element {
  return (
    <li data-status={status}>
      <span aria-hidden="true" />
      <strong>{label}</strong>
      <small>{summary}</small>
      {technicalDetail ? (
        <details>
          <summary>技术信息</summary>
          <code>{technicalDetail}</code>
        </details>
      ) : null}
    </li>
  )
}
