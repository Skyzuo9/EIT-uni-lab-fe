import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { constants as fsConstants, createWriteStream } from 'node:fs'
import { access, mkdir, stat } from 'node:fs/promises'
import { createConnection } from 'node:net'
import { delimiter, dirname, join, normalize, resolve } from 'node:path'

import {
  IDLE_LOCAL_RUNTIME_SNAPSHOT,
  type LocalRuntimeLaunchConfig,
  type LocalRuntimeProcessKind,
  type LocalRuntimeSnapshot
} from '../shared/localRuntime'

export interface LocalRuntimeSpawnSpec {
  command: string
  args: string[]
  cwd: string
  env: NodeJS.ProcessEnv
}

export interface LocalRuntimeLaunchPlan {
  startSimulator: boolean
  runtimeDirectory: string
  simulator?: LocalRuntimeSpawnSpec
  bridge: LocalRuntimeSpawnSpec
  edge: LocalRuntimeSpawnSpec
}

interface ResolvedRuntimeConfig {
  graphPath: string
  osProjectPath: string
  szlabProjectPath: string
  environmentPath: string
  pythonExecutable: string
  unilabExecutable: string
  bridgeEntrypoint: string
  localConfigPath: string
  runtimeDirectory: string
  profilePath: string
  devicesPath: string
  studioPythonPath: string
  simulatorWorkingDirectory?: string
  startSimulator: boolean
}

interface PortRequirement {
  port: number
  label: string
}

type SnapshotListener = (snapshot: LocalRuntimeSnapshot) => void

export const LOCAL_RUNTIME_PORTS = {
  simulator: 18_765,
  bridgeApi: 8_014,
  edgeHttp: 18_003,
  schedule: 8_892
} as const

const HOST = '127.0.0.1'
const BRIDGE_HEALTH_URL = `http://${HOST}:${LOCAL_RUNTIME_PORTS.bridgeApi}/health`
const ACTION_CATALOG_URL =
  `http://${HOST}:${LOCAL_RUNTIME_PORTS.bridgeApi}/api/runtime/local/actions`
const PROCESS_READY_TIMEOUT_MS = 90_000

