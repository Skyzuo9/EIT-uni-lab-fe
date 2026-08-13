import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { dialog, shell, type BrowserWindow } from 'electron'

import {
  openLocalRuntimeLogDirectory
} from './diagnosticLogSession'
import {
  resolveLocalRuntimeLaunchPlan,
  type LocalRuntimeManager
} from './localRuntimeManager'
import type {
  LocalRuntimeLaunchConfig,
  LocalRuntimeLogQuery,
  LocalRuntimeOpenLogResult,
  LocalRuntimePathKind
} from '../shared/localRuntime'

interface LocalRuntimeLogDirectoryDependencies {
  createDirectory: (path: string) => Promise<void>
  openPath: (path: string) => Promise<string>
}

/** 构造本地运行时受控路径选择器。 */
export function runtimePathDialogOptions(
  kind: LocalRuntimePathKind
): Electron.OpenDialogOptions {
  if (kind === 'graph') {
    return {
      title: '选择设备图 JSON',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile']
    }
  }
  if (kind === 'edgeExecutable') {
    return {
      title: '选择 Edge 自定义可执行文件',
      ...(process.platform === 'win32'
        ? { filters: [{ name: 'Windows 可执行文件', extensions: ['exe'] }] }
        : {}),
      properties: ['openFile']
    }
  }
  const titles: Record<
    Exclude<LocalRuntimePathKind, 'graph' | 'edgeExecutable'>,
    string
  > = {
    os: '选择 Uni-Lab-OS 项目根目录',
    szlab: '选择领域项目根目录（以 Uni-Lab-SZLab 为例）',
    environment: '选择 unilab Conda 环境目录',
    simulator: '选择 PLC-Sim 项目根目录',
    edgeWorkingDirectory: '选择 Edge 自定义工作目录'
  }
  if (!(kind in titles)) throw new Error('不支持的本地运行时路径类型')
  return {
    title: titles[kind as keyof typeof titles],
    properties: ['openDirectory']
  }
}

/** 校验并复制 Renderer 提交的本地运行配置。 */
export function parseRuntimeConfig(value: unknown): LocalRuntimeLaunchConfig {
  if (!value || typeof value !== 'object') {
    throw new Error('本地运行时启动配置无效')
  }
  const candidate = value as Record<string, unknown>
  if (
    typeof candidate.graphPath !== 'string' ||
    typeof candidate.osProjectPath !== 'string' ||
    typeof candidate.szlabProjectPath !== 'string' ||
    typeof candidate.environmentPath !== 'string' ||
    typeof candidate.simulatorProjectPath !== 'string' ||
    !['generated', 'custom'].includes(String(candidate.edgeCommandMode))
  ) {
    throw new Error('本地运行时启动配置字段不完整')
  }
  return {
    graphPath: candidate.graphPath,
    osProjectPath: candidate.osProjectPath,
    szlabProjectPath: candidate.szlabProjectPath,
    environmentPath: candidate.environmentPath,
    simulatorProjectPath: candidate.simulatorProjectPath,
    edgeCommandMode: candidate.edgeCommandMode as 'generated' | 'custom',
    customEdgeCommand: parseCustomEdgeCommand(candidate.customEdgeCommand)
  }
}

function parseCustomEdgeCommand(
  value: unknown
): LocalRuntimeLaunchConfig['customEdgeCommand'] {
  if (!value || typeof value !== 'object') {
    throw new Error('Edge 自定义启动命令无效')
  }
  const candidate = value as Record<string, unknown>
  const environment = candidate.environment
  if (
    typeof candidate.executable !== 'string' ||
    (candidate.workingDirectory !== undefined &&
      typeof candidate.workingDirectory !== 'string') ||
    !Array.isArray(candidate.args) ||
    !candidate.args.every((argument) => typeof argument === 'string') ||
    (environment !== undefined && (
      !Array.isArray(environment) ||
      !environment.every((entry) => (
        Boolean(entry) &&
        typeof entry === 'object' &&
        typeof (entry as Record<string, unknown>).name === 'string' &&
        typeof (entry as Record<string, unknown>).value === 'string'
      ))
    ))
  ) {
    throw new Error('Edge 自定义启动命令字段不完整')
  }
  return {
    executable: candidate.executable,
    workingDirectory: typeof candidate.workingDirectory === 'string'
      ? candidate.workingDirectory
      : '{{workspace}}',
    args: [...candidate.args],
    environment: (environment ?? []).map((entry) => ({
      name: (entry as Record<string, string>).name,
      value: (entry as Record<string, string>).value
    }))
  }
}

