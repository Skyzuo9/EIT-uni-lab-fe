import {
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
import {
  PathField,
  PhoenixDependencyRecoveryNotice,
  RuntimeStatus
} from './LocalRuntimeDialogParts'
import styles from './LocalRuntimeLauncher.module.scss'
import {
  edgeControlLabel,
  isEdgeTransitioning,
  isSimulatorTransitioning,
  simulatorControlLabel,
  type LocalRuntimeValidationResult
} from './localRuntimeLauncherModel'

interface LocalRuntimeDialogProps {
  config: LocalRuntimeLaunchConfig
  runtimeInfo: LocalRuntimeModeInfo
  snapshot: LocalRuntimeSnapshot
  error: string | null
  simulatorSubmitted: boolean
  edgeSubmitted: boolean
  resolvingGeneratedEdgeCommand: boolean
  simulatorValidation: LocalRuntimeValidationResult
  edgeValidation: LocalRuntimeValidationResult
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

/** 把设备包验收状态转为界面可读标签。 */
function acceptanceStatusLabel(
  status: 'unverified' | 'verified' | 'failed'
): string {
  if (status === 'verified') return '已验证'
  if (status === 'failed') return '失败'
  return '未验证'
}
