import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type SyntheticEvent
} from 'react'
import { createPortal } from 'react-dom'

import type {
  DesktopRuntimeApi,
  LocalRuntimeLaunchConfig,
  LocalRuntimePathKind,
  LocalRuntimeSnapshot
} from '../types/electron'

import LocalRuntimeEdgeCommandEditor from './LocalRuntimeEdgeCommandEditor'
import {
  detectPhoenixObservabilityDependencyIssue,
  LocalRuntimeLogDrawer
} from './LocalRuntimeLogDrawer'
import { LocalRuntimeLogLauncher } from './LocalRuntimeLogLauncher'
import styles from './LocalRuntimeLauncher.module.scss'
import {
  desktopRuntimeApi,
  localRuntimeErrorMessage as errorMessage,
  useDeviceCardSurfaceOcclusion
} from './localRuntimeUiSupport'

export {
  detectPhoenixObservabilityDependencyIssue,
  LocalRuntimeLogDrawer
} from './LocalRuntimeLogDrawer'
export { LocalRuntimeLogLauncher } from './LocalRuntimeLogLauncher'

const STORAGE_KEY = 'unilab.local-runtime-launch-config.v3'
const LEGACY_STORAGE_KEYS = [
  'unilab.local-runtime-launch-config.v2',
  'unilab.local-runtime-launch-config.v1'
] as const
const EMPTY_CONFIG: LocalRuntimeLaunchConfig = {
  graphPath: '',
  osProjectPath: '',
  szlabProjectPath: '',
  environmentPath: '',
  simulatorProjectPath: '',
  edgeCommandMode: 'generated',
  customEdgeCommand: {
    executable: '',
    workingDirectory: '',
    args: [],
    environment: []
  }
}
const IDLE_SNAPSHOT: LocalRuntimeSnapshot = {
  phase: 'idle',
  message: 'PLC-Sim 与领域侧 Edge 均未启动',
  simulatorRunning: false,
  bridgeRunning: false,
  edgeRunning: false
}
const OBSERVABILITY_LOG_CHECK_INTERVAL_MS = 2_000
const OBSERVABILITY_LOG_CHECK_LIMIT = 15

interface LocalRuntimeLauncherProps {
  runtimeApi?: DesktopRuntimeApi
  onReady?: () => void
  onStopping?: () => void | Promise<void>
}

/**
 * 组合桌面端本地调试入口、配置持久化和 PLC-Sim/领域侧 Edge 启停交互。
 *
 * @param props Electron 本地运行接口与启停通知回调。
 * @returns 桌面环境中的启动按钮和按需渲染的配置弹窗；Web 环境返回 null。
 */
