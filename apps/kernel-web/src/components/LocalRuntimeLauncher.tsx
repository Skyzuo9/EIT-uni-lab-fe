import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

import type {
  DesktopRuntimeApi,
  LocalRuntimeLaunchConfig,
  LocalRuntimePathKind,
  LocalRuntimeSnapshot
} from '../types/electron'

import styles from './LocalRuntimeLauncher.module.scss'

const STORAGE_KEY = 'unilab.local-runtime-launch-config.v2'
const LEGACY_STORAGE_KEY = 'unilab.local-runtime-launch-config.v1'
const EMPTY_CONFIG: LocalRuntimeLaunchConfig = {
  graphPath: '',
  osProjectPath: '',
  szlabProjectPath: '',
  environmentPath: '',
  simulatorProjectPath: '',
  startSimulator: true
}
const IDLE_SNAPSHOT: LocalRuntimeSnapshot = {
  phase: 'idle',
  message: '本地调试环境未启动',
  simulatorRunning: false,
  bridgeRunning: false,
  edgeRunning: false
}

interface LocalRuntimeLauncherProps {
  runtimeApi?: DesktopRuntimeApi
  onReady?: () => void
}

export default function LocalRuntimeLauncher({
  runtimeApi = desktopRuntimeApi(),
  onReady
}: LocalRuntimeLauncherProps): React.JSX.Element | null {
  const [open, setOpen] = useState(false)
  const [config, setConfig] = useState(readStoredConfig)
  const [snapshot, setSnapshot] = useState(IDLE_SNAPSHOT)
  const [localError, setLocalError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    if (!runtimeApi) return
    let active = true
    void runtimeApi.getSnapshot().then((nextSnapshot) => {
      if (active) setSnapshot(nextSnapshot)
    }).catch((error: unknown) => {
      if (active) setLocalError(errorMessage(error))
    })
    const unsubscribe = runtimeApi.onSnapshot((nextSnapshot) => {
      if (active) setSnapshot(nextSnapshot)
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [runtimeApi])

  useEffect(() => {
    if (typeof globalThis.localStorage === 'undefined') return
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  }, [config])

  useEffect(() => {
    if (!open || typeof document === 'undefined') return
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !isTransitioning(snapshot)) setOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, snapshot])

  if (!runtimeApi) return null

  const validation = validateConfig(config)
  const active = isActive(snapshot)
  const transitioning = isTransitioning(snapshot)

  const choosePath = async (kind: LocalRuntimePathKind): Promise<void> => {
    setLocalError(null)
    try {
      const path = await runtimeApi.selectPath(kind)
      if (!path) return
      setConfig((current) => ({
        ...current,
        [pathField(kind)]: path
      }))
    } catch (error) {
      setLocalError(errorMessage(error))
    }
  }

  const start = async (): Promise<void> => {
    setSubmitted(true)
    setLocalError(null)
    if (!validation.valid) return
    try {
      const nextSnapshot = await runtimeApi.start(config)
      setSnapshot(nextSnapshot)
      onReady?.()
    } catch (error) {
      setLocalError(errorMessage(error))
    }
  }

  const stop = async (): Promise<void> => {
    setLocalError(null)
    try {
      setSnapshot(await runtimeApi.stop())
    } catch (error) {
      setLocalError(errorMessage(error))
    }
  }

  return (
    <>
      <button
        type="button"
        className={styles.launcherButton}
        data-runtime-phase={snapshot.phase}
        onClick={() => setOpen(true)}
      >
        <span className={styles.launcherDot} aria-hidden="true" />
        {launcherLabel(snapshot)}
      </button>
      {open && typeof document !== 'undefined'
        ? createPortal(
            <LocalRuntimeDialog
              config={config}
              snapshot={snapshot}
              error={localError ?? snapshot.error ?? null}
              submitted={submitted}
              validation={validation}
              onChange={setConfig}
              onChoosePath={(kind) => void choosePath(kind)}
              onClose={() => setOpen(false)}
              onStart={() => void start()}
              onStop={() => void stop()}
              onOpenLogs={() => void runtimeApi.openLogs()}
              active={active}
              transitioning={transitioning}
            />,
            document.body
          )
        : null}
    </>
  )
}

interface LocalRuntimeDialogProps {
  config: LocalRuntimeLaunchConfig
  snapshot: LocalRuntimeSnapshot
  error: string | null
  submitted: boolean
  validation: ValidationResult
  active: boolean
  transitioning: boolean
  onChange: (config: LocalRuntimeLaunchConfig) => void
  onChoosePath: (kind: LocalRuntimePathKind) => void
  onClose: () => void
  onStart: () => void
  onStop: () => void
  onOpenLogs: () => void
}

export function LocalRuntimeDialog({
  config,
  snapshot,
  error,
  submitted,
  validation,
  active,
  transitioning,
  onChange,
  onChoosePath,
  onClose,
  onStart,
  onStop,
  onOpenLogs
}: LocalRuntimeDialogProps): React.JSX.Element {
  const disabled = active || transitioning

  return (
    <div className={styles.backdrop}>
      <section
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="local-runtime-title"
        aria-describedby="local-runtime-description"
      >
        <header className={styles.header}>
          <div>
            <h2 id="local-runtime-title">启动 SZLab 本地调试环境</h2>
            <p id="local-runtime-description">
              选择项目和 Conda 环境后，桌面端将启动 OPC UA 与 SZLab Edge。
            </p>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            aria-label="关闭本地环境配置"
            disabled={transitioning}
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className={styles.body}>
          <label className={styles.simulatorOption}>
            <span>
              <strong>同时启动本地 OPC UA</strong>
              <small>
                使用 PLC-Sim 的 OpcUaSim，监听 127.0.0.1:18765。
              </small>
            </span>
            <input
              className={styles.switchInput}
              type="checkbox"
              role="switch"
              checked={config.startSimulator}
              disabled={disabled}
              onChange={(event) => onChange({
                ...config,
                startSimulator: event.target.checked
              })}
            />
          </label>

          <div className={styles.fields}>
            <PathField
              id="runtime-environment-path"
              label="unilab Conda 环境目录"
              value={config.environmentPath}
              placeholder="例如 /Users/dp/miniforge3/envs/unilab"
              buttonLabel="选择目录"
              disabled={disabled}
              invalid={submitted && Boolean(validation.errors.environmentPath)}
              error={submitted ? validation.errors.environmentPath : undefined}
              autoFocus
              onChoose={() => onChoosePath('environment')}
            />
            <PathField
              id="runtime-os-path"
              label="Uni-Lab-OS 项目根目录"
              value={config.osProjectPath}
              placeholder="选择 Uni-Lab-OS 项目根目录"
              buttonLabel="选择目录"
              disabled={disabled}
              invalid={submitted && Boolean(validation.errors.osProjectPath)}
              error={submitted ? validation.errors.osProjectPath : undefined}
              onChoose={() => onChoosePath('os')}
            />
            <PathField
              id="runtime-szlab-path"
              label="Uni-Lab-SZLab 项目根目录"
              value={config.szlabProjectPath}
              placeholder="选择 Uni-Lab-SZLab 项目根目录"
              buttonLabel="选择目录"
              disabled={disabled}
              invalid={submitted && Boolean(validation.errors.szlabProjectPath)}
              error={submitted ? validation.errors.szlabProjectPath : undefined}
              onChoose={() => onChoosePath('szlab')}
            />
            <PathField
              id="runtime-graph-path"
              label="SZLab 设备图 JSON"
              value={config.graphPath}
              placeholder="选择 szlab-ideawit-sim 设备图"
              buttonLabel="选择文件"
              disabled={disabled}
              invalid={submitted && Boolean(validation.errors.graphPath)}
              error={submitted ? validation.errors.graphPath : undefined}
              onChoose={() => onChoosePath('graph')}
            />
            <PathField
              id="runtime-simulator-path"
              label="PLC-Sim 项目根目录"
              value={config.simulatorProjectPath}
              placeholder={config.startSimulator
                ? '选择包含 OpcUaSim 的 PLC-Sim 项目根目录'
                : '未启用本地 OPC UA，无需选择'}
              buttonLabel="选择目录"
              disabled={disabled || !config.startSimulator}
              invalid={
                submitted && Boolean(validation.errors.simulatorProjectPath)
              }
              error={submitted
                ? validation.errors.simulatorProjectPath
                : undefined}
              onChoose={() => onChoosePath('simulator')}
            />
          </div>

          <RuntimeStatus
            snapshot={snapshot}
            startSimulator={config.startSimulator}
          />

          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <footer className={styles.footer}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={onOpenLogs}
          >
            查看日志
          </button>
          <span className={styles.footerSpacer} />
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={transitioning}
            onClick={onClose}
          >
            关闭
          </button>
          {active ? (
            <button
              type="button"
              className={styles.stopButton}
              disabled={transitioning}
              onClick={onStop}
            >
              停止本地环境
            </button>
          ) : (
            <button
              type="button"
              className={styles.primaryButton}
              disabled={transitioning}
              onClick={onStart}
            >
              {transitioning ? '正在启动…' : '启动本地环境'}
            </button>
          )}
        </footer>
      </section>
    </div>
  )
}

function PathField({
  id,
  label,
  value,
  placeholder,
  buttonLabel,
  disabled,
  invalid,
  error,
  autoFocus = false,
  onChoose
}: {
  id: string
  label: string
  value: string
  placeholder: string
  buttonLabel: string
  disabled: boolean
  invalid: boolean
  error?: string
  autoFocus?: boolean
  onChoose: () => void
}): React.JSX.Element {
  const errorId = `${id}-error`
  const labelId = `${id}-label`
  const valueId = `${id}-value`
  const actionId = `${id}-action`
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel} id={labelId}>
        {label}
      </span>
      <button
        id={id}
        type="button"
        className={styles.pathPicker}
        disabled={disabled}
        aria-labelledby={`${labelId} ${valueId} ${actionId}`}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? errorId : undefined}
        autoFocus={autoFocus}
        title={value || undefined}
        onClick={onChoose}
      >
        <span
          id={valueId}
          className={value ? styles.pathValue : styles.pathPlaceholder}
        >
          {value || placeholder}
        </span>
        <span className={styles.pathAction} id={actionId}>
          {buttonLabel}
        </span>
      </button>
      {invalid && error ? (
        <small className={styles.fieldError} id={errorId}>
          {error}
        </small>
      ) : null}
    </div>
  )
}

