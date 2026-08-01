import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

import type {
  DesktopRuntimeApi,
  LocalRuntimeLaunchConfig,
  LocalRuntimePathKind,
  LocalRuntimeSnapshot
} from '../types/electron'

import styles from './LocalRuntimeLauncher.module.scss'

const STORAGE_KEY = 'unilab.local-runtime-launch-config.v1'
const EMPTY_CONFIG: LocalRuntimeLaunchConfig = {
  graphPath: '',
  osProjectPath: '',
  simulatorProjectPath: '',
  startSimulator: true
}
const IDLE_SNAPSHOT: LocalRuntimeSnapshot = {
  phase: 'idle',
  message: '本地环境未启动',
  simulatorRunning: false,
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
            <h2 id="local-runtime-title">启动本地环境</h2>
            <p id="local-runtime-description">
              通过系统文件管理器选择设备图与项目目录，由桌面端统一管理 Edge 和 OPC 仿真进程。
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
              <strong>同时启动 OPC 仿真器</strong>
              <small>
                关闭后只启动 Edge，使用设备图中配置的现有 OPC 服务。
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
              id="runtime-graph-path"
              label="设备图 JSON"
              value={config.graphPath}
              placeholder="选择用于启动 Edge 的设备图"
              buttonLabel="选择文件"
              disabled={disabled}
              invalid={submitted && Boolean(validation.errors.graphPath)}
              error={submitted ? validation.errors.graphPath : undefined}
              autoFocus
              onChoose={() => onChoosePath('graph')}
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
              id="runtime-simulator-path"
              label="OPC 仿真项目目录"
              value={config.simulatorProjectPath}
              placeholder={config.startSimulator
                ? '选择 PLC-Sim 项目目录'
                : '未启用仿真，无需选择'}
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

          <RuntimeStatus snapshot={snapshot} />

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
  snapshot
}: {
  snapshot: LocalRuntimeSnapshot
}): React.JSX.Element {
  return (
    <div
      className={styles.statusStrip}
      data-phase={snapshot.phase}
      role="status"
      aria-live="polite"
    >
      <span className={styles.statusDot} aria-hidden="true" />
      <strong>{snapshot.message}</strong>
      <span className={styles.processState}>
        Edge {snapshot.edgeRunning ? '运行中' : '未启动'}
      </span>
      <span className={styles.processState}>
        OPC {snapshot.simulatorRunning ? '运行中' : '未启动'}
      </span>
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
  if (config.startSimulator && !config.simulatorProjectPath.trim()) {
    errors.simulatorProjectPath = '启用仿真时必须选择 OPC 仿真项目目录'
  }
  return { valid: Object.keys(errors).length === 0, errors }
}

function launcherLabel(snapshot: LocalRuntimeSnapshot): string {
  if (snapshot.phase === 'ready') return '本地环境已启动'
  if (snapshot.phase === 'failed') return '本地环境启动失败'
  if (isTransitioning(snapshot)) return '本地环境启动中'
  return '启动本地环境'
}

function isActive(snapshot: LocalRuntimeSnapshot): boolean {
  return snapshot.phase === 'ready' || isTransitioning(snapshot)
}

function isTransitioning(snapshot: LocalRuntimeSnapshot): boolean {
  return [
    'validating',
    'starting_simulator',
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
  return 'simulatorProjectPath'
}

function readStoredConfig(): LocalRuntimeLaunchConfig {
  if (typeof globalThis.localStorage === 'undefined') return { ...EMPTY_CONFIG }
  try {
    const parsed = JSON.parse(
      globalThis.localStorage.getItem(STORAGE_KEY) ?? 'null'
    ) as Partial<LocalRuntimeLaunchConfig> | null
    if (!parsed) return { ...EMPTY_CONFIG }
    return {
      graphPath: typeof parsed.graphPath === 'string' ? parsed.graphPath : '',
      osProjectPath: typeof parsed.osProjectPath === 'string'
        ? parsed.osProjectPath
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

function desktopRuntimeApi(): DesktopRuntimeApi | undefined {
  return typeof globalThis.window === 'undefined'
    ? undefined
    : globalThis.window.api?.runtime
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
