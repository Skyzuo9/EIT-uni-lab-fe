import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

export type ManagedRuntimeStatus =
  | 'idle'
  | 'running'
  | 'interrupted'

export interface ManagedRuntimeSupervisorSnapshot {
  status: ManagedRuntimeStatus
  worker: { pid: number } | null
  error: string | null
  simulator: {
    status: ManagedRuntimeStatus
    pid: number | null
    error: string | null
  }
}

export interface ManagedWorkerLaunch {
  workspacePath: string
  graphPath: string
  configPath: string
  workingDirectory: string
  backend: 'ros' | 'dora' | 'simple' | 'automancer'
}

export interface ManagedSimulatorLaunch {
  kind: 'source' | 'executable'
  path: string
}

export interface SupervisorSpawnSpec {
  command: string
  args: string[]
  cwd: string
}

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>
type SupervisorStarter = (spec: SupervisorSpawnSpec) => Promise<void>

interface ManagedRuntimeSupervisorClientOptions {
  supervisorExecutable: string
  runtimePrefix: string
  stateDirectory: string
  port?: number
  fetcher?: Fetcher
  startSupervisor?: SupervisorStarter
  tokenFactory?: () => string
}

/**
 * Give each immutable bundled Runtime its own loopback control port. This
 * prevents an upgraded Workbench from reconnecting to a detached Supervisor
 * that still belongs to an older Runtime prefix.
 */
export function managedRuntimeSupervisorPort(manifestSha256: string): number {
  if (!/^[0-9a-f]{64}$/u.test(manifestSha256)) {
    throw new Error('Runtime manifest SHA-256 无效')
  }
  return 20_000 + (Number.parseInt(manifestSha256.slice(0, 8), 16) % 20_000)
}

/**
 * Electron 与独立 Supervisor 之间的唯一 Interface。
 * 该模块拥有 token、脱离进程启动、连接重试和 HTTP 错误归一化。
 */
export class ManagedRuntimeSupervisorClient {
  private readonly supervisorExecutable: string
  private readonly runtimePrefix: string
  private readonly stateDirectory: string
  private readonly port: number
  private readonly fetcher: Fetcher
  private readonly startSupervisorProcess: SupervisorStarter
  private readonly tokenFactory: () => string
  private token: string | null = null

  constructor(options: ManagedRuntimeSupervisorClientOptions) {
    this.supervisorExecutable = resolve(options.supervisorExecutable)
    this.runtimePrefix = resolve(options.runtimePrefix)
    this.stateDirectory = resolve(options.stateDirectory)
    this.port = options.port ?? 18_004
    this.fetcher = options.fetcher ?? globalThis.fetch
    this.startSupervisorProcess = options.startSupervisor
      ?? startDetachedSupervisor
    this.tokenFactory = options.tokenFactory
      ?? (() => randomBytes(32).toString('hex'))
  }

  async connect(): Promise<ManagedRuntimeSupervisorSnapshot> {
    const token = await this.ensureToken()
    try {
      return await this.request('GET', '/v1/status', undefined, 400)
    } catch {
      await this.startSupervisorProcess({
        command: this.supervisorExecutable,
        args: [
          '--host',
          '127.0.0.1',
          '--port',
          String(this.port),
          '--runtime-prefix',
          this.runtimePrefix,
          '--state-dir',
          this.stateDirectory,
          '--token-file',
          join(this.stateDirectory, 'token')
        ],
        cwd: this.stateDirectory
      })
      return this.waitUntilReady(token)
    }
  }

  getStatus(): Promise<ManagedRuntimeSupervisorSnapshot> {
    return this.request('GET', '/v1/status')
  }

  startWorker(
    launch: ManagedWorkerLaunch
  ): Promise<ManagedRuntimeSupervisorSnapshot> {
    return this.request('POST', '/v1/workers', {
      workspace_path: launch.workspacePath,
      graph_path: launch.graphPath,
      config_path: launch.configPath,
      working_dir: launch.workingDirectory,
      backend: launch.backend
    })
  }

  stopWorker(): Promise<ManagedRuntimeSupervisorSnapshot> {
    return this.request('DELETE', '/v1/workers/current')
  }

  startSimulator(
    launch: ManagedSimulatorLaunch
  ): Promise<ManagedRuntimeSupervisorSnapshot> {
    return this.request('POST', '/v1/simulators', launch.kind === 'source'
      ? { source_path: launch.path }
      : { executable_path: launch.path })
  }

