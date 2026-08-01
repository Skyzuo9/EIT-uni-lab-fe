import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { constants as fsConstants, createWriteStream, existsSync } from 'node:fs'
import { access, mkdir, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join, normalize, resolve, sep } from 'node:path'
import { createConnection } from 'node:net'

import {
  IDLE_LOCAL_RUNTIME_SNAPSHOT,
  type LocalRuntimeLaunchConfig,
  type LocalRuntimeSnapshot
} from '../shared/localRuntime'

interface SimulatorManifest {
  command?: unknown
  args?: unknown
  cwd?: unknown
  readyUrl?: unknown
  readyPort?: unknown
}

interface SpawnSpec {
  command: string
  args: string[]
  cwd: string
  env?: NodeJS.ProcessEnv
  readyUrl?: string
  readyPort?: number
}

type SnapshotListener = (snapshot: LocalRuntimeSnapshot) => void

const EDGE_READY_URL =
  'http://127.0.0.1:8014/api/runtime/local/actions'
const EDGE_READY_TIMEOUT_MS = 90_000
const SIMULATOR_READY_TIMEOUT_MS = 30_000

export class LocalRuntimeManager {
  private snapshot: LocalRuntimeSnapshot = {
    ...IDLE_LOCAL_RUNTIME_SNAPSHOT
  }
  private edgeProcess: ChildProcessWithoutNullStreams | null = null
  private simulatorProcess: ChildProcessWithoutNullStreams | null = null
  private stopping = false

  constructor(
    private readonly logsDirectory: string,
    private readonly onSnapshot: SnapshotListener
  ) {}

  getSnapshot(): LocalRuntimeSnapshot {
    return { ...this.snapshot }
  }

  async validate(config: LocalRuntimeLaunchConfig): Promise<void> {
    const graphPath = normalizeRequiredPath(config.graphPath, '请选择设备图 JSON')
    const osProjectPath = normalizeRequiredPath(
      config.osProjectPath,
      '请选择 Uni-Lab-OS 项目根目录'
    )

    if (!graphPath.toLowerCase().endsWith('.json')) {
      throw new Error('设备图必须是 JSON 文件')
    }
    await requireFile(graphPath, '设备图 JSON 不存在')
    await requireDirectory(osProjectPath, 'Uni-Lab-OS 项目根目录不存在')
    await requireFile(
      join(osProjectPath, 'scripts', 'start_local_edge_runtime.sh'),
      '所选目录不是有效的 Uni-Lab-OS 项目'
    )

    if (config.startSimulator) {
      const simulatorProjectPath = normalizeRequiredPath(
        config.simulatorProjectPath,
        '请选择 OPC 仿真项目目录'
      )
      await requireDirectory(
        simulatorProjectPath,
        'OPC 仿真项目目录不存在'
      )
      await resolveSimulatorSpec(simulatorProjectPath)
    }
  }