export class LocalRuntimeManager {
  private snapshot: LocalRuntimeSnapshot = {
    ...IDLE_LOCAL_RUNTIME_SNAPSHOT
  }
  private edgeProcess: ChildProcessWithoutNullStreams | null = null
  private bridgeProcess: ChildProcessWithoutNullStreams | null = null
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
    await resolveRuntimeConfig(config)
  }

  async start(
    config: LocalRuntimeLaunchConfig
  ): Promise<LocalRuntimeSnapshot> {
    if (this.snapshot.phase !== 'idle' && this.snapshot.phase !== 'failed') {
      throw new Error('本地调试环境正在运行，请先停止当前会话')
    }

    this.stopping = false
    this.publishState('validating', '正在检查项目、Conda 环境与固定端口…')

    try {
      const plan = await resolveLocalRuntimeLaunchPlan(config)
      await requireAvailablePorts(plan.startSimulator)
      await mkdir(this.logsDirectory, { recursive: true })
      await mkdir(plan.runtimeDirectory, { recursive: true })

      if (plan.simulator) {
        this.publishState('starting_simulator', '正在启动本地 OPC UA…')
        this.simulatorProcess = this.spawnManaged(
          'simulator',
          plan.simulator
        )
        this.publishState('waiting_simulator', 'OPC UA 已启动，正在等待 18765 端口…')
        await waitForPort(
          HOST,
          LOCAL_RUNTIME_PORTS.simulator,
          [{ child: this.simulatorProcess, label: 'OPC UA' }],
          PROCESS_READY_TIMEOUT_MS
        )
      }

      this.publishState(
        'starting_bridge',
        plan.startSimulator
          ? 'OPC UA 已就绪，正在启动 SZLab Edge…'
          : '正在启动 SZLab Edge…'
      )
      this.bridgeProcess = this.spawnManaged(
        'bridge',
        plan.bridge
      )
      this.publishState('waiting_bridge', 'SZLab Edge 正在初始化本地服务…')
      await waitForHttp(
        BRIDGE_HEALTH_URL,
        managedChildren([
          ['simulator', this.simulatorProcess],
          ['bridge', this.bridgeProcess]
        ]),
        PROCESS_READY_TIMEOUT_MS,
        (payload) => isRecord(payload) && payload['status'] === 'ok'
      )

      this.publishState('starting_edge', 'SZLab Edge 本地服务已就绪，正在加载设备…')
      this.edgeProcess = this.spawnManaged('edge', plan.edge)
      this.publishState('waiting_edge', 'SZLab Edge 已启动，正在等待设备动作目录…')
      await waitForHttp(
        ACTION_CATALOG_URL,
        managedChildren([
          ['simulator', this.simulatorProcess],
          ['bridge', this.bridgeProcess],
          ['edge', this.edgeProcess]
        ]),
        PROCESS_READY_TIMEOUT_MS,
        (payload) => isRecord(payload) && payload['available'] === true
      )

      this.publishState(
        'ready',
        plan.startSimulator
          ? 'OPC UA 与 SZLab Edge 已就绪'
          : 'SZLab Edge 已就绪'
      )
      return this.getSnapshot()
    } catch (error) {
      const message = errorMessage(error)
      await this.stopProcesses()
      this.publish({
        ...IDLE_LOCAL_RUNTIME_SNAPSHOT,
        phase: 'failed',
        message: '本地调试环境启动失败',
        error: message
      })
      throw new Error(message)
    }
  }

  async stop(): Promise<LocalRuntimeSnapshot> {
    if (this.snapshot.phase === 'idle') return this.getSnapshot()
    this.stopping = true
    this.publishState('stopping', '正在停止 SZLab Edge 与 OPC UA…')
    await this.stopProcesses()
    this.stopping = false
    this.publish({ ...IDLE_LOCAL_RUNTIME_SNAPSHOT })
    return this.getSnapshot()
  }

  private spawnManaged(
    kind: LocalRuntimeProcessKind,
    spec: LocalRuntimeSpawnSpec
  ): ChildProcessWithoutNullStreams {
    const child = spawn(spec.command, spec.args, {
      cwd: spec.cwd,
      env: spec.env,
      detached: process.platform !== 'win32',
      shell: false,
      windowsHide: true
    })
    const logStream = createWriteStream(
      join(this.logsDirectory, `${kind}.log`),
      { flags: 'a' }
    )
    logStream.write(`\n[launcher] ${new Date().toISOString()} starting\n`)
    child.stdout.pipe(logStream, { end: false })
    child.stderr.pipe(logStream, { end: false })
    child.once('error', (error) => {
      logStream.write(`\n[launcher] ${error.message}\n`)
    })
    child.once('close', (code, signal) => {
      logStream.end(
        `\n[launcher] process exited code=${String(code)} signal=${String(signal)}\n`
      )
      this.clearProcess(kind, child)
      if (!this.stopping && this.snapshot.phase !== 'failed') {
        void this.handleUnexpectedExit(kind)
      }
    })
    return child
  }

  private clearProcess(
    kind: LocalRuntimeProcessKind,
    child: ChildProcessWithoutNullStreams
  ): void {
    if (kind === 'simulator' && this.simulatorProcess === child) {
      this.simulatorProcess = null
    }
    if (kind === 'bridge' && this.bridgeProcess === child) {
      this.bridgeProcess = null
    }
    if (kind === 'edge' && this.edgeProcess === child) {
      this.edgeProcess = null
    }
  }

  private async handleUnexpectedExit(
    kind: LocalRuntimeProcessKind
  ): Promise<void> {
    const label = processLabel(kind)
    await this.stopProcesses()
    this.publish({
      ...IDLE_LOCAL_RUNTIME_SNAPSHOT,
      phase: 'failed',
      message: `${label} 已意外退出`,
      failedProcess: kind,
      error: '请打开日志目录查看本地启动日志'
    })
  }

  private async stopProcesses(): Promise<void> {
    this.stopping = true
    const processes = [
      this.edgeProcess,
      this.bridgeProcess,
      this.simulatorProcess
    ]
    this.edgeProcess = null
    this.bridgeProcess = null
    this.simulatorProcess = null
    for (const child of processes) {
      if (child) await stopProcessTree(child)
    }
  }

  private publishState(
    phase: LocalRuntimeSnapshot['phase'],
    message: string
  ): void {
    this.publish({
      phase,
      message,
      simulatorRunning: Boolean(this.simulatorProcess),
      bridgeRunning: Boolean(this.bridgeProcess),
      edgeRunning: Boolean(this.edgeProcess)
    })
  }

  private publish(snapshot: LocalRuntimeSnapshot): void {
    this.snapshot = snapshot
    this.onSnapshot(this.getSnapshot())
  }
}

