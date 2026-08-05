import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

export interface LocalRuntimePortRequirement {
  port: number
  label: string
}

export interface LocalRuntimeCommandResult {
  stdout: string
  stderr: string
}

export type LocalRuntimeCommandRunner = (
  command: string,
  args: string[]
) => Promise<LocalRuntimeCommandResult>

export interface LocalRuntimePortReleaseOptions {
  platform?: NodeJS.Platform
  commandRunner?: LocalRuntimeCommandRunner
  processKiller?: (pid: number, signal: NodeJS.Signals) => void
  currentProcessId?: number
}

const execFileAsync = promisify(execFile)

const WINDOWS_RELEASE_SCRIPT = [
  '& {',
  'param('
    + ' [int]$launcherProcessId,'
    + ' [Parameter(ValueFromRemainingArguments = $true)]'
    + ' [int[]]$requestedPorts'
    + ' )',
  '$listenerPids = @(Get-NetTCPConnection -State Listen -ErrorAction Stop'
    + ' | Where-Object { $requestedPorts -contains $_.LocalPort'
    + ' -and $_.OwningProcess -ne $launcherProcessId }'
    + ' | Select-Object -ExpandProperty OwningProcess -Unique)',
  'if ($listenerPids.Count -gt 0) {'
    + ' Stop-Process -Id $listenerPids -Force -ErrorAction Stop;'
    + ' $listenerPids | ForEach-Object { Write-Output $_ }'
    + ' }',
  '}'
].join('; ')

/**
 * 释放启动计划声明端口上的残留监听进程。
 *
 * @param requirements 已解析启动计划中的端口与诊断名称。
 * @param options 平台与可替换的命令/进程执行依赖。
 * @returns 已强制终止且去重后的进程 PID；无监听者时返回空数组。
 * @throws 端口非法、平台查询失败或进程无法终止时抛出可诊断错误。
 */
export async function releaseListeningPorts(
  requirements: LocalRuntimePortRequirement[],
  options: LocalRuntimePortReleaseOptions = {}
): Promise<number[]> {
  const normalizedRequirements = normalizePortRequirements(requirements)
  if (normalizedRequirements.length === 0) return []

  const platform = options.platform ?? process.platform
  const commandRunner = options.commandRunner ?? runCommand
  const currentProcessId = options.currentProcessId ?? process.pid
  if (platform === 'win32') {
    return releaseWindowsPorts(
      normalizedRequirements,
      commandRunner,
      currentProcessId
    )
  }
  return releaseUnixPorts(
    normalizedRequirements,
    commandRunner,
    options.processKiller ?? process.kill,
    currentProcessId,
    platform
  )
}

/**
 * 校验并按首次出现顺序去重端口要求。
 *
 * @param requirements 启动计划提供的原始端口要求。
 * @returns 每个 TCP 端口最多一项的安全命令输入。
 */
function normalizePortRequirements(
  requirements: LocalRuntimePortRequirement[]
): LocalRuntimePortRequirement[] {
  const normalized: LocalRuntimePortRequirement[] = []
  const observedPorts = new Set<number>()
  for (const requirement of requirements) {
    if (
      !Number.isSafeInteger(requirement.port)
      || requirement.port < 1
      || requirement.port > 65_535
    ) {
      throw new Error(`${requirement.label}不是有效 TCP 端口：${requirement.port}`)
    }
    if (observedPorts.has(requirement.port)) continue
    observedPorts.add(requirement.port)
    normalized.push(requirement)
  }
  return normalized
}

/**
 * 在 macOS/Linux 上通过 lsof 查询监听者，再对去重 PID 发送 SIGKILL。
 *
 * @param requirements 已校验的端口要求。
 * @param commandRunner 无 shell 的外部命令执行器。
 * @param processKiller 对单个 PID 发送信号的执行器。
 * @param currentProcessId Electron 主进程 PID，禁止自杀式终止。
 * @param platform 当前 Node 平台，用于诊断信息。
 * @returns 已终止的去重 PID。
 */
async function releaseUnixPorts(
  requirements: LocalRuntimePortRequirement[],
  commandRunner: LocalRuntimeCommandRunner,
  processKiller: (pid: number, signal: NodeJS.Signals) => void,
  currentProcessId: number,
  platform: NodeJS.Platform
): Promise<number[]> {
  const listenerProcessIds: number[] = []
  const observedProcessIds = new Set<number>()
  for (const requirement of requirements) {
    try {
      const result = await commandRunner('lsof', [
        '-nP',
        `-tiTCP:${requirement.port}`,
        '-sTCP:LISTEN'
      ])
      for (const processId of parseProcessIds(result.stdout)) {
        if (
          processId === currentProcessId
          || observedProcessIds.has(processId)
        ) continue
        observedProcessIds.add(processId)
        listenerProcessIds.push(processId)
      }
    } catch (error) {
      if (isEmptyLsofResult(error)) continue
      throw portReleaseError(platform, [requirement], error)
    }
  }

  for (const processId of listenerProcessIds) {
    try {
      processKiller(processId, 'SIGKILL')
    } catch (error) {
      if (isMissingProcess(error)) continue
      throw portReleaseError(platform, requirements, error)
    }
  }
  return listenerProcessIds
}