  async start(
    config: LocalRuntimeLaunchConfig
  ): Promise<LocalRuntimeSnapshot> {
    if (this.snapshot.phase !== 'idle' && this.snapshot.phase !== 'failed') {
      throw new Error('本地环境正在运行，请先停止当前会话')
    }

    this.stopping = false
    this.publish({
      phase: 'validating',
      message: '正在检查项目路径与启动配置…',
      simulatorRunning: false,
      edgeRunning: false
    })

    try {
      await this.validate(config)
      await mkdir(this.logsDirectory, { recursive: true })

      if (config.startSimulator) {
        this.publish({
          phase: 'starting_simulator',
          message: '正在启动 OPC 仿真器…',
          simulatorRunning: false,
          edgeRunning: false
        })
        const simulatorSpec = await resolveSimulatorSpec(
          resolve(config.simulatorProjectPath)
        )
        this.simulatorProcess = this.spawnManaged(
          'simulator',
          simulatorSpec
        )
        await waitForSimulator(
          this.simulatorProcess,
          simulatorSpec,
          SIMULATOR_READY_TIMEOUT_MS
        )
      }

      this.publish({
        phase: 'starting_edge',
        message: config.startSimulator
          ? 'OPC 仿真器已就绪，正在启动 Edge…'
          : '正在启动 Edge…',
        simulatorRunning: Boolean(this.simulatorProcess),
        edgeRunning: false
      })
      this.edgeProcess = this.spawnManaged(
        'edge',
        await resolveEdgeSpec(config)
      )
      this.publish({
        phase: 'waiting_edge',
        message: 'Edge 已启动，正在等待设备动作目录…',
        simulatorRunning: Boolean(this.simulatorProcess),
        edgeRunning: true
      })
      await waitForEdgeReady(this.edgeProcess, EDGE_READY_TIMEOUT_MS)

      this.publish({
        phase: 'ready',
        message: config.startSimulator
          ? 'OPC 仿真器与 Edge 已就绪'
          : 'Edge 已就绪',
        simulatorRunning: Boolean(this.simulatorProcess),
        edgeRunning: true
      })
      return this.getSnapshot()
    } catch (error) {
      const message = errorMessage(error)
      await this.stopProcesses()
      this.publish({
        phase: 'failed',
        message: '本地环境启动失败',
        simulatorRunning: false,
        edgeRunning: false,
        error: message
      })
      throw new Error(message)
    }
  }

  async stop(): Promise<LocalRuntimeSnapshot> {
    if (this.snapshot.phase === 'idle') return this.getSnapshot()
    this.stopping = true
    this.publish({
      phase: 'stopping',
      message: '正在停止本地环境…',
      simulatorRunning: Boolean(this.simulatorProcess),
      edgeRunning: Boolean(this.edgeProcess)
    })
    await this.stopProcesses()
    this.stopping = false
    this.publish({ ...IDLE_LOCAL_RUNTIME_SNAPSHOT })
    return this.getSnapshot()
  }

  private spawnManaged(
    kind: 'edge' | 'simulator',
    spec: SpawnSpec
  ): ChildProcessWithoutNullStreams {
    const child = spawn(spec.command, spec.args, {
      cwd: spec.cwd,
      env: spec.env ?? process.env,
      detached: process.platform !== 'win32',
      shell: false,
      windowsHide: true
    })
    const logStream = createWriteStream(
      join(this.logsDirectory, `${kind}.log`),
      { flags: 'a' }
    )
    child.stdout.pipe(logStream, { end: false })
    child.stderr.pipe(logStream, { end: false })
    child.once('error', (error) => {
      logStream.write(`\n[launcher] ${error.message}\n`)
    })
    child.once('close', (code, signal) => {
      logStream.end(
        `\n[launcher] process exited code=${String(code)} signal=${String(signal)}\n`
      )
      if (kind === 'edge' && this.edgeProcess === child) {
        this.edgeProcess = null
      }
      if (kind === 'simulator' && this.simulatorProcess === child) {
        this.simulatorProcess = null
      }
      if (!this.stopping && this.snapshot.phase !== 'failed') {
        void this.handleUnexpectedExit(kind)
      }
    })
    return child
  }

  private async handleUnexpectedExit(
    kind: 'edge' | 'simulator'
  ): Promise<void> {
    const label = kind === 'edge' ? 'Edge' : 'OPC 仿真器'
    await this.stopProcesses()
    this.publish({
      phase: 'failed',
      message: `${label} 已意外退出`,
      simulatorRunning: false,
      edgeRunning: false,
      error: `请查看 ${kind}.log 了解退出原因`
    })
  }

  private async stopProcesses(): Promise<void> {
    this.stopping = true
    const processes = [this.edgeProcess, this.simulatorProcess].filter(
      (child): child is ChildProcessWithoutNullStreams => child !== null
    )
    this.edgeProcess = null
    this.simulatorProcess = null
    await Promise.all(processes.map(stopProcessTree))
  }

  private publish(snapshot: LocalRuntimeSnapshot): void {
    this.snapshot = snapshot
    this.onSnapshot(this.getSnapshot())
  }
}