function RuntimeStatus({
  snapshot,
  startSimulator
}: {
  snapshot: LocalRuntimeSnapshot
  startSimulator: boolean
}): React.JSX.Element {
  return (
    <div
      className={styles.statusPanel}
      data-phase={snapshot.phase}
      role="status"
      aria-live="polite"
    >
      <div className={styles.statusHeader}>
        <span className={styles.statusDot} aria-hidden="true" />
        <strong>{snapshot.message}</strong>
      </div>
      <div className={styles.processGrid}>
        <ProcessState
          label="OPC UA"
          port="18765"
          status={runtimeProcessStatus(snapshot, 'simulator', startSimulator)}
        />
        <ProcessState
          label="SZLab Edge"
          port="8014 · 18003 · WS 8892"
          status={edgeRuntimeStatus(snapshot)}
        />
      </div>
    </div>
  )
}

type ProcessDisplayStatus =
  | 'idle'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'failed'
  | 'disabled'

function ProcessState({
  label,
  port,
  status
}: {
  label: string
  port: string
  status: ProcessDisplayStatus
}): React.JSX.Element {
  return (
    <div className={styles.processItem} data-status={status}>
      <span className={styles.processIdentity}>
        <strong>{label}</strong>
        <small>{port}</small>
      </span>
      <span className={styles.processStatus}>{processStatusLabel(status)}</span>
    </div>
  )
}