export async function resolveLocalRuntimeLaunchPlan(
  config: LocalRuntimeLaunchConfig
): Promise<LocalRuntimeLaunchPlan> {
  const resolvedConfig = await resolveRuntimeConfig(config)
  return {
    startSimulator: resolvedConfig.startSimulator,
    runtimeDirectory: resolvedConfig.runtimeDirectory,
    simulator: resolvedConfig.startSimulator
      ? simulatorSpec(resolvedConfig)
      : undefined,
    bridge: bridgeSpec(resolvedConfig),
    edge: edgeSpec(resolvedConfig)
  }
}

async function resolveRuntimeConfig(
  config: LocalRuntimeLaunchConfig
): Promise<ResolvedRuntimeConfig> {
  if (process.platform === 'win32') {
    throw new Error('当前 SZLab 本地调试命令仅支持 macOS 和 Linux')
  }

  const graphPath = normalizeRequiredPath(config.graphPath, '请选择设备图 JSON')
  const osProjectPath = normalizeRequiredPath(
    config.osProjectPath,
    '请选择 Uni-Lab-OS 项目根目录'
  )
  const szlabProjectPath = normalizeRequiredPath(
    config.szlabProjectPath,
    '请选择 Uni-Lab-SZLab 项目根目录'
  )
  const environmentPath = normalizeRequiredPath(
    config.environmentPath,
    '请选择 unilab Conda 环境目录'
  )

  if (!graphPath.toLowerCase().endsWith('.json')) {
    throw new Error('设备图必须是 JSON 文件')
  }
  await requireFile(graphPath, '设备图 JSON 不存在')
  await requireDirectory(osProjectPath, 'Uni-Lab-OS 项目根目录不存在')
  await requireDirectory(szlabProjectPath, 'Uni-Lab-SZLab 项目根目录不存在')
  await requireDirectory(environmentPath, 'unilab Conda 环境目录不存在')

  const pythonExecutable = join(environmentPath, 'bin', 'python')
  const unilabExecutable = join(environmentPath, 'bin', 'unilab')
  await requireExecutable(pythonExecutable, '所选 Conda 环境缺少 bin/python')
  await requireExecutable(unilabExecutable, '所选 Conda 环境缺少 bin/unilab')

  const bridgeEntrypoint = join(
    szlabProjectPath,
    'deployment',
    'local_bridge_entrypoint.py'
  )
  const localConfigPath = join(
    szlabProjectPath,
    'deployment',
    'local_config.py'
  )
  await requireFile(bridgeEntrypoint, 'Uni-Lab-SZLab 缺少 Edge 本地服务入口')
  await requireFile(localConfigPath, 'Uni-Lab-SZLab 缺少本地配置')

  const profilePath = await requireFirstFile(
    [
      join(szlabProjectPath, 'packages', 'szlab_poly_studio', 'package.yaml'),
      join(
        szlabProjectPath,
        'szlab_poly_studio',
        'profiles',
        'default',
        'package.yaml'
      )
    ],
    'Uni-Lab-SZLab 缺少 szlab_poly_studio Profile'
  )
  const devicesPath = await requireFirstDirectory(
    [
      join(
        szlabProjectPath,
        'packages',
        'szlab_poly_studio',
        'szlab_poly_studio'
      ),
      join(szlabProjectPath, 'szlab_poly_studio')
    ],
    'Uni-Lab-SZLab 缺少 szlab_poly_studio 设备包'
  )

  let simulatorWorkingDirectory: string | undefined
  if (config.startSimulator) {
    const simulatorProjectPath = normalizeRequiredPath(
      config.simulatorProjectPath,
      '请选择 PLC-Sim 项目根目录'
    )
    await requireDirectory(simulatorProjectPath, 'PLC-Sim 项目根目录不存在')
    simulatorWorkingDirectory = await resolveSimulatorWorkingDirectory(
      simulatorProjectPath
    )
  }

  return {
    graphPath,
    osProjectPath,
    szlabProjectPath,
    environmentPath,
    pythonExecutable,
    unilabExecutable,
    bridgeEntrypoint,
    localConfigPath,
    runtimeDirectory: join(szlabProjectPath, 'runtime', 'ideawit-e2e'),
    profilePath,
    devicesPath,
    studioPythonPath: dirname(devicesPath),
    simulatorWorkingDirectory,
    startSimulator: config.startSimulator
  }
}

