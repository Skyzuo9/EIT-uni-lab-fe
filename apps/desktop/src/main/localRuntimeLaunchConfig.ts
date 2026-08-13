import { constants as fsConstants } from 'node:fs'
import { access, stat } from 'node:fs/promises'
import { isAbsolute, join, normalize, resolve } from 'node:path'

import type { LocalRuntimeLaunchConfig } from '../shared/localRuntime'
import {
  resolveLocalRuntimeEdgeCommand,
  type ResolvedLocalRuntimeEdgeCommand
} from './localRuntimeEdgeCommand'
import {
  resolvePlcSimulatorLaunch,
  runtimeExecutablePaths
} from './localRuntimeEnvironment'
import {
  normalizeLocalRuntimePorts,
  type LocalRuntimePorts
} from './localRuntimeLaunchContract'

/** 已校验、可用于生成领域侧边缘执行（Edge）命令的内部配置。 */
export interface ResolvedRuntimeConfig {
  platform: NodeJS.Platform
  graphPath: string
  osProjectPath: string
  szlabProjectPath: string
  environmentPath: string
  pythonExecutable: string
  unilabExecutable: string
  localConfigPath: string
  runtimeDirectory: string
  customEdgeCommand: ResolvedLocalRuntimeEdgeCommand | null
  ports: LocalRuntimePorts
}

/** 已校验、可用于生成 PLC-Sim 命令的内部配置。 */
export interface ResolvedSimulatorConfig {
  platform: NodeJS.Platform
  environmentPath: string
  pythonExecutable: string
  workingDirectory: string
  ports: LocalRuntimePorts
}

/**
 * 校验路径并把生成式或自定义 Edge 命令解析成一次启动事实。
 *
 * @param config renderer 经 IPC 提交的本地运行配置。
 * @param platform 当前目标平台，用于选择 Conda 可执行文件布局和 Windows 规则。
 * @param ports 当前启动环境的端口事实。
 * @returns 已规范化路径、运行目录、配置文件、端口和可选自定义命令。
 * @throws 项目结构、端口、可执行文件、自定义命令或设备包约束不满足时抛出。
 * @safety 未配置设备来源时只生成空设备启动配置；任何显式路径仍须通过文件校验。
 */
export async function resolveRuntimeConfig(
  config: LocalRuntimeLaunchConfig,
  platform: NodeJS.Platform,
  ports: LocalRuntimePorts
): Promise<ResolvedRuntimeConfig> {
  const graphPath = normalizeOptionalPath(config.graphPath)
  const osProjectPath = normalizeRequiredPath(
    config.osProjectPath,
    '请选择 Uni-Lab-OS 项目根目录'
  )
  const szlabProjectPath = normalizeOptionalPath(config.szlabProjectPath)
  const environmentPath = normalizeRequiredPath(
    config.environmentPath,
    '请选择 unilab Conda 环境目录'
  )

  if (graphPath) {
    if (!graphPath.toLowerCase().endsWith('.json')) {
      throw new Error('设备图必须是 JSON 文件')
    }
    await requireFile(graphPath, '设备图 JSON 不存在')
  }
  await requireDirectory(osProjectPath, 'Uni-Lab-OS 项目根目录不存在')
  if (szlabProjectPath) {
    await requireDirectory(szlabProjectPath, '领域项目根目录不存在')
  }
  if (config.edgeCommandMode === 'custom' && !szlabProjectPath) {
    throw new Error('自定义 Edge 启动命令仅适用于已挂载领域设备包')
  }
  await requireDirectory(environmentPath, 'unilab Conda 环境目录不存在')

  const { pythonExecutable, unilabExecutable } = runtimeExecutablePaths(
    environmentPath,
    platform
  )
  const localConfigPath = szlabProjectPath
    ? join(szlabProjectPath, 'deployment', 'local_config.py')
    : join(osProjectPath, 'unilabos', 'config', 'example_config.py')
  await requireFile(
    localConfigPath,
    szlabProjectPath
      ? '领域项目缺少 deployment/local_config.py'
      : 'Uni-Lab-OS 缺少内置本地调试配置'
  )
  const runtimeDirectory = szlabProjectPath
    ? join(szlabProjectPath, 'runtime', 'plc-sim-e2e', 'os')
    : join(osProjectPath, 'runtime', 'edge-local-debug')
  const resolvedPorts = normalizeLocalRuntimePorts(ports)
  const customEdgeCommand = config.edgeCommandMode === 'custom'
    ? resolveLocalRuntimeEdgeCommand(config.customEdgeCommand, {
        unilab: unilabExecutable,
        python: pythonExecutable,
        workspace: szlabProjectPath,
        graph: graphPath,
        config: localConfigPath,
        working_dir: runtimeDirectory,
        edge_http_port: String(resolvedPorts.edgeHttp),
        hostlink_port: String(resolvedPorts.hostLink)
      }, platform)
    : null

  if (!customEdgeCommand) {
    await requireExecutable(
      unilabExecutable,
      platform === 'win32'
        ? '所选 Conda 环境缺少 Scripts/unilab.exe'
        : '所选 Conda 环境缺少 bin/unilab'
    )
  } else if (commandLooksLikePath(customEdgeCommand.command)) {
    await requireExecutable(
      customEdgeCommand.command,
      'Edge 自定义可执行文件不存在或不可执行'
    )
  }
  if (customEdgeCommand) {
    await requireDirectory(
      customEdgeCommand.workingDirectory,
      'Edge 自定义工作目录不存在'
    )
  }

  return {
    platform,
    graphPath,
    osProjectPath,
    szlabProjectPath,
    environmentPath,
    pythonExecutable,
    unilabExecutable,
    localConfigPath,
    runtimeDirectory,
    customEdgeCommand,
    ports: resolvedPorts
  }
}