interface ValidationResult {
  valid: boolean
  errors: Partial<Record<keyof LocalRuntimeLaunchConfig, string>>
}

export function validateConfig(
  config: LocalRuntimeLaunchConfig
): ValidationResult {
  const errors: ValidationResult['errors'] = {}
  if (!config.graphPath.trim()) errors.graphPath = '请选择设备图 JSON'
  if (!config.osProjectPath.trim()) {
    errors.osProjectPath = '请选择 Uni-Lab-OS 项目根目录'
  }
  if (!config.szlabProjectPath.trim()) {
    errors.szlabProjectPath = '请选择 Uni-Lab-SZLab 项目根目录'
  }
  if (!config.environmentPath.trim()) {
    errors.environmentPath = '请选择 unilab Conda 环境目录'
  }
  if (config.startSimulator && !config.simulatorProjectPath.trim()) {
    errors.simulatorProjectPath = '启用本地 OPC UA 时必须选择 PLC-Sim 项目根目录'
  }
  return { valid: Object.keys(errors).length === 0, errors }
}

function launcherLabel(snapshot: LocalRuntimeSnapshot): string {
  if (snapshot.phase === 'ready') return '本地调试已启动'
  if (snapshot.phase === 'failed') return '本地调试启动失败'
  if (isTransitioning(snapshot)) return '本地调试启动中'
  return '启动本地环境'
}

