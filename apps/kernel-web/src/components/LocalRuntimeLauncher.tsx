import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import type {
  DesktopRuntimeApi,
  LocalRuntimeLaunchConfig,
  LocalRuntimeModeInfo,
  LocalRuntimePathKind,
  LocalRuntimeSnapshot
} from '../types/electron'

import { LocalRuntimeDialog } from './LocalRuntimeConfigurationDialog'
import {
  detectPhoenixObservabilityDependencyIssue,
  LocalRuntimeLogDrawer
} from './LocalRuntimeLogDrawer'
import { LocalRuntimeLogLauncher } from './LocalRuntimeLogLauncher'
import styles from './LocalRuntimeLauncher.module.scss'
import {
  DEVELOPMENT_RUNTIME_INFO,
  devicePackageTrustPrompt,
  IDLE_LOCAL_RUNTIME_SNAPSHOT,
  isLocalRuntimeTransitioning,
  localRuntimeLauncherLabel,
  localRuntimePathField,
  mergeDefaultLocalRuntimeLaunchConfig,
  readStoredLocalRuntimeConfig,
  storeLocalRuntimeConfig,
  validateEdgeConfig,
  validateSimulatorConfig
} from './localRuntimeLauncherModel'
import {
  desktopRuntimeApi,
  localRuntimeErrorMessage as errorMessage,
  useDeviceCardSurfaceOcclusion
} from './localRuntimeUiSupport'

export { LocalRuntimeDialog } from './LocalRuntimeConfigurationDialog'
export {
  normalizeStoredLocalRuntimeConfig,
  validateEdgeConfig,
  validateSimulatorConfig
} from './localRuntimeLauncherModel'
export {
  detectPhoenixObservabilityDependencyIssue,
  LocalRuntimeLogDrawer
} from './LocalRuntimeLogDrawer'
export { LocalRuntimeLogLauncher } from './LocalRuntimeLogLauncher'

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
  const [config, setConfig] = useState(readStoredLocalRuntimeConfig)
  const [snapshot, setSnapshot] = useState(IDLE_LOCAL_RUNTIME_SNAPSHOT)
  const [runtimeInfo, setRuntimeInfo] = useState<LocalRuntimeModeInfo>(
    DEVELOPMENT_RUNTIME_INFO
  )
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
    void runtimeApi.getModeInfo().then((nextInfo) => {
      if (!active) return
      setRuntimeInfo(nextInfo)
      if (nextInfo.defaultLaunchConfig) {
        setConfig((current) => mergeDefaultLocalRuntimeLaunchConfig(
          current,
          nextInfo.defaultLaunchConfig!
        ))
      }
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

    /** 轮询 Edge 日志，直到发现 Phoenix 依赖问题或达到检查上限。 */
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
    if (
      !runtimeApi
      || runtimeInfo.mode === 'managed'
      || config.environmentPath.trim()
    ) return
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
  }, [config.environmentPath, runtimeApi, runtimeInfo.mode])

  useEffect(() => {
    storeLocalRuntimeConfig(config)
  }, [config])

  useEffect(() => {
    if (!open || typeof document === 'undefined') return
    /** 在日志抽屉关闭且进程稳定时允许 Escape 关闭配置对话框。 */
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      if (!dialogLogsOpen && !isLocalRuntimeTransitioning(snapshot)) {
        setOpen(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [dialogLogsOpen, open, snapshot])

  if (!runtimeApi) return null

  const simulatorValidation = validateSimulatorConfig(config, runtimeInfo.mode)
  const edgeValidation = validateEdgeConfig(config, runtimeInfo.mode)
  const transitioning = isLocalRuntimeTransitioning(snapshot)

  /** 关闭日志子层并关闭本地运行配置对话框。 */
  const closeDialog = (): void => {
    setDialogLogsOpen(false)
    setOpen(false)
  }

  /**
   * 打开受控系统路径选择器，并写入对应配置字段。
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
        return { ...current, [localRuntimePathField(kind)]: path }
      })
    } catch (error) {
      setLocalError(errorMessage(error))
    }
  }

  /** 校验配置并启动 PLC-Sim。 */
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

  /** 停止 PLC-Sim 并同步最新进程快照。 */
  const stopSimulator = async (): Promise<void> => {
    setLocalError(null)
    try {
      setSnapshot(await runtimeApi.stopSimulator())
    } catch (error) {
      setLocalError(errorMessage(error))
    }
  }

  /** 校验配置并启动领域侧 Edge。 */
  const startEdge = async (): Promise<void> => {
    setEdgeSubmitted(true)
    setLocalError(null)
    if (!edgeValidation.valid) return
    try {
      if (config.szlabProjectPath.trim()) {
        const trust = await runtimeApi.inspectDevicePackage(config)
        if (trust.confirmationRequired) {
          const confirmed = globalThis.confirm(devicePackageTrustPrompt(trust))
          if (!confirmed) return
          await runtimeApi.confirmDevicePackage(config, trust.contentHash)
        }
      }
      setSnapshot(await runtimeApi.startEdge(config))
    } catch (error) {
      setLocalError(errorMessage(error))
    }
  }

  /** 运行设备包启动验收，并接收主进程完成清理后的最终状态。 */
  const runAcceptance = async (): Promise<void> => {
    setLocalError(null)
    try {
      setSnapshot(await runtimeApi.runAcceptance(config))
    } catch (error) {
      setLocalError(errorMessage(error))
    }
  }

  /** 通知上层连接停用后停止领域侧 Edge。 */
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

  /** 请求主进程把系统默认 Edge 计划复制为可编辑自定义参数。 */
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
        {localRuntimeLauncherLabel(snapshot)}
        {phoenixDependencyMissing ? ' · Trace 降级' : ''}
      </button>
      {open && typeof document !== 'undefined'
        ? createPortal(
            <LocalRuntimeDialog
              config={config}
              runtimeInfo={runtimeInfo}
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
              onRunAcceptance={() => void runAcceptance()}
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