async function resolveEdgeSpec(
  config: LocalRuntimeLaunchConfig
): Promise<SpawnSpec> {
  if (process.platform === 'win32') {
    throw new Error('当前 Uni-Lab-OS 启动脚本暂不支持 Windows')
  }
  const root = resolve(config.osProjectPath)
  const script = join(root, 'scripts', 'start_local_edge_runtime.sh')
  const python = await findFirstExecutable([
    process.env['UNILAB_PYTHON'],
    join(root, '.venv', 'bin', 'python'),
    join(homedir(), '.micromamba', 'envs', 'unilab', 'bin', 'python'),
    'python3'
  ])
  const command = await findFirstExecutable([
    process.env['UNILAB_COMMAND'],
    join(root, '.venv', 'bin', 'unilab'),
    join(homedir(), '.micromamba', 'envs', 'unilab', 'bin', 'unilab'),
    'unilab'
  ])

  return {
    command: 'bash',
    args: [script, resolve(config.graphPath)],
    cwd: root,
    env: {
      ...process.env,
      UNILAB_PYTHON: python,
      UNILAB_COMMAND: command,
      UNILAB_BACKEND: process.env['UNILAB_BACKEND'] ?? 'simple'
    },
    readyUrl: EDGE_READY_URL
  }
}

async function resolveSimulatorSpec(root: string): Promise<SpawnSpec> {
  const manifestPath = join(root, 'unilab-launch.json')
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(
      await readFile(manifestPath, 'utf-8')
    ) as SimulatorManifest
    if (typeof manifest.command !== 'string' || !manifest.command.trim()) {
      throw new Error('unilab-launch.json 缺少 command')
    }
    const command = resolveProjectCommand(root, manifest.command.trim())
    const args = Array.isArray(manifest.args)
      ? manifest.args.map((value) => String(value))
      : []
    const cwd = typeof manifest.cwd === 'string'
      ? resolveWithin(root, manifest.cwd)
      : root
    const readyUrl = typeof manifest.readyUrl === 'string'
      ? manifest.readyUrl
      : undefined
    const readyPort = typeof manifest.readyPort === 'number'
      ? manifest.readyPort
      : undefined
    if (!readyUrl && !validPort(readyPort)) {
      throw new Error(
        'unilab-launch.json 必须提供 readyUrl 或 readyPort'
      )
    }
    return { command, args, cwd, readyUrl, readyPort }
  }

  const scriptCandidates = process.platform === 'win32'
    ? ['start.bat', join('scripts', 'start.bat')]
    : ['start.sh', join('scripts', 'start.sh')]
  const script = scriptCandidates
    .map((candidate) => join(root, candidate))
    .find((candidate) => existsSync(candidate))
  if (!script) {
    throw new Error(
      '仿真项目缺少 unilab-launch.json 或 start.sh/start.bat'
    )
  }
  return process.platform === 'win32'
    ? {
        command: 'cmd.exe',
        args: ['/d', '/s', '/c', script],
        cwd: root
      }
    : {
        command: 'bash',
        args: [script],
        cwd: root
      }
}

function resolveProjectCommand(root: string, command: string): string {
  if (isAbsolute(command)) {
    const normalized = normalize(command)
    if (!isWithin(root, normalized)) {
      throw new Error('仿真启动命令必须位于所选项目目录内')
    }
    return normalized
  }
  if (command.includes('/') || command.includes('\\')) {
    return resolveWithin(root, command)
  }
  return command
}

function resolveWithin(root: string, value: string): string {
  const resolvedRoot = resolve(root)
  const resolvedValue = resolve(resolvedRoot, value)
  if (!isWithin(resolvedRoot, resolvedValue)) {
    throw new Error('启动配置包含项目目录之外的路径')
  }
  return resolvedValue
}

function isWithin(root: string, value: string): boolean {
  return value === root || value.startsWith(`${root}${sep}`)
}

