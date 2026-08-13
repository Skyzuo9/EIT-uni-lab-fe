import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

interface CommandResult {
  stdout: string
  stderr: string
}

export type PortReleaseCommandRunner = (
  command: string,
  args: string[]
) => Promise<CommandResult>

export interface ReleaseLoopbackPortOptions {
  platform?: NodeJS.Platform
  commandRunner?: PortReleaseCommandRunner
  processKiller?: (pid: number, signal: NodeJS.Signals) => void
  currentProcessId?: number
}

const execFileAsync = promisify(execFile)
const WINDOWS_RELEASE_SCRIPT = [
  '& {',
  'param('
    + ' [int]$workbenchProcessId,'
    + ' [Parameter(ValueFromRemainingArguments = $true)]'
    + ' [int[]]$requestedPorts'
    + ' )',
  '$listenerPids = @(Get-NetTCPConnection -State Listen -ErrorAction Stop'
    + ' | Where-Object { $requestedPorts -contains $_.LocalPort'
    + ' -and $_.OwningProcess -ne $workbenchProcessId }'
    + ' | Select-Object -ExpandProperty OwningProcess -Unique)',
  'if ($listenerPids.Count -gt 0) {'
    + ' Stop-Process -Id $listenerPids -Force -ErrorAction Stop;'
    + ' $listenerPids | ForEach-Object { Write-Output $_ }'
    + ' }',
  '}'
].join('; ')

/** Release TCP listeners selected by the Environment Manager confirmation. */
export async function releaseLoopbackPorts(
  ports: readonly number[],
  options: ReleaseLoopbackPortOptions = {}
): Promise<number[]> {
  const normalizedPorts = normalizePorts(ports)
  if (normalizedPorts.length === 0) return []
  const platform = options.platform ?? process.platform
  const runner = options.commandRunner ?? runCommand
  const currentProcessId = options.currentProcessId ?? process.pid
  if (platform === 'win32') {
    try {
      const result = await runner('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        WINDOWS_RELEASE_SCRIPT,
        String(currentProcessId),
        ...normalizedPorts.map(String)
      ])
      return uniqueProcessIds(result.stdout, currentProcessId)
    } catch (error) {
      throw new Error(
        `Windows 释放端口 ${normalizedPorts.join('、')} 失败：${messageOf(error)}`
      )
    }
  }

  const processKiller = options.processKiller ?? process.kill
  const processIds = new Set<number>()
  for (const port of normalizedPorts) {
    try {
      const result = await runner('lsof', [
        '-nP',
        `-iTCP:${port}`,
        '-sTCP:LISTEN',
        '-t'
      ])
      for (const processId of parseProcessIds(result.stdout)) {
        if (processId !== currentProcessId) processIds.add(processId)
      }
    } catch (error) {
      if (isEmptyLsofResult(error)) continue
      throw new Error(
        `${platformName(platform)} 释放端口 ${port} 失败：${messageOf(error)}`
      )
    }
  }
  for (const processId of processIds) {
    try {
      processKiller(processId, 'SIGKILL')
    } catch (error) {
      if (!isMissingProcess(error)) throw error
    }
  }
  return [...processIds]
}

function normalizePorts(ports: readonly number[]): number[] {
  const normalized: number[] = []
  const observed = new Set<number>()
  for (const port of ports) {
    if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
      throw new Error(`不是有效 TCP 端口：${String(port)}`)
    }
    if (observed.has(port)) continue
    observed.add(port)
    normalized.push(port)
  }
  return normalized
}

function uniqueProcessIds(output: string, currentProcessId: number): number[] {
  return [...new Set(parseProcessIds(output))]
    .filter(processId => processId !== currentProcessId)
}

function parseProcessIds(output: string): number[] {
  return output.split(/\s+/u).filter(Boolean).map(token => {
    const processId = Number(token)
    if (!Number.isSafeInteger(processId) || processId <= 0) {
      throw new Error(`端口监听命令返回非法 PID：${token}`)
    }
    return processId
  })
}

async function runCommand(command: string, args: string[]): Promise<CommandResult> {
  const result = await execFileAsync(command, args, {
    encoding: 'utf8',
    windowsHide: true
  })
  return { stdout: String(result.stdout), stderr: String(result.stderr) }
}

function isEmptyLsofResult(error: unknown): boolean {
  return error instanceof Error
    && 'code' in error
    && Number((error as NodeJS.ErrnoException).code) === 1
    && (!('stdout' in error) || String(error.stdout ?? '').trim() === '')
}

function isMissingProcess(error: unknown): boolean {
  return error instanceof Error
    && 'code' in error
    && (error as NodeJS.ErrnoException).code === 'ESRCH'
}

function platformName(platform: NodeJS.Platform): string {
  if (platform === 'darwin') return 'macOS'
  if (platform === 'linux') return 'Linux'
  return platform
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