  stopSimulator(): Promise<ManagedRuntimeSupervisorSnapshot> {
    return this.request('DELETE', '/v1/simulators/current')
  }

  private async waitUntilReady(
    _token: string
  ): Promise<ManagedRuntimeSupervisorSnapshot> {
    const deadline = Date.now() + 15_000
    let lastError: unknown
    while (Date.now() < deadline) {
      try {
        return await this.request('GET', '/v1/status', undefined, 500)
      } catch (error) {
        lastError = error
        await delay(100)
      }
    }
    throw new Error('等待 Managed Runtime Supervisor 就绪超时', {
      cause: lastError
    })
  }

  private async request(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    payload?: object,
    timeoutMs = 5_000
  ): Promise<ManagedRuntimeSupervisorSnapshot> {
    const token = await this.ensureToken()
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
    const response = await this.fetcher(
      `http://127.0.0.1:${this.port}${path}`,
      {
        method,
        headers,
        ...(payload ? { body: JSON.stringify(payload) } : {}),
        signal: AbortSignal.timeout(timeoutMs)
      }
    )
    const body = await response.json() as unknown
    if (!response.ok) {
      const message = isRecord(body) && typeof body['error'] === 'string'
        ? body['error']
        : `Supervisor 请求失败：HTTP ${response.status}`
      throw new Error(message)
    }
    return parseSnapshot(body)
  }

  private async ensureToken(): Promise<string> {
    if (this.token) return this.token
    await mkdir(this.stateDirectory, { recursive: true })
    const tokenPath = join(this.stateDirectory, 'token')
    try {
      const existing = (await readFile(tokenPath, 'utf8')).trim()
      if (!existing) throw new Error('Supervisor token 文件为空')
      this.token = existing
      return existing
    } catch (error) {
      if (!isNodeError(error) || error.code !== 'ENOENT') throw error
    }

    const created = this.tokenFactory()
    if (!created) throw new Error('Supervisor token 生成失败')
    try {
      await writeFile(tokenPath, `${created}\n`, {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o600
      })
      if (process.platform !== 'win32') await chmod(tokenPath, 0o600)
      this.token = created
      return created
    } catch (error) {
      if (!isNodeError(error) || error.code !== 'EEXIST') throw error
      const existing = (await readFile(tokenPath, 'utf8')).trim()
      if (!existing) throw new Error('Supervisor token 文件为空')
      this.token = existing
      return existing
    }
  }
}

async function startDetachedSupervisor(
  spec: SupervisorSpawnSpec
): Promise<void> {
  const child = spawn(spec.command, spec.args, {
    cwd: spec.cwd,
    detached: true,
    shell: false,
    stdio: 'ignore',
    windowsHide: true
  })
  await new Promise<void>((resolvePromise, reject) => {
    child.once('error', reject)
    child.once('spawn', resolvePromise)
  })
  child.unref()
}

function parseSnapshot(value: unknown): ManagedRuntimeSupervisorSnapshot {
  if (!isRecord(value)) throw new Error('Supervisor 返回值无效')
  const status = value['status']
  const worker = value['worker']
  const error = value['error']
  const simulator = value['simulator']
  if (!['idle', 'running', 'interrupted'].includes(String(status))) {
    throw new Error('Supervisor 返回了未知状态')
  }
  if (
    worker !== null
    && (!isRecord(worker) || typeof worker['pid'] !== 'number')
  ) {
    throw new Error('Supervisor worker 状态无效')
  }
  if (error !== null && typeof error !== 'string') {
    throw new Error('Supervisor error 状态无效')
  }
  if (
    !isRecord(simulator)
    || !['idle', 'running', 'interrupted'].includes(
      String(simulator['status'])
    )
    || (simulator['pid'] !== null && typeof simulator['pid'] !== 'number')
    || (simulator['error'] !== null && typeof simulator['error'] !== 'string')
  ) {
    throw new Error('Supervisor simulator 状态无效')
  }
  return {
    status: status as ManagedRuntimeStatus,
    worker: worker === null ? null : { pid: worker['pid'] as number },
    error,
    simulator: {
      status: simulator['status'] as ManagedRuntimeStatus,
      pid: simulator['pid'] as number | null,
      error: simulator['error'] as string | null
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds))
}
