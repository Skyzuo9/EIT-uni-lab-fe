import {
  useId,
  useState,
  type ReactNode,
  type SyntheticEvent
} from 'react'

import type {
  LocalRuntimeLaunchConfig,
  LocalRuntimeModeInfo,
  LocalRuntimePathKind,
  LocalRuntimeSnapshot
} from '../types/electron'

import LocalRuntimeEdgeCommandEditor from './LocalRuntimeEdgeCommandEditor'
import styles from './LocalRuntimeLauncher.module.scss'

type LocalRuntimeValidationField = keyof LocalRuntimeLaunchConfig
  | 'customEdgeExecutable'
  | 'customEdgeWorkingDirectory'
  | 'customEdgeEnvironment'

interface ValidationResult {
  valid: boolean
  errors: Partial<Record<LocalRuntimeValidationField, string>>
}

interface LocalRuntimeDialogProps {
  config: LocalRuntimeLaunchConfig
  runtimeInfo: LocalRuntimeModeInfo
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
  onRunAcceptance: () => void
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
  runtimeInfo,
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
  onRunAcceptance,
  onLoadGeneratedEdgeCommand,
  logControl
}: LocalRuntimeDialogProps): React.JSX.Element {
  const simulatorTransitioning = isSimulatorTransitioning(snapshot)
  const edgeTransitioning = isEdgeTransitioning(snapshot)
  const simulatorActive = snapshot.simulatorRunning
  const edgeActive = snapshot.bridgeRunning || snapshot.edgeRunning
  const environmentDisabled = simulatorActive || edgeActive || transitioning
  const simulatorDisabled = simulatorActive
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
          {runtimeInfo.mode === 'managed' ? (
            <div className={styles.dependencyNotice} role="note">
              <strong>{runtimeInfo.label}</strong>
              <span>
                {runtimeInfo.runtimeVersion
                  ? `Uni-Lab Runtime ${runtimeInfo.runtimeVersion}，由桌面端校验和维护。`
                  : '随安装包提供，由桌面端校验和维护。'}
              </span>
            </div>
          ) : null}

          <div className={styles.dependencyNotice} role="note">
            <strong>设备包由你决定是否运行</strong>
            <span>
              首次使用或内容变化时会显示签名状态与 SHA-256；未签名或签名无效也可在确认后启动，并写入本机审计记录。
            </span>
          </div>

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
              {runtimeInfo.mode === 'development' ? (
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
              ) : null}

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
                      label={runtimeInfo.mode === 'managed'
                        ? 'PLC-Sim 源码目录或已安装可执行文件'
                        : 'PLC-Sim 项目根目录'}
                      value={config.simulatorProjectPath}
                      placeholder="选择包含 OpcUaSim 的 PLC-Sim 项目根目录"
                      buttonLabel={runtimeInfo.mode === 'managed'
                        ? '选择路径'
                        : '选择目录'}
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

              {runtimeInfo.mode === 'development' ? (
                <>
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
                </>
              ) : null}

              <div className={styles.domainProjectField}>
                <PathField
                  id="runtime-szlab-path"
                  label={runtimeInfo.mode === 'managed'
                    ? '领域项目根目录（以 Uni-Lab-SZLab 为例）'
                    : config.edgeCommandMode === 'custom'
                      ? '领域项目根目录（自定义模式必填）'
                      : '领域项目根目录（可选，以 Uni-Lab-SZLab 为例）'}
                  value={config.szlabProjectPath}
                  placeholder={runtimeInfo.mode === 'managed'
                    ? '选择领域项目根目录'
                    : '可留空，或选择领域项目根目录'}
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
                  {runtimeInfo.mode === 'managed'
                    ? '设备包在首次启动或内容变化时需要你确认，运行数据与源码隔离。'
                    : config.edgeCommandMode === 'custom'
                    ? '用于校验领域设备动作是否完整上报；自定义模板仍需自行挂载该目录。'
                    : '留空时仅加载 Uni-Lab-OS 内置设备能力；填写后同时校验领域设备动作上报。'}
                </p>
              </div>

              <PathField
                id="runtime-graph-path"
                label={runtimeInfo.mode === 'managed'
                  ? '领域设备图 JSON（以 sz_lab 为例）'
                  : '领域设备图 JSON（可选，以 sz_lab 为例）'}
                value={config.graphPath}
                placeholder={runtimeInfo.mode === 'managed'
                  ? '选择领域设备图 JSON'
                  : '可留空，或选择设备图 JSON'}
                buttonLabel="选择文件"
                disabled={edgeDisabled}
                invalid={edgeSubmitted
                  && Boolean(edgeValidation.errors.graphPath)}
                error={edgeSubmitted
                  ? edgeValidation.errors.graphPath
                  : undefined}
                onChoose={() => onChoosePath('graph')}
              />
              {runtimeInfo.mode === 'development' ? (
                <p className={styles.fieldHint}>
                  留空时以无仪器设备模式启动；后续配置设备包和设备图后可重新启动并刷新。
                </p>
              ) : null}
            </div>
          </section>

          <RuntimeStatus snapshot={snapshot} />

          <div
            className={styles.acceptancePanel}
            data-status={snapshot.acceptance?.status ?? 'unverified'}
          >
            <div>
              <strong>
                设备包验收：{acceptanceStatusLabel(
                  snapshot.acceptance?.status ?? 'unverified'
                )}
              </strong>
              <span>
                {snapshot.acceptance?.message
                  ?? '启动 Edge 后可手动运行；结束后默认停止本次进程。'}
              </span>
            </div>
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={!edgeActive || transitioning}
              onClick={onRunAcceptance}
            >
              运行验收（完成后清理）
            </button>
          </div>

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
            disabled={transitioning}
            onClick={onClose}
          >
            关闭
          </button>
        </footer>
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

/** 把设备包验收状态转为界面可读标签。 */
function acceptanceStatusLabel(
  status: 'unverified' | 'verified' | 'failed'
): string {
  if (status === 'verified') return '已验证'
  if (status === 'failed') return '失败'
  return '未验证'
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