/** 解析系统生成式 Edge 命令预览。 */
export async function resolveGeneratedEdgeCommand(
  payload: unknown
): Promise<{ executable: string; args: string[]; cwd: string }> {
  const config = parseRuntimeConfig(payload)
  const plan = await resolveLocalRuntimeLaunchPlan({
    ...config,
    edgeCommandMode: 'generated'
  })
  return {
    executable: plan.edge.command,
    args: [...plan.edge.args],
    cwd: plan.edge.cwd
  }
}

/** 在启动自定义程序前显示主进程原生确认。 */
export async function confirmCustomEdgeLaunch(
  config: LocalRuntimeLaunchConfig,
  mainWindow: BrowserWindow | null
): Promise<void> {
  if (config.edgeCommandMode !== 'custom') return
  if (!mainWindow || mainWindow.isDestroyed()) {
    throw new Error('主窗口不可用，无法确认 Edge 自定义启动命令')
  }
  const plan = await resolveLocalRuntimeLaunchPlan(config)
  const detailLines = [
    `可执行文件：${plan.edge.command}`,
    `工作目录：${plan.edge.cwd}`,
    '',
    '参数：',
    ...plan.edge.args.slice(0, 24).map(
      (argument, index) => `${index + 1}. ${truncateDialogValue(argument)}`
    ),
    ...(plan.edge.args.length > 24
      ? [`… 另有 ${plan.edge.args.length - 24} 项参数未展开显示`]
      : []),
    '',
    '环境变量覆盖：',
    ...(config.customEdgeCommand.environment.length > 0
      ? config.customEdgeCommand.environment.slice(0, 16).map(
          ({ name, value }) => `${name}=${truncateDialogValue(value)}`
        )
      : ['无']),
    ...(config.customEdgeCommand.environment.length > 16
      ? [`… 另有 ${config.customEdgeCommand.environment.length - 16} 项未展开显示`]
      : [])
  ]
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    title: '确认自定义 Edge 启动命令',
    message: '此配置将启动你指定的本地程序',
    detail: detailLines.join('\n'),
    buttons: ['允许本次启动', '取消'],
    defaultId: 1,
    cancelId: 1,
    noLink: true
  })
  if (result.response !== 0) throw new Error('已取消 Edge 自定义命令启动')
}

function truncateDialogValue(value: string): string {
  return value.length <= 300 ? value : `${value.slice(0, 300)}…`
}

/** 校验有界增量日志读取游标。 */
export function parseRuntimeLogQuery(value: unknown): LocalRuntimeLogQuery {
  if (!value || typeof value !== 'object') {
    throw new Error('本地运行日志读取参数无效')
  }
  const candidate = value as Record<string, unknown>
  const kind = parseRuntimeLogKind(candidate.kind)
  if (candidate.cursor === null) return { kind, cursor: null }
  if (!candidate.cursor || typeof candidate.cursor !== 'object') {
    throw new Error('本地运行日志游标无效')
  }
  const cursor = candidate.cursor as Record<string, unknown>
  if (
    typeof cursor.fileId !== 'string' ||
    !cursor.fileId ||
    !Number.isSafeInteger(cursor.offset) ||
    Number(cursor.offset) < 0
  ) {
    throw new Error('本地运行日志游标无效')
  }
  return {
    kind,
    cursor: { fileId: cursor.fileId, offset: Number(cursor.offset) }
  }
}

/** 打开由 LocalRuntimeManager 权威解析的日志目录。 */
export function openRuntimeLogDirectory(
  manager: LocalRuntimeManager,
  payload: unknown,
  dependencies: LocalRuntimeLogDirectoryDependencies = {
    createDirectory: async (path) => {
      await mkdir(path, { recursive: true })
    },
    openPath: (path) => shell.openPath(path)
  }
): Promise<LocalRuntimeOpenLogResult> {
  const kind = parseRuntimeLogKind(payload)
  return openLocalRuntimeLogDirectory(
    dirname(manager.getLogPath(kind)),
    dependencies
  )
}

function parseRuntimeLogKind(value: unknown): 'simulator' | 'edge' {
  if (value !== 'simulator' && value !== 'edge') {
    throw new Error('不支持的本地运行日志来源')
  }
  return value
}