function isActive(snapshot: LocalRuntimeSnapshot): boolean {
  return snapshot.phase === 'ready' || isTransitioning(snapshot)
}

function isTransitioning(snapshot: LocalRuntimeSnapshot): boolean {
  return [
    'validating',
    'starting_simulator',
    'waiting_simulator',
    'starting_bridge',
    'waiting_bridge',
    'starting_edge',
    'waiting_edge',
    'stopping'
  ].includes(snapshot.phase)
}

function pathField(
  kind: LocalRuntimePathKind
): keyof LocalRuntimeLaunchConfig {
  if (kind === 'graph') return 'graphPath'
  if (kind === 'os') return 'osProjectPath'
  if (kind === 'szlab') return 'szlabProjectPath'
  if (kind === 'environment') return 'environmentPath'
  return 'simulatorProjectPath'
}

function readStoredConfig(): LocalRuntimeLaunchConfig {
  if (typeof globalThis.localStorage === 'undefined') return { ...EMPTY_CONFIG }
  try {
    const storedValue = globalThis.localStorage.getItem(STORAGE_KEY)
      ?? globalThis.localStorage.getItem(LEGACY_STORAGE_KEY)
    const parsed = JSON.parse(storedValue ?? 'null') as
      Partial<LocalRuntimeLaunchConfig> | null
    if (!parsed) return { ...EMPTY_CONFIG }
    return {
      graphPath: typeof parsed.graphPath === 'string' ? parsed.graphPath : '',
      osProjectPath: typeof parsed.osProjectPath === 'string'
        ? parsed.osProjectPath
        : '',
      szlabProjectPath: typeof parsed.szlabProjectPath === 'string'
        ? parsed.szlabProjectPath
        : '',
      environmentPath: typeof parsed.environmentPath === 'string'
        ? parsed.environmentPath
        : '',
      simulatorProjectPath: typeof parsed.simulatorProjectPath === 'string'
        ? parsed.simulatorProjectPath
        : '',
      startSimulator: parsed.startSimulator !== false
    }
  } catch {
    return { ...EMPTY_CONFIG }
  }
}

function runtimeProcessStatus(
  snapshot: LocalRuntimeSnapshot,
  kind: 'simulator',
  enabled: boolean
): ProcessDisplayStatus {
  if (!enabled) return 'disabled'
  if (snapshot.failedProcess === kind) return 'failed'
  if (snapshot.phase === 'stopping' && processRunning(snapshot, kind)) {
    return 'stopping'
  }
  if (
    snapshot.phase === `starting_${kind}`
    || snapshot.phase === `waiting_${kind}`
  ) {
    return 'starting'
  }
  if (processRunning(snapshot, kind)) return 'running'
  return 'idle'
}

function edgeRuntimeStatus(
  snapshot: LocalRuntimeSnapshot
): ProcessDisplayStatus {
  if (
    snapshot.failedProcess === 'bridge'
    || snapshot.failedProcess === 'edge'
  ) {
    return 'failed'
  }
  if (
    snapshot.phase === 'stopping'
    && (snapshot.bridgeRunning || snapshot.edgeRunning)
  ) {
    return 'stopping'
  }
  if (
    snapshot.phase === 'ready'
    && snapshot.bridgeRunning
    && snapshot.edgeRunning
  ) {
    return 'running'
  }
  if (
    snapshot.phase === 'starting_bridge'
    || snapshot.phase === 'waiting_bridge'
    || snapshot.phase === 'starting_edge'
    || snapshot.phase === 'waiting_edge'
    || snapshot.bridgeRunning
    || snapshot.edgeRunning
  ) {
    return 'starting'
  }
  return 'idle'
}

function processRunning(
  snapshot: LocalRuntimeSnapshot,
  kind: 'simulator'
): boolean {
  return snapshot.simulatorRunning
}

function processStatusLabel(status: ProcessDisplayStatus): string {
  if (status === 'running') return '运行中'
  if (status === 'starting') return '启动中'
  if (status === 'stopping') return '停止中'
  if (status === 'failed') return '异常'
  if (status === 'disabled') return '未启用'
  return '未启动'
}

function desktopRuntimeApi(): DesktopRuntimeApi | undefined {
  return typeof globalThis.window === 'undefined'
    ? undefined
    : globalThis.window.api?.runtime
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
