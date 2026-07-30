import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import {
  useServices,
  type ActionRunStatus,
  type DeviceAction,
  type DeviceActionSchema,
  type DeviceActionTarget,
  type JobResult
} from '@unilab/services'

import {
  actionDraftStorageKey,
  defaultActionParameters,
  isActiveJobStatus,
  jobStatusLabel,
  parseActionParameters,
  projectJobLogs,
  readActionDraft,
  writeActionDraft,
  type ActionLogLevel
} from './actionRunState'
import styles from './OnlineDeviceActionPanel.module.scss'

interface OnlineDeviceActionPanelProps {
  devices: DeviceActionTarget[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

interface RunLog {
  id: number
  time: string
  level: ActionLogLevel
  message: string
}

const POLL_INTERVAL_MS = 800

export default function OnlineDeviceActionPanel({
  devices,
  loading,
  error,
  refresh
}: OnlineDeviceActionPanelProps): React.JSX.Element {
  const services = useServices()
  const client = services.laboratory
  const [selectedDeviceId, setSelectedDeviceId] = useState('')
  const [actions, setActions] = useState<DeviceAction[]>([])
  const [selectedActionName, setSelectedActionName] = useState('')
  const [actionsLoading, setActionsLoading] = useState(false)
  const [actionsError, setActionsError] = useState<string | null>(null)
  const [actionSchema, setActionSchema] =
    useState<DeviceActionSchema | null>(null)
  const [schemaLoading, setSchemaLoading] = useState(false)
  const [parameterText, setParameterText] = useState('{}')
  const [parameterError, setParameterError] = useState<string | null>(null)
  const [job, setJob] = useState<JobResult | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [logs, setLogs] = useState<RunLog[]>([])
  const [copyStatus, setCopyStatus] = useState('')
  const logSequence = useRef(0)
  const runToken = useRef(0)
  const pollTimer = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null)
  const lastStatus = useRef<ActionRunStatus | null>(null)
  const projectedLogLines = useRef(new Set<string>())

  const selectedDevice = devices.find(
    (device) => device.deviceId === selectedDeviceId
  ) ?? null
  const selectedAction = actions.find(
    (action) => action.actionName === selectedActionName
  ) ?? null
  const running = isActiveJobStatus(job?.status ?? null)

  const appendLog = useCallback((
    level: ActionLogLevel,
    message: string
  ): void => {
    const time = new Intl.DateTimeFormat('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(new Date())
    setLogs((current) => [
      ...current,
      {
        id: ++logSequence.current,
        time,
        level,
        message
      }
    ])
  }, [])

  useEffect(() => {
    if (devices.length === 0) {
      setSelectedDeviceId('')
      return
    }
    if (!devices.some((device) => device.deviceId === selectedDeviceId)) {
      setSelectedDeviceId(devices[0].deviceId)
    }
  }, [devices, selectedDeviceId])

  useEffect(() => {
    if (!selectedDeviceId) {
      setActions([])
      setSelectedActionName('')
      return
    }

    let active = true
    setActionsLoading(true)
    setActionsError(null)
    setActions([])
    setSelectedActionName('')
    void client.getDeviceActions(selectedDeviceId)
      .then((nextActions) => {
        if (!active) return
        setActions(nextActions)
        setSelectedActionName(nextActions[0]?.actionName ?? '')
      })
      .catch((cause: unknown) => {
        if (!active) return
        setActionsError(errorMessage(cause, '获取 Action 列表失败'))
      })
      .finally(() => {
        if (active) setActionsLoading(false)
      })

    return () => {
      active = false
    }
  }, [client, selectedDeviceId])

  const storageKey = useMemo(() => {
    if (!selectedDeviceId || !selectedActionName) return ''
    return actionDraftStorageKey(
      services.backend.id,
      services.backend.apiUrl,
      selectedDeviceId,
      selectedActionName
    )
  }, [
    selectedActionName,
    selectedDeviceId,
    services.backend.apiUrl,
    services.backend.id
  ])

  useEffect(() => {
    if (!selectedDeviceId || !selectedActionName) {
      setActionSchema(null)
      setParameterText('{}')
      return
    }

    let active = true
    setSchemaLoading(true)
    setActionSchema(null)
    setParameterError(null)
    void client.getActionSchema(selectedDeviceId, selectedActionName)
      .then((nextSchema) => {
        if (!active) return
        setActionSchema(nextSchema)
        const fallback = defaultActionParameters(nextSchema)
        setParameterText(readActionDraft(
          browserStorage(),
          storageKey,
          fallback
        ))
      })
      .catch((cause: unknown) => {
        if (!active) return
        setParameterError(errorMessage(cause, '获取参数 Schema 失败'))
        setParameterText(readActionDraft(browserStorage(), storageKey, '{}'))
      })
      .finally(() => {
        if (active) setSchemaLoading(false)
      })

    return () => {
      active = false
    }
  }, [client, selectedActionName, selectedDeviceId, storageKey])

  const applyJobResult = useCallback((nextJob: JobResult): void => {
    setJob(nextJob)
    if (lastStatus.current !== nextJob.status) {
      const level: ActionLogLevel = nextJob.status === 'failed'
        ? 'error'
        : nextJob.status === 'cancel_requested' ||
            nextJob.status === 'cancelled' ||
            nextJob.status === 'reconciling' ||
            nextJob.status === 'dispatch_unknown'
          ? 'warning'
          : 'info'
      appendLog(level, `任务状态：${jobStatusLabel(nextJob.status)}`)
      lastStatus.current = nextJob.status
    }
    projectJobLogs(nextJob).forEach((line) => {
      const fingerprint = `${line.level}:${line.message}`
      if (projectedLogLines.current.has(fingerprint)) return
      projectedLogLines.current.add(fingerprint)
      appendLog(line.level, line.message)
    })
  }, [appendLog])

  const pollJob = useCallback(async (
    jobId: string,
    token: number
  ): Promise<void> => {
    if (token !== runToken.current) return
    try {
      const nextJob = await client.getJobStatus(jobId)
      if (token !== runToken.current) return
      applyJobResult(nextJob)
      if (!isActiveJobStatus(nextJob.status)) return
    } catch (cause) {
      if (token !== runToken.current) return
      appendLog('warning', errorMessage(cause, '读取任务状态失败，正在重试'))
    }
    pollTimer.current = globalThis.setTimeout(
      () => void pollJob(jobId, token),
      POLL_INTERVAL_MS
    )
  }, [appendLog, applyJobResult, client])

  useEffect(() => () => {
    runToken.current += 1
    if (pollTimer.current != null) {
      globalThis.clearTimeout(pollTimer.current)
    }
  }, [])

  const runAction = async (): Promise<void> => {
    if (!selectedDevice || !selectedAction) return
    let actionArgs: Record<string, unknown>
    try {
      actionArgs = parseActionParameters(parameterText)
      setParameterError(null)
    } catch (cause) {
      setParameterError(errorMessage(cause, '动作参数不是有效 JSON'))
      return
    }

    const token = ++runToken.current
    if (pollTimer.current != null) {
      globalThis.clearTimeout(pollTimer.current)
    }
    setSubmitting(true)
    setCancelling(false)
    setJob(null)
    setLogs([])
    setCopyStatus('')
    lastStatus.current = null
    projectedLogLines.current.clear()
    appendLog(
      'info',
      `提交 ${selectedDevice.deviceId}.${selectedAction.actionName}`
    )
    try {
      const acceptedJob = await client.addJob({
        deviceId: selectedDevice.deviceId,
        action: selectedAction.actionName,
        actionArgs
      })
      if (token !== runToken.current) return
      applyJobResult(acceptedJob)
      if (isActiveJobStatus(acceptedJob.status)) {
        pollTimer.current = globalThis.setTimeout(
          () => void pollJob(acceptedJob.jobId, token),
          POLL_INTERVAL_MS
        )
      }
    } catch (cause) {
      if (token === runToken.current) {
        appendLog('error', errorMessage(cause, '提交动作失败'))
      }
    } finally {
      if (token === runToken.current) setSubmitting(false)
    }
  }

  const cancelAction = async (): Promise<void> => {
    if (!job || !isActiveJobStatus(job.status)) return
    setCancelling(true)
    appendLog('warning', `请求终止任务 ${job.jobId}`)
    try {
      const nextJob = await client.cancelJob(job.jobId)
      applyJobResult(nextJob)
    } catch (cause) {
      appendLog('error', errorMessage(cause, '终止任务失败'))
    } finally {
      setCancelling(false)
    }
  }

  const logText = useMemo(
    () => logs.map((line) =>
      `[${line.time}] [${line.level.toUpperCase()}] ${line.message}`
    ).join('\n'),
    [logs]
  )

  const copyLogs = async (): Promise<void> => {
    try {
      await copyText(logText)
      setCopyStatus('已复制')
    } catch {
      setCopyStatus('复制失败')
    }
  }

  return (
    <section className={`section section--split ${styles.page}`}>
      <aside className="section__list" aria-label="Action 设备列表">
        <header className="section__list-head">
          <div>
            <h1 className="section__list-title">仪器设备</h1>
            <span className="section__list-meta">
              {loading ? '正在读取…' : `${devices.length} 台 Action 设备`}
            </span>
          </div>
          <span className={styles.connectedBadge}>
            <span aria-hidden="true" />
            OS 已连接
          </span>
        </header>

        {error ? (
          <div className={styles.listMessage} role="alert">
            <strong>Action 设备加载失败</strong>
            <span>{error}</span>
            <button type="button" onClick={() => void refresh()}>重试</button>
          </div>
        ) : null}
        {!error && !loading && devices.length === 0 ? (
          <div className={styles.listMessage}>
            <strong>没有可用 Action</strong>
            <span>OS 同步 Action 目录后会显示在这里。</span>
            <button type="button" onClick={() => void refresh()}>刷新</button>
          </div>
        ) : null}
        <ul className="device-list">
          {devices.map((device) => (
            <li key={device.deviceId}>
              <button
                type="button"
                className={[
                  'device-list__item',
                  styles.deviceItem,
                  selectedDeviceId === device.deviceId ? styles.selected : ''
                ].filter(Boolean).join(' ')}
                aria-pressed={selectedDeviceId === device.deviceId}
                disabled={running}
                onClick={() => setSelectedDeviceId(device.deviceId)}
              >
                <span className={styles.deviceIcon} aria-hidden="true">
                  <DeviceIcon />
                </span>
                <span className={styles.deviceCopy}>
                  <span className="device-list__row">
                    <span className="device-list__status is-online" />
                    <span className="device-list__name">
                      {device.label || device.deviceId}
                    </span>
                  </span>
                  <span className="device-list__key">{device.deviceId}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <main className={`section__detail ${styles.detail}`} aria-label="Action 单点运行">
        {selectedDevice ? (
          <>
            <header className={styles.identity}>
              <span className={styles.identityIcon} aria-hidden="true">
                <DeviceIcon />
              </span>
              <div>
                <h2>{selectedDevice.label || selectedDevice.deviceId}</h2>
                <p>{selectedDevice.deviceId} · 统一运行接口</p>
              </div>
              <span className={styles.onlineStatus}>可调试</span>
            </header>

            <div className={styles.workspace}>
              <nav className={styles.actionList} aria-label="可用 Action">
                <div className={styles.sectionHeading}>
                  <h3>Action</h3>
                  <span>{actions.length}</span>
                </div>
                {actionsLoading ? (
                  <p className={styles.muted}>正在读取 Action…</p>
                ) : null}
                {actionsError ? (
                  <p className={styles.errorText} role="alert">{actionsError}</p>
                ) : null}
                {!actionsLoading && !actionsError && actions.length === 0 ? (
                  <p className={styles.muted}>该设备没有可用 Action。</p>
                ) : null}
                {actions.map((action) => (
                  <button
                    key={action.actionName}
                    type="button"
                    className={
                      selectedActionName === action.actionName
                        ? styles.activeAction
                        : ''
                    }
                    aria-pressed={selectedActionName === action.actionName}
                    disabled={running}
                    onClick={() => setSelectedActionName(action.actionName)}
                  >
                    <span>{action.actionName}</span>
                    {action.isBusy ? <small>忙碌</small> : null}
                  </button>
                ))}
              </nav>

              <div className={styles.runner}>
                <section className={styles.card}>
                  <div className={styles.cardHeading}>
                    <div>
                      <h3>动作参数</h3>
                      <p>{selectedAction?.typeName || actionSchema?.actionType || '选择 Action 后加载'}</p>
                    </div>
                    {schemaLoading ? <span>读取 Schema…</span> : null}
                  </div>
                  <label className={styles.parameterField}>
                    <span>参数 JSON</span>
                    <textarea
                      aria-label="动作参数 JSON"
                      value={parameterText}
                      disabled={!selectedAction || schemaLoading || running}
                      spellCheck={false}
                      onChange={(event) => {
                        const value = event.target.value
                        setParameterText(value)
                        setParameterError(null)
                        writeActionDraft(browserStorage(), storageKey, value)
                      }}
                    />
                  </label>
                  {parameterError ? (
                    <p className={styles.validationError} role="alert">
                      {parameterError}
                    </p>
                  ) : null}
                  <div className={styles.runActions}>
                    <button
                      type="button"
                      className={styles.runButton}
                      disabled={
                        !selectedAction ||
                        schemaLoading ||
                        submitting ||
                        running ||
                        selectedAction.isBusy
                      }
                      onClick={() => void runAction()}
                    >
                      <RunIcon />
                      {submitting ? '提交中…' : '运行'}
                    </button>
                    <button
                      type="button"
                      className={styles.cancelButton}
                      disabled={!running || cancelling}
                      onClick={() => void cancelAction()}
                    >
                      <StopIcon />
                      {cancelling ? '终止中…' : '终止'}
                    </button>
                    <span className={styles.jobStatus} role="status">
                      {job
                        ? `${jobStatusLabel(job.status)} · ${job.jobId}`
                        : '尚未运行'}
                    </span>
                  </div>
                </section>

                <section className={`${styles.card} ${styles.logCard}`}>
                  <div className={styles.cardHeading}>
                    <div>
                      <h3>运行日志</h3>
                      <p>完整展示状态、info、feedback、返回值与 traceback</p>
                    </div>
                    <div className={styles.copyArea}>
                      <span role="status">{copyStatus}</span>
                      <button
                        type="button"
                        disabled={!logText}
                        onClick={() => void copyLogs()}
                      >
                        <CopyIcon />
                        复制
                      </button>
                    </div>
                  </div>
                  <div
                    className={styles.logs}
                    role="log"
                    aria-live="polite"
                    aria-label="Action 运行日志"
                  >
                    {logs.length === 0 ? (
                      <p>运行 Action 后，日志会显示在这里。</p>
                    ) : logs.map((line) => (
                      <div
                        key={line.id}
                        className={styles[line.level]}
                        data-log-level={line.level}
                      >
                        <time>{line.time}</time>
                        <span>{line.message}</span>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </div>
          </>
        ) : (
          <div className={styles.detailEmpty}>
            {loading ? '正在读取在线设备…' : '请选择一台在线设备'}
          </div>
        )}
      </main>
    </section>
  )
}

function browserStorage(): Storage | null {
  try {
    return globalThis.localStorage
  } catch {
    return null
  }
}

async function copyText(value: string): Promise<void> {
  if (globalThis.navigator?.clipboard?.writeText) {
    await globalThis.navigator.clipboard.writeText(value)
    return
  }
  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.append(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  textarea.remove()
  if (!copied) throw new Error('Clipboard unavailable')
}

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback
}

function DeviceIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 20 20">
      <rect x="3" y="4" width="14" height="12" rx="2" />
      <path d="M7 8h6M7 12h3M5 2v2M15 2v2M5 16v2M15 16v2" />
    </svg>
  )
}

function RunIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path d="m7 5 7 5-7 5V5Z" />
    </svg>
  )
}

function StopIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <rect x="6" y="6" width="8" height="8" rx="1" />
    </svg>
  )
}

function CopyIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <rect x="7" y="7" width="9" height="9" rx="1.5" />
      <path d="M13 7V5.5A1.5 1.5 0 0 0 11.5 4h-7A1.5 1.5 0 0 0 3 5.5v7A1.5 1.5 0 0 0 4.5 14H7" />
    </svg>
  )
}