/**
 * 校验并规范化 PLC-Sim 启动配置。
 *
 * @param config 用户提交的原始路径配置。
 * @param platform 当前桌面平台。
 * @param ports 当前启动环境的端口事实。
 * @returns 可直接生成 PLC-Sim 子进程规范的配置。
 * @throws 路径、端口或 Python 可执行文件不合法时抛出中文诊断。
 * @safety 只读取项目目录，不启动 PLC-Sim。
 */
export async function resolveSimulatorConfig(
  config: LocalRuntimeLaunchConfig,
  platform: NodeJS.Platform,
  ports: LocalRuntimePorts
): Promise<ResolvedSimulatorConfig> {
  const environmentPath = normalizeRequiredPath(
    config.environmentPath,
    '请选择 unilab Conda 环境目录'
  )
  const simulatorProjectPath = normalizeRequiredPath(
    config.simulatorProjectPath,
    '请选择 PLC-Sim 项目根目录'
  )
  const resolvedPorts = normalizeLocalRuntimePorts(ports)
  const launch = await resolvePlcSimulatorLaunch({
    environmentPath,
    projectPath: simulatorProjectPath,
    platform,
    guiPort: resolvedPorts.simulatorGui,
    opcUaPort: resolvedPorts.simulatorOpcUa
  })
  return {
    platform,
    environmentPath,
    pythonExecutable: launch.command,
    workingDirectory: launch.cwd,
    ports: resolvedPorts
  }
}

/**
 * 判断自定义可执行文件是否显式携带目录。
 *
 * @param command 已展开占位符的可执行文件名称或路径。
 * @returns 绝对路径或包含平台目录分隔符时返回 true。
 * @throws 不抛出异常。
 * @safety 裸命令名只交给激活后的 PATH 解析，不在此执行。
 */
function commandLooksLikePath(command: string): boolean {
  return isAbsolute(command) || command.includes('/') || command.includes('\\')
}

/**
 * 校验路径是可执行文件，不执行该文件。
 *
 * @param path 已规范化的候选路径。
 * @param message 用户可行动的错误前缀。
 * @returns 文件可执行时完成。
 * @throws 文件缺失或不可执行时抛出包含路径的错误。
 * @safety 只检查访问权限。
 */
async function requireExecutable(path: string, message: string): Promise<void> {
  try {
    await access(path, fsConstants.X_OK)
  } catch {
    throw new Error(`${message}：${path}`)
  }
}

/**
 * 校验路径是可读文件，不读取文件内容。
 *
 * @param path 已规范化的候选路径。
 * @param message 用户可行动的错误前缀。
 * @returns 文件可读时完成。
 * @throws 文件缺失或不可读时抛出包含路径的错误。
 * @safety 只检查读取权限。
 */
async function requireFile(path: string, message: string): Promise<void> {
  try {
    await access(path, fsConstants.R_OK)
  } catch {
    throw new Error(`${message}：${path}`)
  }
}

/**
 * 校验路径是目录，不枚举目录内容。
 *
 * @param path 已规范化的候选路径。
 * @param message 用户可行动的错误前缀。
 * @returns 路径存在且是目录时完成。
 * @throws 路径缺失、不可读或不是目录时抛出包含路径的错误。
 * @safety 只读取文件元数据。
 */
async function requireDirectory(path: string, message: string): Promise<void> {
  try {
    if (!(await stat(path)).isDirectory()) throw new Error(message)
  } catch {
    throw new Error(`${message}：${path}`)
  }
}

/**
 * 规范化必填路径，并在空值时抛出给定中文诊断。
 *
 * @param value 用户提交的原始路径。
 * @param message 空值时使用的错误消息。
 * @returns 基于当前工作目录解析的规范绝对路径。
 * @throws 原始值为空时抛出给定错误。
 * @safety 不访问文件系统。
 */
function normalizeRequiredPath(value: string, message: string): string {
  const trimmed = value.trim()
  if (!trimmed) throw new Error(message)
  return normalize(resolve(trimmed))
}

/**
 * 规范化可选路径，空值保持为空字符串。
 *
 * @param value 用户提交的原始路径。
 * @returns 空值保持空字符串，否则返回规范绝对路径。
 * @throws 不抛出异常。
 * @safety 不访问文件系统。
 */
function normalizeOptionalPath(value: string): string {
  const trimmed = value.trim()
  return trimmed ? normalize(resolve(trimmed)) : ''
}
