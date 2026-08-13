import { useId, useState } from 'react'

import type { LocalRuntimeSnapshot } from '../types/electron'

import styles from './LocalRuntimeLauncher.module.scss'
import {
  edgeRuntimeStatus,
  phoenixRecoveryCommands,
  processStatusLabel,
  simulatorRuntimeStatus,
  type ProcessDisplayStatus
} from './localRuntimeLauncherModel'

/** 呈现 Phoenix 可观测依赖缺失时的非阻塞恢复提示。 */
export function PhoenixDependencyRecoveryNotice({
  osProjectPath
}: {
  osProjectPath: string
}): React.JSX.Element {
  const titleId = useId()
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const commands = phoenixRecoveryCommands(osProjectPath)

  /** 将修复命令复制到系统剪贴板，并把失败留在本地提示中。 */
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

interface PathFieldProps {
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
}

/** 呈现只读路径选择器或允许手工输入的路径编辑器。 */
export function PathField({
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
}: PathFieldProps): React.JSX.Element {
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

/** 呈现 PLC-Sim 与领域侧 Edge 的独立进程状态。 */
export function RuntimeStatus({
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

/** 呈现一个进程的名称、端口和展示状态。 */
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