function simulatorSpec(config: ResolvedRuntimeConfig): LocalRuntimeSpawnSpec {
  if (!config.simulatorWorkingDirectory) {
    throw new Error('OPC UA 启动目录尚未解析')
  }
  return {
    command: config.pythonExecutable,
    args: ['-m', 'gui.backend', '--host', HOST, '--port', String(LOCAL_RUNTIME_PORTS.simulator)],
    cwd: config.simulatorWorkingDirectory,
    env: runtimeEnvironment(config)
  }
}

function bridgeSpec(config: ResolvedRuntimeConfig): LocalRuntimeSpawnSpec {
  return {
    command: config.pythonExecutable,
    args: [
      config.bridgeEntrypoint,
      '--host',
      HOST,
      '--schedule-port',
      String(LOCAL_RUNTIME_PORTS.schedule),
      '--api-port',
      String(LOCAL_RUNTIME_PORTS.bridgeApi),
      '--execution-http-url',
      `http://${HOST}:${LOCAL_RUNTIME_PORTS.edgeHttp}`,
      '--journal-path',
      join('runtime', 'ideawit-e2e', 'quick-debug.sqlite3'),
      '--profile',
      config.profilePath
    ],
    cwd: config.szlabProjectPath,
    env: runtimeEnvironment(config)
  }
}

function edgeSpec(config: ResolvedRuntimeConfig): LocalRuntimeSpawnSpec {
  return {
    command: config.unilabExecutable,
    args: [
      '--graph',
      config.graphPath,
      '--config',
      config.localConfigPath,
      '--working_dir',
      config.runtimeDirectory,
      '--devices',
      config.devicesPath,
      '--external_devices_only',
      '--backend',
      'ros',
      '--app_bridges',
      'websocket',
      'fastapi',
      '--port',
      String(LOCAL_RUNTIME_PORTS.edgeHttp),
      '--schedule_addr',
      `ws://${HOST}:${LOCAL_RUNTIME_PORTS.schedule}/api/v1/ws/schedule`,
      '--disable_browser',
      '--skip_env_check'
    ],
    cwd: config.szlabProjectPath,
    env: {
      ...runtimeEnvironment(config),
      UNILABOS_RUNTIME_DB: edgeRuntimeDatabasePath(config.runtimeDirectory),
      ROS_DOMAIN_ID: '42'
    }
  }
}

function edgeRuntimeDatabasePath(
  runtimeDirectory: string,
  now = new Date()
): string {
  const timestamp = [
    now.getFullYear(),
    twoDigits(now.getMonth() + 1),
    twoDigits(now.getDate()),
    '-',
    twoDigits(now.getHours()),
    twoDigits(now.getMinutes()),
    twoDigits(now.getSeconds())
  ].join('')
  return join(runtimeDirectory, `edge-runtime-${timestamp}.sqlite3`)
}

function twoDigits(value: number): string {
  return String(value).padStart(2, '0')
}

function runtimeEnvironment(
  config: ResolvedRuntimeConfig
): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PYTHONPATH: mergePathList([
      config.osProjectPath,
      config.studioPythonPath,
      process.env['PYTHONPATH']
    ]),
    PYTHONUNBUFFERED: '1'
  }
}

function mergePathList(values: Array<string | undefined>): string {
  return values.filter((value): value is string => Boolean(value)).join(delimiter)
}

