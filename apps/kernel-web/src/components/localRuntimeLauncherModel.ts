import type {
  LocalRuntimeLaunchConfig,
  LocalRuntimeMode,
  LocalRuntimeModeInfo,
  LocalRuntimePathKind,
  LocalRuntimeSnapshot
} from '../types/electron'

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

export const IDLE_LOCAL_RUNTIME_SNAPSHOT: LocalRuntimeSnapshot = {
  phase: 'idle',
  message: 'PLC-Sim 与领域侧 Edge 均未启动',
  simulatorRunning: false,
  bridgeRunning: false,
  edgeRunning: false
}

export const DEVELOPMENT_RUNTIME_INFO: LocalRuntimeModeInfo = {
  mode: 'development',
  label: '开发环境 Runtime',
  runtimeVersion: null
}

export type ProcessDisplayStatus =
  | 'idle'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'failed'
  | 'disabled'

export type LocalRuntimeValidationField = keyof LocalRuntimeLaunchConfig
  | 'customEdgeExecutable'
  | 'customEdgeWorkingDirectory'
  | 'customEdgeEnvironment'

export interface LocalRuntimeValidationResult {
  valid: boolean
  errors: Partial<Record<LocalRuntimeValidationField, string>>
}

/**
 * 校验 PLC-Sim 启动所需的 renderer 配置。
 *
 * @param config 当前本地运行配置。
 * @returns 可直接映射到路径控件的错误集合。
 */
export function validateSimulatorConfig(
  config: LocalRuntimeLaunchConfig,
  mode: LocalRuntimeMode = 'development'
): LocalRuntimeValidationResult {
  const errors: LocalRuntimeValidationResult['errors'] = {}
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
): LocalRuntimeValidationResult {
  const errors: LocalRuntimeValidationResult['errors'] = {}
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
 * 对环境变量编辑结果执行即时格式校验。
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
 * 判断环境变量是否属于启动器托管的运行事实。
 *
 * @param normalizedName 已转换为大写的环境变量名称。
 * @returns 用户覆盖会破坏启动器边界时返回 true。
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

/** 返回本地运行入口的当前状态标签。 */
export function localRuntimeLauncherLabel(
  snapshot: LocalRuntimeSnapshot
): string {
  if (snapshot.phase === 'ready') return '本地调试已启动'
  if (snapshot.phase === 'simulator_ready') return 'PLC-Sim 已启动'
  if (snapshot.phase === 'failed') return '本地调试启动失败'
  if (isLocalRuntimeTransitioning(snapshot)) return '本地服务处理中'
  return '启动本地环境'
}

/** 返回本地运行快照是否处于任一启停过渡阶段。 */
export function isLocalRuntimeTransitioning(
  snapshot: LocalRuntimeSnapshot
): boolean {
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

/** 返回 PLC-Sim 是否处于启停过渡阶段。 */
export function isSimulatorTransitioning(
  snapshot: LocalRuntimeSnapshot
): boolean {
  return [
    'validating_simulator',
    'starting_simulator',
    'waiting_simulator',
    'stopping_simulator'
  ].includes(snapshot.phase)
}

/** 返回领域侧 Edge 是否处于启停过渡阶段。 */
export function isEdgeTransitioning(snapshot: LocalRuntimeSnapshot): boolean {
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
 * 将路径类别映射到平面配置字段。
 *
 * @param kind 除自定义可执行文件之外的受控路径类别。
 * @returns 对应的本地运行配置字段名。
 */
export function localRuntimePathField(
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
 * 读取 renderer 本地偏好并迁移为当前 Edge 启动配置。
 *
 * @returns 完整 v3 配置；存储缺失或损坏时返回安全默认值。
 */
export function readStoredLocalRuntimeConfig(): LocalRuntimeLaunchConfig {
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

/** 将当前本地运行配置写入 renderer 本地偏好。 */
export function storeLocalRuntimeConfig(config: LocalRuntimeLaunchConfig): void {
  if (typeof globalThis.localStorage === 'undefined') return
  globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
}

/**
 * 仅用安装包默认值补全尚未选择的路径，保留用户已有命令与偏好。
 *
 * @param current 当前持久化配置。
 * @param defaults 私有 Runtime 安装载荷声明的默认配置。
 * @returns 路径缺省项已补齐的独立配置。
 */
export function mergeDefaultLocalRuntimeLaunchConfig(
  current: LocalRuntimeLaunchConfig,
  defaults: LocalRuntimeLaunchConfig
): LocalRuntimeLaunchConfig {
  return {
    ...current,
    graphPath: current.graphPath.trim() ? current.graphPath : defaults.graphPath,
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

/** 生成首次或内容变化后的设备包本机信任确认文本。 */
export function devicePackageTrustPrompt(trust: {
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
 * 将未知 localStorage 值归一化为 v3 配置。
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

/** 返回 PLC-Sim 的独立展示状态。 */
export function simulatorRuntimeStatus(
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
  ) return 'starting'
  return snapshot.simulatorRunning ? 'running' : 'idle'
}

/** 返回领域侧 Edge 的独立展示状态。 */
export function edgeRuntimeStatus(
  snapshot: LocalRuntimeSnapshot
): ProcessDisplayStatus {
  if (snapshot.failedProcess === 'bridge' || snapshot.failedProcess === 'edge') {
    return 'failed'
  }
  if (
    snapshot.phase === 'stopping_edge'
    && (snapshot.bridgeRunning || snapshot.edgeRunning)
  ) return 'stopping'
  if (snapshot.phase === 'ready' && snapshot.edgeRunning) return 'running'
  if (
    snapshot.phase === 'starting_bridge'
    || snapshot.phase === 'validating_edge'
    || snapshot.phase === 'waiting_bridge'
    || snapshot.phase === 'starting_edge'
    || snapshot.phase === 'waiting_edge'
    || snapshot.bridgeRunning
    || snapshot.edgeRunning
  ) return 'starting'
  return 'idle'
}

/** 返回 PLC-Sim 启停按钮标签。 */
export function simulatorControlLabel(
  snapshot: LocalRuntimeSnapshot,
  active: boolean
): string {
  if (snapshot.phase === 'stopping_simulator') return '正在停止…'
  if (isSimulatorTransitioning(snapshot)) return '正在启动…'
  return active ? '停止 PLC' : '启动 PLC'
}

/** 返回领域侧 Edge 启停按钮标签。 */
export function edgeControlLabel(
  snapshot: LocalRuntimeSnapshot,
  active: boolean
): string {
  if (snapshot.phase === 'stopping_edge') return '正在停止…'
  if (isEdgeTransitioning(snapshot)) return '正在启动…'
  return active ? '停止 Edge' : '启动 Edge'
}

/** 返回进程状态的中文展示标签。 */
export function processStatusLabel(status: ProcessDisplayStatus): string {
  if (status === 'running') return '运行中'
  if (status === 'starting') return '启动中'
  if (status === 'stopping') return '停止中'
  if (status === 'failed') return '异常'
  if (status === 'disabled') return '未启用'
  return '未启动'
}

/** 返回 Phoenix 可观测依赖的本地修复命令。 */
export function phoenixRecoveryCommands(osProjectPath: string): string {
  const projectPath = osProjectPath.trim() || '/path/to/Uni-Lab-OS'
  return [
    `cd ${shellQuote(projectPath)}`,
    'conda activate unilab',
    "pip install -e '.[observability]'"
  ].join('\n')
}

/** 把单个路径安全包裹为 POSIX shell 字面量。 */
function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}