async function waitForSimulator(
  child: ChildProcessWithoutNullStreams,
  spec: SpawnSpec,
  timeoutMs: number
): Promise<void> {
  if (spec.readyUrl) {
    await waitForHttp(spec.readyUrl, child, timeoutMs, () => true)
    return
  }
  if (validPort(spec.readyPort)) {
    await waitForPort('127.0.0.1', spec.readyPort, child, timeoutMs)
    return
  }
  await waitForLivingProcess(child, 800)
}

async function waitForEdgeReady(
  child: ChildProcessWithoutNullStreams,
  timeoutMs: number
): Promise<void> {
  await waitForHttp(EDGE_READY_URL, child, timeoutMs, (payload) => {
    if (!payload || typeof payload !== 'object') return false
    return (payload as { available?: unknown }).available === true
  })
}

async function waitForHttp(
  url: string,
  child: ChildProcessWithoutNullStreams,
  timeoutMs: number,
  accepts: (payload: unknown) => boolean
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    requireLivingProcess(child)
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) })
      if (response.ok && accepts(await response.json())) return
    } catch {
      // 服务启动期间连接失败属于预期状态。
    }
    await delay(250)
  }
  throw new Error(`等待服务就绪超时：${url}`)
}

async function waitForPort(
  host: string,
  port: number,
  child: ChildProcessWithoutNullStreams,
  timeoutMs: number
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    requireLivingProcess(child)
    if (await canConnect(host, port)) return
    await delay(250)
  }
  throw new Error(`等待 OPC 端口就绪超时：${host}:${port}`)
}

function canConnect(host: string, port: number): Promise<boolean> {
  return new Promise((resolveResult) => {
    const socket = createConnection({ host, port })
    const finish = (connected: boolean): void => {
      socket.destroy()
      resolveResult(connected)
    }
    socket.setTimeout(750)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
  })
}

async function waitForLivingProcess(
  child: ChildProcessWithoutNullStreams,
  durationMs: number
): Promise<void> {
  await delay(durationMs)
  requireLivingProcess(child)
}

function requireLivingProcess(child: ChildProcessWithoutNullStreams): void {
  if (child.exitCode !== null || child.signalCode !== null) {
    throw new Error('启动进程在服务就绪前退出，请查看日志')
  }
}

async function stopProcessTree(
  child: ChildProcessWithoutNullStreams
): Promise<void> {
  if (child.exitCode !== null || !child.pid) return
  if (process.platform === 'win32') {
    await new Promise<void>((resolveResult) => {
      const killer = spawn(
        'taskkill.exe',
        ['/pid', String(child.pid), '/t', '/f'],
        { windowsHide: true }
      )
      killer.once('close', () => resolveResult())
      killer.once('error', () => resolveResult())
    })
    return
  }
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    child.kill('SIGTERM')
  }
  await Promise.race([
    new Promise<void>((resolveResult) => child.once('close', () => resolveResult())),
    delay(5_000)
  ])
  if (child.exitCode === null) {
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {
      child.kill('SIGKILL')
    }
  }
}

async function findFirstExecutable(
  candidates: Array<string | undefined>
): Promise<string> {
  for (const candidate of candidates) {
    if (!candidate) continue
    if (!candidate.includes('/') && !candidate.includes('\\')) return candidate
    try {
      await access(candidate, fsConstants.X_OK)
      return candidate
    } catch {
      // 继续尝试下一项。
    }
  }
  throw new Error('找不到启动所需的可执行程序')
}

async function requireFile(path: string, message: string): Promise<void> {
  try {
    await access(path, fsConstants.R_OK)
  } catch {
    throw new Error(`${message}：${path}`)
  }
}

async function requireDirectory(path: string, message: string): Promise<void> {
  try {
    if (!(await stat(path)).isDirectory()) throw new Error(message)
  } catch {
    throw new Error(`${message}：${path}`)
  }
}

function normalizeRequiredPath(value: string, message: string): string {
  const trimmed = value.trim()
  if (!trimmed) throw new Error(message)
  return resolve(trimmed)
}

function validPort(value: number | undefined): value is number {
  return Number.isInteger(value) && Number(value) > 0 && Number(value) <= 65_535
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveResult) => setTimeout(resolveResult, milliseconds))
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