async function resolveSimulatorWorkingDirectory(
  simulatorProjectPath: string
): Promise<string> {
  const candidates = [
    join(simulatorProjectPath, 'OpcUaSim'),
    simulatorProjectPath
  ]
  for (const candidate of candidates) {
    try {
      await requireFile(
        join(candidate, 'gui', 'backend.py'),
        'PLC-Sim 缺少 OpcUaSim/gui/backend.py'
      )
      return candidate
    } catch {
      // 继续兼容用户直接选择 OpcUaSim 目录的情况。
    }
  }
  throw new Error(
    `所选目录不是有效的 PLC-Sim 项目：${simulatorProjectPath}`
  )
}

async function requireAvailablePorts(startSimulator: boolean): Promise<void> {
  const requirements: PortRequirement[] = [
    { port: LOCAL_RUNTIME_PORTS.bridgeApi, label: 'SZLab Edge API' },
    { port: LOCAL_RUNTIME_PORTS.edgeHttp, label: 'SZLab Edge HTTP' },
    { port: LOCAL_RUNTIME_PORTS.schedule, label: 'Schedule WebSocket' }
  ]
  if (startSimulator) {
    requirements.unshift({
      port: LOCAL_RUNTIME_PORTS.simulator,
      label: 'OPC UA'
    })
  }
  for (const requirement of requirements) {
    if (await canConnect(HOST, requirement.port)) {
      throw new Error(
        `${requirement.label} 端口 ${requirement.port} 已被占用，请先停止已有进程`
      )
    }
  }
}

async function waitForHttp(
  url: string,
  children: ManagedChild[],
  timeoutMs: number,
  accepts: (payload: unknown) => boolean
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    requireLivingProcesses(children)
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

interface ManagedChild {
  kind: LocalRuntimeProcessKind
  child: ChildProcessWithoutNullStreams
  label: string
}

function managedChildren(
  children: Array<[
    LocalRuntimeProcessKind,
    ChildProcessWithoutNullStreams | null
  ]>
): ManagedChild[] {
  return children.flatMap(([kind, child]) => child
    ? [{ kind, child, label: processLabel(kind) }]
    : [])
}

async function waitForPort(
  host: string,
  port: number,
  children: Array<{ child: ChildProcessWithoutNullStreams; label: string }>,
  timeoutMs: number
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    for (const { child, label } of children) requireLivingProcess(child, label)
    if (await canConnect(host, port)) return
    await delay(250)
  }
  throw new Error(`等待 OPC UA 端口就绪超时：${host}:${port}`)
}

function canConnect(host: string, port: number): Promise<boolean> {
  return new Promise((resolveResult) => {
    const socket = createConnection({ host, port })
    let settled = false
    const finish = (connected: boolean): void => {
      if (settled) return
      settled = true
      socket.destroy()
      resolveResult(connected)
    }
    socket.setTimeout(750)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
  })
}

function requireLivingProcesses(children: ManagedChild[]): void {
  for (const { child, label } of children) requireLivingProcess(child, label)
}

function requireLivingProcess(
  child: ChildProcessWithoutNullStreams,
  label: string
): void {
  if (child.exitCode !== null || child.signalCode !== null) {
    throw new Error(`${label} 在服务就绪前退出，请查看日志`)
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

async function requireFirstFile(
  candidates: string[],
  message: string
): Promise<string> {
  for (const candidate of candidates) {
    try {
      await access(candidate, fsConstants.R_OK)
      return candidate
    } catch {
      // 继续尝试兼容的仓库布局。
    }
  }
  throw new Error(`${message}：${candidates.join(' 或 ')}`)
}

async function requireFirstDirectory(
  candidates: string[],
  message: string
): Promise<string> {
  for (const candidate of candidates) {
    try {
      if ((await stat(candidate)).isDirectory()) return candidate
    } catch {
      // 继续尝试兼容的仓库布局。
    }
  }
  throw new Error(`${message}：${candidates.join(' 或 ')}`)
}

async function requireExecutable(path: string, message: string): Promise<void> {
  try {
    await access(path, fsConstants.X_OK)
  } catch {
    throw new Error(`${message}：${path}`)
  }
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
  return normalize(resolve(trimmed))
}

function processLabel(kind: LocalRuntimeProcessKind): string {
  if (kind === 'simulator') return 'OPC UA'
  return 'SZLab Edge'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveResult) => setTimeout(resolveResult, milliseconds))
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