/**
 * 在 Windows 上一次性查询目标端口并由 PowerShell 强制终止去重 PID。
 *
 * @param requirements 已校验的端口要求。
 * @param commandRunner 无 shell 的 PowerShell 执行器。
 * @param currentProcessId Electron 主进程 PID，脚本会额外排除该身份。
 * @returns PowerShell 报告已终止的去重 PID。
 */
async function releaseWindowsPorts(
  requirements: LocalRuntimePortRequirement[],
  commandRunner: LocalRuntimeCommandRunner,
  currentProcessId: number
): Promise<number[]> {
  try {
    const portArguments: string[] = []
    for (const requirement of requirements) {
      portArguments.push(String(requirement.port))
    }
    const result = await commandRunner('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      WINDOWS_RELEASE_SCRIPT,
      String(currentProcessId),
      ...portArguments
    ])
    return uniqueProcessIds(result.stdout, currentProcessId)
  } catch (error) {
    throw portReleaseError('win32', requirements, error)
  }
}

/**
 * 执行一个禁用 shell 的平台命令，保留标准输出用于解析 PID。
 *
 * @param command 可执行文件名。
 * @param args 已拆分且校验过的参数列表。
 * @returns 命令的 UTF-8 标准输出与标准错误。
 */
async function runCommand(
  command: string,
  args: string[]
): Promise<LocalRuntimeCommandResult> {
  const result = await execFileAsync(command, args, {
    encoding: 'utf8',
    windowsHide: true
  })
  return {
    stdout: String(result.stdout),
    stderr: String(result.stderr)
  }
}

/**
 * 解析命令输出中的十进制 PID，并拒绝不可解释的输出。
 *
 * @param output lsof 或 PowerShell 输出。
 * @returns 保留输出顺序的 PID 列表。
 */
function parseProcessIds(output: string): number[] {
  const processIds: number[] = []
  for (const token of output.split(/\s+/u).filter(Boolean)) {
    const processId = Number(token)
    if (!Number.isSafeInteger(processId) || processId <= 0) {
      throw new Error(`端口监听命令返回非法 PID：${token}`)
    }
    processIds.push(processId)
  }
  return processIds
}

/**
 * 从命令输出中去重 PID，并排除当前 Electron 主进程。
 *
 * @param output 平台命令输出。
 * @param currentProcessId 当前主进程 PID。
 * @returns 安全且去重后的 PID。
 */
function uniqueProcessIds(output: string, currentProcessId: number): number[] {
  const unique: number[] = []
  const observed = new Set<number>()
  for (const processId of parseProcessIds(output)) {
    if (processId === currentProcessId || observed.has(processId)) continue
    observed.add(processId)
    unique.push(processId)
  }
  return unique
}

/**
 * 判断 lsof 的退出是否仅表示目标端口没有监听进程。
 *
 * @param error 外部命令抛出的未知错误。
 * @returns 退出码为 1 且没有标准输出时为 true。
 */
function isEmptyLsofResult(error: unknown): boolean {
  if (!isCommandError(error)) return false
  return Number(error.code) === 1 && String(error.stdout ?? '').trim() === ''
}

/**
 * 判断进程是否已在终止请求前退出。
 *
 * @param error process.kill 抛出的未知错误。
 * @returns ESRCH 表示目标已不存在，可按幂等成功处理。
 */
function isMissingProcess(error: unknown): boolean {
  return error instanceof Error
    && 'code' in error
    && (error as NodeJS.ErrnoException).code === 'ESRCH'
}

/**
 * 为清理失败补充平台、组件名称与端口上下文。
 *
 * @param platform 当前 Node 平台。
 * @param requirements 失败操作涉及的端口要求。
 * @param error 原始平台错误。
 * @returns 可直接展示给用户的错误。
 */
function portReleaseError(
  platform: NodeJS.Platform,
  requirements: LocalRuntimePortRequirement[],
  error: unknown
): Error {
  const targetDescriptions: string[] = []
  for (const requirement of requirements) {
    targetDescriptions.push(`${requirement.label} 端口 ${requirement.port}`)
  }
  return new Error(
    `${platformDisplayName(platform)} 释放 ${targetDescriptions.join('、')} 失败：${errorMessage(error)}`
  )
}

/**
 * 把 Node 平台值转换成用户可识别的平台名称。
 *
 * @param platform Node 平台值。
 * @returns macOS、Windows、Linux 或原始平台值。
 */
function platformDisplayName(platform: NodeJS.Platform): string {
  if (platform === 'darwin') return 'macOS'
  if (platform === 'win32') return 'Windows'
  if (platform === 'linux') return 'Linux'
  return platform
}

/**
 * 读取未知异常的稳定诊断正文。
 *
 * @param error 未知异常值。
 * @returns Error.message 或字符串化结果。
 */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

interface CommandError extends Error {
  code?: string | number
  stdout?: string | Buffer
}

/**
 * 判断异常是否包含外部命令的退出信息。
 *
 * @param error 未知异常值。
 * @returns 可读取 code/stdout 时为 true。
 */
function isCommandError(error: unknown): error is CommandError {
  return error instanceof Error && ('code' in error || 'stdout' in error)
}