export default function LocalRuntimeLauncher({
  runtimeApi = desktopRuntimeApi(),
  onReady,
  onStopping
}: LocalRuntimeLauncherProps): React.JSX.Element | null {
  const [open, setOpen] = useState(false)
  const [config, setConfig] = useState(readStoredConfig)
  const [snapshot, setSnapshot] = useState(IDLE_SNAPSHOT)
  const [localError, setLocalError] = useState<string | null>(null)
  const [simulatorSubmitted, setSimulatorSubmitted] = useState(false)
  const [edgeSubmitted, setEdgeSubmitted] = useState(false)
  const [resolvingGeneratedEdgeCommand, setResolvingGeneratedEdgeCommand] =
    useState(false)
  const [dialogLogsOpen, setDialogLogsOpen] = useState(false)
  const [phoenixDependencyMissing, setPhoenixDependencyMissing] = useState(false)
  const readyNotificationSentRef = useRef(false)
  useDeviceCardSurfaceOcclusion('local-runtime-dialog', open)

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
    const edgeReady = snapshot.phase === 'ready' && snapshot.edgeRunning
    if (!edgeReady) {
      readyNotificationSentRef.current = false
      return
    }
    if (readyNotificationSentRef.current) return
    readyNotificationSentRef.current = true
    onReady?.()
  }, [onReady, snapshot.edgeRunning, snapshot.phase])

  useEffect(() => {
    const edgeReady = snapshot.phase === 'ready' && snapshot.edgeRunning
    if (!runtimeApi || !edgeReady) {
      setPhoenixDependencyMissing(false)
      return
    }
    if (phoenixDependencyMissing) return

    let active = true
    let checksRemaining = OBSERVABILITY_LOG_CHECK_LIMIT
    let nextCheckTimer: ReturnType<typeof globalThis.setTimeout> | undefined

    const inspectEdgeLogs = async (): Promise<void> => {
      try {
        const logs = await runtimeApi.readLogs()
        if (!active) return
        const edgeLog = logs.entries.find((entry) => entry.kind === 'edge')
        if (detectPhoenixObservabilityDependencyIssue(edgeLog?.content ?? '')) {
          setPhoenixDependencyMissing(true)
          return
        }
      } catch {
        // 日志读取失败已有日志抽屉负责呈现；这里仅做非阻塞的依赖提示检测。
      }

      checksRemaining -= 1
      if (active && checksRemaining > 0) {
        nextCheckTimer = globalThis.setTimeout(
          () => void inspectEdgeLogs(),
          OBSERVABILITY_LOG_CHECK_INTERVAL_MS
        )
      }
    }

    void inspectEdgeLogs()
    return () => {
      active = false
      if (nextCheckTimer !== undefined) {
        globalThis.clearTimeout(nextCheckTimer)
      }
    }
  }, [phoenixDependencyMissing, runtimeApi, snapshot.edgeRunning, snapshot.phase])

  useEffect(() => {
    if (!runtimeApi || config.environmentPath.trim()) return
    let active = true
    void runtimeApi.getDefaultEnvironmentPath().then((environmentPath) => {
      if (!active || !environmentPath) return
      setConfig((current) => current.environmentPath.trim()
        ? current
        : { ...current, environmentPath })
    }).catch(() => {
      // 自动识别是非阻塞增强，失败时保留系统目录选择入口。
    })
    return () => {
      active = false
    }
  }, [config.environmentPath, runtimeApi])

  useEffect(() => {
    if (typeof globalThis.localStorage === 'undefined') return
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  }, [config])

  useEffect(() => {
    if (!open || typeof document === 'undefined') return
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      if (!dialogLogsOpen && !isTransitioning(snapshot)) setOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [dialogLogsOpen, open, snapshot])

  if (!runtimeApi) return null

  const simulatorValidation = validateSimulatorConfig(config)
  const edgeValidation = validateEdgeConfig(config)
  const transitioning = isTransitioning(snapshot)

  const closeDialog = (): void => {
    setDialogLogsOpen(false)
    setOpen(false)
  }

  /**
   * 打开受控系统路径选择器，并把结果写入对应的平面路径或自定义模板字段。
   *
   * @param kind 共享合同声明的路径类别。
   */
  const choosePath = async (kind: LocalRuntimePathKind): Promise<void> => {
    setLocalError(null)
    try {
      const path = await runtimeApi.selectPath(kind)
      if (!path) return
      setConfig((current) => {
        if (kind === 'edgeExecutable') {
          return {
            ...current,
            customEdgeCommand: {
              ...current.customEdgeCommand,
              executable: path
            }
          }
        }
        if (kind === 'edgeWorkingDirectory') {
          return {
            ...current,
            customEdgeCommand: {
              ...current.customEdgeCommand,
              workingDirectory: path
            }
          }
        }
        return {
          ...current,
          [pathField(kind)]: path
        }
      })
    } catch (error) {
      setLocalError(errorMessage(error))
    }
  }

  const startSimulator = async (): Promise<void> => {
    setSimulatorSubmitted(true)
    setLocalError(null)
    if (!simulatorValidation.valid) return
    try {
      setSnapshot(await runtimeApi.startSimulator(config))
    } catch (error) {
      setLocalError(errorMessage(error))
    }
  }

  const stopSimulator = async (): Promise<void> => {
    setLocalError(null)
    try {
      setSnapshot(await runtimeApi.stopSimulator())
    } catch (error) {
      setLocalError(errorMessage(error))
    }
  }

  const startEdge = async (): Promise<void> => {
    setEdgeSubmitted(true)
    setLocalError(null)
    if (!edgeValidation.valid) return
    try {
      setSnapshot(await runtimeApi.startEdge(config))
    } catch (error) {
      setLocalError(errorMessage(error))
    }
  }

  const stopEdge = async (): Promise<void> => {
    setLocalError(null)
    try {
      await onStopping?.()
      setSnapshot(await runtimeApi.stopEdge())
    } catch (error) {
      onReady?.()
      setLocalError(errorMessage(error))
    }
  }

  /**
   * 请求 Electron 主进程解析当前系统默认 Edge 计划，并显式复制为可编辑自定义参数。
   *
   * @returns 解析成功后更新配置；路径无效或旧 preload 不支持时保留用户输入并显示错误。
   */
  const loadGeneratedEdgeCommand = async (): Promise<void> => {
    setEdgeSubmitted(true)
    setLocalError(null)
    const generatedValidation = validateEdgeConfig({
      ...config,
      edgeCommandMode: 'generated'
    })
    if (!generatedValidation.valid) return
    if (!runtimeApi.resolveGeneratedEdgeCommand) {
      setLocalError('当前桌面端版本不支持解析系统默认 Edge 命令')
      return
    }
    setResolvingGeneratedEdgeCommand(true)
    try {
      const preview = await runtimeApi.resolveGeneratedEdgeCommand(config)
      setConfig((current) => ({
        ...current,
        edgeCommandMode: 'custom',
        customEdgeCommand: {
          executable: preview.executable,
          workingDirectory: preview.cwd,
          args: [...preview.args],
          environment: []
        }
      }))
    } catch (error) {
      setLocalError(errorMessage(error))
    } finally {
      setResolvingGeneratedEdgeCommand(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className={styles.launcherButton}
        data-runtime-phase={snapshot.phase}
        data-observability-degraded={phoenixDependencyMissing || undefined}
        onClick={() => setOpen(true)}
      >
        <span className={styles.launcherDot} aria-hidden="true" />
        {launcherLabel(snapshot)}
        {phoenixDependencyMissing ? ' · Trace 降级' : ''}
      </button>
      {open && typeof document !== 'undefined'
        ? createPortal(
            <LocalRuntimeDialog
              config={config}
              snapshot={snapshot}
              error={localError ?? snapshot.error ?? null}
              simulatorSubmitted={simulatorSubmitted}
              edgeSubmitted={edgeSubmitted}
              resolvingGeneratedEdgeCommand={resolvingGeneratedEdgeCommand}
              simulatorValidation={simulatorValidation}
              edgeValidation={edgeValidation}
              phoenixDependencyMissing={phoenixDependencyMissing}
              onChange={setConfig}
              onChoosePath={(kind) => void choosePath(kind)}
              onClose={closeDialog}
              onStartSimulator={() => void startSimulator()}
              onStopSimulator={() => void stopSimulator()}
              onStartEdge={() => void startEdge()}
              onStopEdge={() => void stopEdge()}
              onLoadGeneratedEdgeCommand={loadGeneratedEdgeCommand}
              transitioning={transitioning}
              logControl={(
                <LocalRuntimeLogLauncher
                  runtimeApi={runtimeApi}
                  variant="dialog"
                  onOpenChange={setDialogLogsOpen}
                />
              )}
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
  simulatorSubmitted: boolean
  edgeSubmitted: boolean
  resolvingGeneratedEdgeCommand: boolean
  simulatorValidation: ValidationResult
  edgeValidation: ValidationResult
  phoenixDependencyMissing?: boolean
  transitioning: boolean
  onChange: (config: LocalRuntimeLaunchConfig) => void
  onChoosePath: (kind: LocalRuntimePathKind) => void
  onClose: () => void
  onStartSimulator: () => void
  onStopSimulator: () => void
  onStartEdge: () => void
  onStopEdge: () => void
  onLoadGeneratedEdgeCommand: () => void
  logControl?: ReactNode
}

/**
 * 呈现本地调试配置与两个独立服务的权威进程状态。
 *
 * @param props 当前配置、进程快照、校验结果和受控启停回调。
 * @returns 可通过键盘操作的桌面端配置对话框。
 */
export function LocalRuntimeDialog({
  config,
  snapshot,
  error,
  simulatorSubmitted,
  edgeSubmitted,
  resolvingGeneratedEdgeCommand,
  simulatorValidation,
  edgeValidation,
  phoenixDependencyMissing = false,
  transitioning,
  onChange,
  onChoosePath,
  onClose,
  onStartSimulator,
  onStopSimulator,
  onStartEdge,
  onStopEdge,
  onLoadGeneratedEdgeCommand,
  logControl
}: LocalRuntimeDialogProps): React.JSX.Element {
  const simulatorTransitioning = isSimulatorTransitioning(snapshot)
  const edgeTransitioning = isEdgeTransitioning(snapshot)
  const simulatorActive = snapshot.simulatorRunning
  const edgeActive = snapshot.bridgeRunning || snapshot.edgeRunning
  const environmentDisabled = simulatorActive || edgeActive || transitioning
  const simulatorDisabled = simulatorActive
    || edgeActive
    || simulatorTransitioning
    || edgeTransitioning
  const edgeDisabled = edgeActive || edgeTransitioning
  const [runtimeAuxiliaryOpen, setRuntimeAuxiliaryOpen] = useState(
    () => simulatorActive
  )

  /**
   * 同步原生 details 的展开状态，使配置变化时不会意外重置用户选择。
   *
   * @param event PLC-Sim 可选配置区的原生 toggle 事件。
   */
  const toggleRuntimeAuxiliary = (
    event: SyntheticEvent<HTMLDetailsElement>
  ): void => {
    setRuntimeAuxiliaryOpen(event.currentTarget.open)
  }

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
            <h2 id="local-runtime-title">
              领域侧 Edge（以 sz_lab 为例）
            </h2>
            <p id="local-runtime-description">
              启动领域设备图、本地服务和 Edge 运行时。
            </p>
          </div>
          <div className={styles.headerActions}>
            {logControl}
            <button
              type="button"
              className={edgeActive
                ? styles.stopButton
                : styles.primaryButton}
              disabled={edgeTransitioning || simulatorTransitioning}
              onClick={edgeActive ? onStopEdge : onStartEdge}
            >
              {edgeControlLabel(snapshot, edgeActive)}
            </button>
            <button
              type="button"
              className={styles.closeButton}
              aria-label="关闭本地环境配置"
              disabled={transitioning}
              onClick={onClose}
            >
              ×
            </button>
          </div>
        </header>

        <div className={styles.body}>
          <section
            className={`${styles.serviceSection} ${styles.edgeServiceSection}`}
            aria-labelledby="local-runtime-title"
          >
            {phoenixDependencyMissing ? (
              <PhoenixDependencyRecoveryNotice
                osProjectPath={config.osProjectPath}
              />
            ) : null}

            <div className={styles.dependencyNotice} role="note">
              <strong>使用 PLC 时，请先上传变量表</strong>
              <span>
                先启动 PLC-Sim，在 PLC-Sim 中上传 PLC 变量表，确认完成后再启动领域侧 Edge。
              </span>
            </div>

            <div className={styles.fields}>
              <LocalRuntimeEdgeCommandEditor
                config={config}
                disabled={edgeDisabled}
                submitted={edgeSubmitted}
                executableError={edgeValidation.errors.customEdgeExecutable}
                workingDirectoryError={
                  edgeValidation.errors.customEdgeWorkingDirectory
                }
                environmentError={edgeValidation.errors.customEdgeEnvironment}
                loadingGeneratedCommand={resolvingGeneratedEdgeCommand}
                onChange={onChange}
                onChooseExecutable={() => onChoosePath('edgeExecutable')}
                onChooseWorkingDirectory={() => (
                  onChoosePath('edgeWorkingDirectory')
                )}
                onLoadGeneratedCommand={onLoadGeneratedEdgeCommand}
              />

              <details
                className={styles.runtimeAuxiliary}
                open={runtimeAuxiliaryOpen}
                onToggle={toggleRuntimeAuxiliary}
              >
                <summary>
                  <span>
                    <strong>PLC-Sim（可选）</strong>
                    <small>本地模拟服务 · Web 127.0.0.1:18765</small>
                  </span>
                  <small>{simulatorActive ? '运行中' : '按需设置'}</small>
                </summary>
                <div className={styles.runtimeAuxiliaryBody}>
                  <section
                    className={styles.runtimeAuxiliaryService}
                    aria-labelledby="local-plc-title"
                  >
                    <header className={styles.serviceHeader}>
                      <div>
                        <h3 id="local-plc-title">PLC-Sim 项目与服务</h3>
                        <p>
                          仅在需要模拟 PLC 时配置并启动；OPC UA 默认使用 4855。
                        </p>
                      </div>
                      <button
                        type="button"
                        className={simulatorActive
                          ? styles.stopButton
                          : styles.primaryButton}
                        disabled={simulatorTransitioning
                          || edgeActive
                          || edgeTransitioning}
                        onClick={simulatorActive
                          ? onStopSimulator
                          : onStartSimulator}
                      >
                        {simulatorControlLabel(snapshot, simulatorActive)}
                      </button>
                    </header>
                    <PathField
                      id="runtime-simulator-path"
                      label="PLC-Sim 项目根目录"
                      value={config.simulatorProjectPath}
                      placeholder="选择包含 OpcUaSim 的 PLC-Sim 项目根目录"
                      buttonLabel="选择目录"
                      disabled={simulatorDisabled}
                      invalid={simulatorSubmitted
                        && Boolean(
                          simulatorValidation.errors.simulatorProjectPath
                        )}
                      error={simulatorSubmitted
                        ? simulatorValidation.errors.simulatorProjectPath
                        : undefined}
                      editable
                      onValueChange={(simulatorProjectPath) => onChange({
                        ...config,
                        simulatorProjectPath
                      })}
                      onChoose={() => onChoosePath('simulator')}
                    />
                  </section>
                </div>
              </details>

              <PathField
                id="runtime-environment-path"
                label="unilab Conda 环境目录"
                value={config.environmentPath}
                placeholder="自动识别，或选择 Conda 环境目录"
                buttonLabel="选择目录"
                disabled={environmentDisabled}
                invalid={Boolean(
                  (simulatorSubmitted
                    && simulatorValidation.errors.environmentPath)
                  || (edgeSubmitted
                    && edgeValidation.errors.environmentPath)
                )}
                error={simulatorSubmitted
                  ? simulatorValidation.errors.environmentPath
                  : edgeSubmitted
                    ? edgeValidation.errors.environmentPath
                    : undefined}
                onChoose={() => onChoosePath('environment')}
              />

              <PathField
                id="runtime-os-path"
                label="Uni-Lab-OS 项目根目录"
                value={config.osProjectPath}
                placeholder="选择 Uni-Lab-OS 项目根目录"
                buttonLabel="选择目录"
                disabled={edgeDisabled}
                invalid={edgeSubmitted
                  && Boolean(edgeValidation.errors.osProjectPath)}
                error={edgeSubmitted
                  ? edgeValidation.errors.osProjectPath
                  : undefined}
                editable
                onValueChange={(osProjectPath) => onChange({
                  ...config,
                  osProjectPath
                })}
                onChoose={() => onChoosePath('os')}
              />

              <div className={styles.domainProjectField}>
                <PathField
                  id="runtime-szlab-path"
                  label={config.edgeCommandMode === 'custom'
                    ? '领域项目根目录（自定义模式必填）'
                    : '领域项目根目录（可选，以 Uni-Lab-SZLab 为例）'}
                  value={config.szlabProjectPath}
                  placeholder="可留空，或选择领域项目根目录"
                  buttonLabel="选择目录"
                  disabled={edgeDisabled}
                  invalid={edgeSubmitted
                    && Boolean(edgeValidation.errors.szlabProjectPath)}
                  error={edgeSubmitted
                    ? edgeValidation.errors.szlabProjectPath
                    : undefined}
                  editable
                  onValueChange={(szlabProjectPath) => onChange({
                    ...config,
                    szlabProjectPath
                  })}
                  onChoose={() => onChoosePath('szlab')}
                />
                <p className={styles.fieldHint}>
                  {config.edgeCommandMode === 'custom'
                    ? '用于校验领域设备动作是否完整上报；自定义模板仍需自行挂载该目录。'
                    : '留空时仅加载 Uni-Lab-OS 内置设备能力；填写后同时校验领域设备动作上报。'}
                </p>
              </div>

              <PathField
                id="runtime-graph-path"
                label="领域设备图 JSON（可选，以 sz_lab 为例）"
                value={config.graphPath}
                placeholder="可留空，或选择设备图 JSON"
                buttonLabel="选择文件"
                disabled={edgeDisabled}
                invalid={edgeSubmitted
                  && Boolean(edgeValidation.errors.graphPath)}
                error={edgeSubmitted
                  ? edgeValidation.errors.graphPath
                  : undefined}
                onChoose={() => onChoosePath('graph')}
              />
              <p className={styles.fieldHint}>
                留空时以无仪器设备模式启动；后续配置设备包和设备图后可重新启动并刷新。
              </p>
            </div>
          </section>

        </div>

        <div className={styles.statusDock}>
          <RuntimeStatus snapshot={snapshot} />
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
          <footer className={styles.footer}>
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={transitioning}
              onClick={onClose}
            >
              关闭
            </button>
          </footer>
        </div>
      </section>
    </div>
  )
}

function PhoenixDependencyRecoveryNotice({
  osProjectPath
}: {
  osProjectPath: string
}): React.JSX.Element {
  const titleId = useId()
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const commands = phoenixRecoveryCommands(osProjectPath)

  const copyCommands = async (): Promise<void> => {
    try {
      await globalThis.navigator.clipboard.writeText(commands)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }

  return (
    <section
      className={styles.observabilityNotice}
      role="status"
      aria-labelledby={titleId}
    >
      <div className={styles.observabilityNoticeHeader}>
        <div>
          <strong id={titleId}>链路追踪（Trace）功能已降级</strong>
          <p>
            设备与业务运行不受影响；Phoenix 未安装，OTLP Trace 上报会持续返回 503。
          </p>
        </div>
        <span>不影响业务</span>
      </div>
      <p>
        在本机当前 Edge 使用的 Conda 环境中执行以下命令。若环境名不是
        <code>unilab</code>，请替换第二行。
      </p>
      <div className={styles.recoveryCommand}>
        <pre aria-label="Phoenix 依赖修复命令"><code>{commands}</code></pre>
        <button type="button" onClick={() => void copyCommands()}>
          {copyState === 'copied' ? '已复制' : '复制命令'}
        </button>
      </div>
      <small className={styles.dependencySummary}>
        将安装 arize-phoenix==17.5.0、arize-phoenix-otel==0.16.1，并提供
        <code>phoenix</code>命令。
      </small>
      <p>
        安装完成后，在桌面端停止并重新启动 Edge。每台机器都需要在各自实际使用的
        Conda 环境中安装一次。
      </p>
      <span className={styles.copyFeedback} aria-live="polite">
        {copyState === 'failed' ? '复制失败，请手动选择命令。' : ''}
      </span>
    </section>
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
  editable = false,
  onValueChange,
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
  editable?: boolean
  onValueChange?: (value: string) => void
  onChoose: () => void
}): React.JSX.Element {
  const errorId = `${id}-error`
  const labelId = `${id}-label`
  const valueId = `${id}-value`
  const actionId = `${id}-action`
  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel} id={labelId} htmlFor={id}>
        {label}
      </label>
      {editable ? (
        <div
          className={styles.pathEditor}
          data-disabled={disabled || undefined}
          data-invalid={invalid || undefined}
        >
          <input
            id={id}
            type="text"
            className={styles.pathInput}
            value={value}
            placeholder={placeholder}
            disabled={disabled}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? errorId : undefined}
            autoFocus={autoFocus}
            spellCheck={false}
            title={value || undefined}
            onChange={(event) => onValueChange?.(event.target.value)}
          />
          <button
            type="button"
            className={styles.pathBrowse}
            disabled={disabled}
            aria-label={`${label}：${buttonLabel}`}
            onClick={onChoose}
          >
            {buttonLabel}
          </button>
        </div>
      ) : (
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
      )}
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
          label="PLC-Sim"
          port="18765"
          status={simulatorRuntimeStatus(snapshot)}
        />
        <ProcessState
          label="领域侧 Edge"
          port="HTTP 18003"
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

type LocalRuntimeValidationField = keyof LocalRuntimeLaunchConfig
  | 'customEdgeExecutable'
  | 'customEdgeWorkingDirectory'
  | 'customEdgeEnvironment'

interface ValidationResult {
  valid: boolean
  errors: Partial<Record<LocalRuntimeValidationField, string>>
}

export function validateSimulatorConfig(
  config: LocalRuntimeLaunchConfig
): ValidationResult {
  const errors: ValidationResult['errors'] = {}
  if (!config.environmentPath.trim()) {
    errors.environmentPath = '请选择 unilab Conda 环境目录'
  }
  if (!config.simulatorProjectPath.trim()) {
    errors.simulatorProjectPath = '请选择 PLC-Sim 项目根目录'
  }
  return { valid: Object.keys(errors).length === 0, errors }
}

/**
 * 校验领域侧 Edge 启动所需路径与自定义命令的最小 renderer 输入。
 *
 * @param config 当前本地运行配置。
 * @returns 各字段可直接展示的错误集合；主进程仍会执行权威文件与模板校验。
 * @throws 不抛出异常；所有 renderer 输入问题都返回为字段错误。
 * @safety 只检查字符串输入，不访问文件系统或启动子进程。
 */
export function validateEdgeConfig(
  config: LocalRuntimeLaunchConfig
): ValidationResult {
  const errors: ValidationResult['errors'] = {}
  if (!config.osProjectPath.trim()) {
    errors.osProjectPath = '请选择 Uni-Lab-OS 项目根目录'
  }
  if (!config.environmentPath.trim()) {
    errors.environmentPath = '请选择 unilab Conda 环境目录'
  }
  if (config.edgeCommandMode === 'custom') {
    if (!config.szlabProjectPath.trim()) {
      errors.szlabProjectPath = '自定义命令仅适用于已挂载领域设备包'
    }
    if (!config.customEdgeCommand.executable.trim()) {
      errors.customEdgeExecutable = '请输入或选择 Edge 自定义可执行文件'
    }
    if (!config.customEdgeCommand.workingDirectory.trim()) {
      errors.customEdgeWorkingDirectory = '请输入或选择 Edge 自定义工作目录'
    }
    const environmentError = validateCustomEdgeEnvironment(
      config.customEdgeCommand.environment
    )
    if (environmentError) errors.customEdgeEnvironment = environmentError
  }
  return { valid: Object.keys(errors).length === 0, errors }
}

/**
 * 对环境变量编辑结果执行即时格式校验，主进程仍负责重复名和权威边界的最终判断。
 *
 * @param environment 用户逐行编辑后形成的环境变量名称和值。
 * @returns 首个可行动错误；输入满足 renderer 约束时返回 undefined。
 */
function validateCustomEdgeEnvironment(
  environment: LocalRuntimeLaunchConfig['customEdgeCommand']['environment']
): string | undefined {
  const seenNames = new Set<string>()
  for (const entry of environment) {
    const name = entry.name.trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      return `环境变量 ${name || '<空名称>'} 的名称格式无效`
    }
    const normalizedName = name.toUpperCase()
    if (seenNames.has(normalizedName)) return `环境变量 ${name} 重复`
    seenNames.add(normalizedName)
    if (isLauncherManagedEnvironmentName(normalizedName)) {
      return `环境变量 ${name} 由 Edge 启动器托管，不能覆盖`
    }
    if (/(?:^|_)(?:AUTH|COOKIE|KEY|PASS|PASSWORD|SECRET|TOKEN)(?:_|$)/i.test(name)) {
      return `环境变量 ${name} 可能包含敏感信息，不能保存在本地启动配置中`
    }
  }
  return undefined
}

/**
 * 判断一个大写环境变量名是否属于启动器托管的 Conda、端口或运行事实。
 *
 * @param normalizedName 已转换为大写的环境变量名称。
 * @returns 用户覆盖会破坏启动器权威边界时返回 true。
 */
function isLauncherManagedEnvironmentName(normalizedName: string): boolean {
  return normalizedName === 'PATH'
    || normalizedName === 'PYTHONPATH'
    || normalizedName === 'PYTHONUNBUFFERED'
    || normalizedName === 'ROS_DOMAIN_ID'
    || normalizedName === 'UNILABOS_RUNTIME_DB'
    || normalizedName === 'UNILABOS_HOSTLINKCONFIG_PORT'
    || normalizedName.startsWith('CONDA_')
    || normalizedName.startsWith('UNILABOS_OBSERVABILITYCONFIG_')
}

function launcherLabel(snapshot: LocalRuntimeSnapshot): string {
  if (snapshot.phase === 'ready') return '本地调试已启动'
  if (snapshot.phase === 'simulator_ready') return 'PLC-Sim 已启动'
  if (snapshot.phase === 'failed') return '本地调试启动失败'
  if (isTransitioning(snapshot)) return '本地服务处理中'
  return '启动本地环境'
}

function isTransitioning(snapshot: LocalRuntimeSnapshot): boolean {
  return [
    'validating_simulator',
    'starting_simulator',
    'waiting_simulator',
    'validating_edge',
    'starting_bridge',
    'waiting_bridge',
    'starting_edge',
    'waiting_edge',
    'stopping_simulator',
    'stopping_edge'
  ].includes(snapshot.phase)
}

function isSimulatorTransitioning(snapshot: LocalRuntimeSnapshot): boolean {
  return [
    'validating_simulator',
    'starting_simulator',
    'waiting_simulator',
    'stopping_simulator'
  ].includes(snapshot.phase)
}

function isEdgeTransitioning(snapshot: LocalRuntimeSnapshot): boolean {
  return [
    'validating_edge',
    'starting_bridge',
    'waiting_bridge',
    'starting_edge',
    'waiting_edge',
    'stopping_edge'
  ].includes(snapshot.phase)
}

/**
 * 将普通路径类别映射到平面配置字段；嵌套的自定义模板路径由调用方单独处理。
 *
 * @param kind 除自定义可执行文件之外的受控路径类别。
 * @returns 对应的本地运行配置字段名。
 */
function pathField(
  kind: Exclude<
    LocalRuntimePathKind,
    'edgeExecutable' | 'edgeWorkingDirectory'
  >
): keyof LocalRuntimeLaunchConfig {
  if (kind === 'graph') return 'graphPath'
  if (kind === 'os') return 'osProjectPath'
  if (kind === 'szlab') return 'szlabProjectPath'
  if (kind === 'environment') return 'environmentPath'
  return 'simulatorProjectPath'
}

/**
 * 读取 renderer 本地偏好并把 v1/v2 路径配置迁移为默认生成式 Edge 启动模式。
 *
 * @returns 完整 v3 配置；存储缺失或损坏时返回安全默认值。
 */
function readStoredConfig(): LocalRuntimeLaunchConfig {
  if (typeof globalThis.localStorage === 'undefined') {
    return normalizeStoredLocalRuntimeConfig(null)
  }
  try {
    const storedValue = globalThis.localStorage.getItem(STORAGE_KEY)
      ?? LEGACY_STORAGE_KEYS
        .map((key) => globalThis.localStorage.getItem(key))
        .find((value) => value !== null)
    return normalizeStoredLocalRuntimeConfig(JSON.parse(storedValue ?? 'null'))
  } catch {
    return normalizeStoredLocalRuntimeConfig(null)
  }
}

/**
 * 将未知 localStorage 值归一化为 v3 配置；旧版本没有命令字段时保持系统默认启动。
 *
 * @param value JSON 解析后的未知本地偏好。
 * @returns 字段逐项收窄且嵌套对象独立复制的完整配置。
 */
export function normalizeStoredLocalRuntimeConfig(
  value: unknown
): LocalRuntimeLaunchConfig {
  if (!value || typeof value !== 'object') {
    return {
      ...EMPTY_CONFIG,
      customEdgeCommand: { ...EMPTY_CONFIG.customEdgeCommand }
    }
  }
  const parsed = value as Partial<LocalRuntimeLaunchConfig>
  const customEdgeCommand = parsed.customEdgeCommand
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
    edgeCommandMode: parsed.edgeCommandMode === 'custom'
      ? 'custom'
      : 'generated',
    customEdgeCommand: {
      executable: typeof customEdgeCommand?.executable === 'string'
        ? customEdgeCommand.executable
        : '',
      workingDirectory: typeof customEdgeCommand?.workingDirectory === 'string'
        ? customEdgeCommand.workingDirectory
        : parsed.edgeCommandMode === 'custom'
          ? '{{workspace}}'
          : '',
      args: Array.isArray(customEdgeCommand?.args)
        ? customEdgeCommand.args.filter(
            (argument): argument is string => typeof argument === 'string'
          )
        : [],
      environment: Array.isArray(customEdgeCommand?.environment)
        ? customEdgeCommand.environment.flatMap((entry) => (
            entry
            && typeof entry === 'object'
            && typeof entry.name === 'string'
            && typeof entry.value === 'string'
              ? [{ name: entry.name, value: entry.value }]
              : []
          ))
        : []
    }
  }
}

function simulatorRuntimeStatus(
  snapshot: LocalRuntimeSnapshot
): ProcessDisplayStatus {
  if (snapshot.failedProcess === 'simulator') return 'failed'
  if (snapshot.phase === 'stopping_simulator' && snapshot.simulatorRunning) {
    return 'stopping'
  }
  if (
    snapshot.phase === 'validating_simulator'
    || snapshot.phase === 'starting_simulator'
    || snapshot.phase === 'waiting_simulator'
  ) {
    return 'starting'
  }
  if (snapshot.simulatorRunning) return 'running'
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
    snapshot.phase === 'stopping_edge'
    && (snapshot.bridgeRunning || snapshot.edgeRunning)
  ) {
    return 'stopping'
  }
  if (snapshot.phase === 'ready' && snapshot.edgeRunning) {
    return 'running'
  }
  if (
    snapshot.phase === 'starting_bridge'
    || snapshot.phase === 'validating_edge'
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

function simulatorControlLabel(
  snapshot: LocalRuntimeSnapshot,
  active: boolean
): string {
  if (snapshot.phase === 'stopping_simulator') return '正在停止…'
  if (isSimulatorTransitioning(snapshot)) return '正在启动…'
  return active ? '停止 PLC' : '启动 PLC'
}

function edgeControlLabel(
  snapshot: LocalRuntimeSnapshot,
  active: boolean
): string {
  if (snapshot.phase === 'stopping_edge') return '正在停止…'
  if (isEdgeTransitioning(snapshot)) return '正在启动…'
  return active ? '停止 Edge' : '启动 Edge'
}

function processStatusLabel(status: ProcessDisplayStatus): string {
  if (status === 'running') return '运行中'
  if (status === 'starting') return '启动中'
  if (status === 'stopping') return '停止中'
  if (status === 'failed') return '异常'
  if (status === 'disabled') return '未启用'
  return '未启动'
}

function phoenixRecoveryCommands(osProjectPath: string): string {
  const projectPath = osProjectPath.trim() || '/path/to/Uni-Lab-OS'
  return [
    `cd ${shellQuote(projectPath)}`,
    'conda activate unilab',
    "pip install -e '.[observability]'"
  ].join('\n')
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}
