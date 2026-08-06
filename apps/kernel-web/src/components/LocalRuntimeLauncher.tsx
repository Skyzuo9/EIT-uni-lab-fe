import {
  useEffect,
  useRef,
  useState
} from 'react'
import { createPortal } from 'react-dom'

import type {
  DesktopRuntimeApi,
  LocalRuntimeLaunchConfig,
  LocalRuntimeMode,
  LocalRuntimeModeInfo,
  LocalRuntimePathKind,
  LocalRuntimeSnapshot
} from '../types/electron'

import {
  detectPhoenixObservabilityDependencyIssue,
  LocalRuntimeLogDrawer
} from './LocalRuntimeLogDrawer'
import { LocalRuntimeLogLauncher } from './LocalRuntimeLogLauncher'
import { LocalRuntimeDialog } from './LocalRuntimeConfigurationDialog'
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
export { LocalRuntimeDialog } from './LocalRuntimeConfigurationDialog'

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
const DEVELOPMENT_RUNTIME_INFO: LocalRuntimeModeInfo = {
  mode: 'development',
  label: '开发环境 Runtime',
  runtimeVersion: null
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
  const [runtimeInfo, setRuntimeInfo] = useState(DEVELOPMENT_RUNTIME_INFO)
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
        setConfig((current) => mergeDefaultLaunchConfig(
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

  const simulatorValidation = validateSimulatorConfig(config, runtimeInfo.mode)
  const edgeValidation = validateEdgeConfig(config, runtimeInfo.mode)
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


type LocalRuntimeValidationField = keyof LocalRuntimeLaunchConfig
  | 'customEdgeExecutable'
  | 'customEdgeWorkingDirectory'
  | 'customEdgeEnvironment'

interface ValidationResult {
  valid: boolean
  errors: Partial<Record<LocalRuntimeValidationField, string>>
}

export function validateSimulatorConfig(
  config: LocalRuntimeLaunchConfig,
  mode: LocalRuntimeMode = 'development'
): ValidationResult {
  const errors: ValidationResult['errors'] = {}
  if (mode === 'development' && !config.environmentPath.trim()) {
    errors.environmentPath = '请选择 unilab Conda 环境目录'
  }
  if (!config.simulatorProjectPath.trim()) {
    errors.simulatorProjectPath = mode === 'managed'
      ? '请选择 PLC-Sim 源码目录或已安装可执行文件'
      : '请选择 PLC-Sim 项目根目录'
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
  config: LocalRuntimeLaunchConfig,
  mode: LocalRuntimeMode = 'development'
): ValidationResult {
  const errors: ValidationResult['errors'] = {}
  if (mode === 'managed' && !config.graphPath.trim()) {
    errors.graphPath = '请选择设备图 JSON'
  }
  if (mode === 'managed' && !config.szlabProjectPath.trim()) {
    errors.szlabProjectPath = '请选择领域项目根目录'
  }
  if (mode === 'development' && !config.osProjectPath.trim()) {
    errors.osProjectPath = '请选择 Uni-Lab-OS 项目根目录'
  }
  if (mode === 'development' && !config.environmentPath.trim()) {
    errors.environmentPath = '请选择 unilab Conda 环境目录'
  }
  if (mode === 'development' && config.edgeCommandMode === 'custom') {
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
    'validating_acceptance',
    'cleaning_acceptance',
    'stopping_simulator',
    'stopping_edge'
  ].includes(snapshot.phase)
}


/** 生成首次或内容变化后的设备包本机信任确认文本。 */
function devicePackageTrustPrompt(trust: {
  contentHash: string
  signatureStatus: 'valid' | 'invalid' | 'unsigned'
  signerFingerprint: string | null
}): string {
  const signature = trust.signatureStatus === 'valid'
    ? `签名有效，签名者指纹 ${trust.signerFingerprint ?? '未知'}`
    : trust.signatureStatus === 'invalid'
      ? '签名无效'
      : '未签名'
  return [
    `设备包${signature}。`,
    `SHA-256：${trust.contentHash}`,
    '是否确认本次内容并启动？该决定会写入本机审计记录。'
  ].join('\n')
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

/**
 * 仅用安装包默认值补全尚未选择的路径，保留用户已有命令与偏好。
 *
 * @param current 当前持久化配置。
 * @param defaults 私有 Runtime 安装载荷声明的默认配置。
 * @returns 路径缺省项已补齐的独立配置。
 */
function mergeDefaultLaunchConfig(
  current: LocalRuntimeLaunchConfig,
  defaults: LocalRuntimeLaunchConfig
): LocalRuntimeLaunchConfig {
  return {
    ...current,
    graphPath: current.graphPath.trim()
      ? current.graphPath
      : defaults.graphPath,
    osProjectPath: current.osProjectPath.trim()
      ? current.osProjectPath
      : defaults.osProjectPath,
    szlabProjectPath: current.szlabProjectPath.trim()
      ? current.szlabProjectPath
      : defaults.szlabProjectPath,
    environmentPath: current.environmentPath.trim()
      ? current.environmentPath
      : defaults.environmentPath,
    simulatorProjectPath: current.simulatorProjectPath.trim()
      ? current.simulatorProjectPath
      : defaults.simulatorProjectPath
  }
}
