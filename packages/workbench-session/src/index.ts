import {
  spawn,
  type ChildProcessWithoutNullStreams
} from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { constants as fsConstants, createWriteStream } from 'node:fs'
import {
  access,
  mkdir,
  readFile,
  realpath,
  rename,
  stat,
  writeFile
} from 'node:fs/promises'
import { createConnection, createServer } from 'node:net'
import { homedir } from 'node:os'
import {
  delimiter,
  dirname,
  isAbsolute,
  join,
  normalize,
  relative,
  resolve
} from 'node:path'

import {
  activatedCondaEnvironment,
  discoverDefaultCondaEnvironment,
  PLC_SIMULATOR_GUI_PORT,
  PLC_SIMULATOR_OPC_UA_PORT,
  resolvePlcSimulatorLaunch,
  runtimeExecutablePaths,
  validRuntimeEnvironment
} from '@unilab/local-environment'

import {
  startManagedWorkbenchAgent,
  type ManagedWorkbenchAgent,
  type ManagedWorkbenchAgentOptions,
  type WorkbenchAgentIdentity
} from './agent-sidecar'
import { WorkbenchLaunchError } from './launch-error'
import {
  readLocalEnvironmentConfiguration,
  writeLocalEnvironmentConfigurationFile
} from './local-environment-configuration'
import { waitForWorkbenchReadiness } from './readiness'
import { prepareWorkbenchState } from './workbench-state'
export { parseWorkspacePackageMountProjection } from './readiness'
export {
  createWorkbenchDiagnosticBundle,
  createWorkbenchStateBackup,
  prepareWorkbenchState,
  restoreWorkbenchStateBackup,
  WORKBENCH_STATE_SCHEMA_VERSION,
  WorkbenchStateError,
  type WorkbenchStateBackup,
  type WorkbenchStateManifest,
  type WorkbenchStatePreparation,
  type WorkbenchStateQuotas
} from './workbench-state'
export type WorkbenchSessionPhase =
  | 'idle'
  | 'validating'
  | 'starting'
  | 'waiting'
  | 'ready'
  | 'stopping'
  | 'failed'

export interface WorkbenchSessionDiagnostic {
  code:
    | 'invalid_workspace'
    | 'invalid_os_project'
    | 'python_environment_not_found'
    | 'port_conflict'
    | 'os_start_failed'
    | 'os_readiness_failed'
    | 'os_exited'
  message: string
  recovery: string
}

export type WorkbenchRuntimeMode = 'normal' | 'dry-run'

export interface WorkbenchSessionIdentity {
  workspacePath: string
  osProjectPath: string
  osRuntimeSource: 'checkout' | 'environment'
  environmentPath: string
  graphPath: string
  graphFingerprint: string
  backendUrl: string
  pid: number
  generation: string
  logPath: string
  mode: WorkbenchRuntimeMode
  packageMounts: WorkspacePackageMountProjection | null
  agent: WorkbenchAgentIdentity | null
}

export type WorkbenchEnvironmentLogKind = 'os' | 'plc-sim' | 'agent'

export type WorkbenchPlcSimulatorPhase =
  | 'idle'
  | 'validating'
  | 'starting'
  | 'waiting'
  | 'ready'
  | 'stopping'
  | 'failed'

export interface WorkbenchPlcSimulatorSnapshot {
  phase: WorkbenchPlcSimulatorPhase
  message: string
  projectPath: string
  pid: number | null
  guiUrl: string
  opcUaUrl: string
  logPath: string
  diagnostic: string | null
}

export interface WorkspacePackageMount {
  packageId: string
  distributionName: string
  version: string
  namespace: string
  editable: boolean
  readOnly: boolean
  sourceKind: 'workspace'
  importRootUri: string
  packageRootUri: string
  contentDigest: string
  catalogDigest: string
}

export interface WorkspacePackageMountProjection {
  schemaVersion: 'workspace-package-mounts/v1'
  editablePackageId: string
  dependencyRevision: string
  catalogRevision: string
  mountRevision: string
  items: readonly WorkspacePackageMount[]
}

export interface WorkbenchSessionSnapshot {
  phase: WorkbenchSessionPhase
  message: string
  configuredGraphPath: string
  identity: WorkbenchSessionIdentity | null
  diagnostic: WorkbenchSessionDiagnostic | null
  plcSimulator: WorkbenchPlcSimulatorSnapshot
}

export interface ManagedLocalWorkbenchSessionOptions {
  workspacePath: string
  osProjectPath?: string
  environmentPath?: string
  graphPath?: string
  backendPort?: number
  hostLinkPort?: number
  readinessTimeoutMs?: number
  environment?: NodeJS.ProcessEnv
  homeDirectory?: string
  platform?: NodeJS.Platform
  enableAgent?: boolean
  agentAppPath?: string
  agentBrandIconPath?: string
  agentStarter?: (
    options: ManagedWorkbenchAgentOptions
  ) => Promise<ManagedWorkbenchAgent>
  plcSimulatorProjectPath?: string
  plcSimulatorGuiPort?: number
  plcSimulatorOpcUaPort?: number
  runtimeMode?: WorkbenchRuntimeMode
}

export interface WorkbenchSession {
  getSnapshot(): WorkbenchSessionSnapshot
  onDidChange(listener: (snapshot: WorkbenchSessionSnapshot) => void): {
    dispose(): void
  }
  start(): Promise<WorkbenchSessionSnapshot>
  stop(): Promise<WorkbenchSessionSnapshot>
  stopAll(): Promise<WorkbenchSessionSnapshot>
  restart(): Promise<WorkbenchSessionSnapshot>
  readLogTail(maxBytes?: number): Promise<string>
  readEnvironmentLog(
    kind: WorkbenchEnvironmentLogKind,
    maxBytes?: number
  ): Promise<string>
  configureGraph(graphPath: string): Promise<WorkbenchSessionSnapshot>
  configurePlcSimulator(projectPath: string): Promise<WorkbenchSessionSnapshot>
  startPlcSimulator(): Promise<WorkbenchSessionSnapshot>
  stopPlcSimulator(): Promise<WorkbenchSessionSnapshot>
  setRuntimeMode(mode: WorkbenchRuntimeMode): Promise<WorkbenchSessionSnapshot>
}

interface ResolvedWorkbenchLaunch {
  identity: WorkbenchSessionIdentity
  command: string
  args: string[]
  cwd: string
  environment: NodeJS.ProcessEnv
  runtimeDirectory: string
  sessionManifestPath: string
}

const LOOPBACK_HOST = '127.0.0.1'
const DEFAULT_READINESS_TIMEOUT_MS = 90_000
const LOCAL_ENVIRONMENT_CONFIG = 'environment.local.json'

/** Create the single managed OS lifecycle owned by one Workbench window. */
export function createManagedLocalWorkbenchSession(
  options: ManagedLocalWorkbenchSessionOptions
): WorkbenchSession {
  return new ManagedLocalWorkbenchSession(options)
}

class ManagedLocalWorkbenchSession implements WorkbenchSession {
  private snapshot: WorkbenchSessionSnapshot
  private readonly listeners = new Set<(
    snapshot: WorkbenchSessionSnapshot
  ) => void>()
  private child: ChildProcessWithoutNullStreams | null = null
  private plcSimulatorChild: ChildProcessWithoutNullStreams | null = null
  private agent: ManagedWorkbenchAgent | null = null
  private starting: Promise<WorkbenchSessionSnapshot> | null = null
  private stopping: Promise<WorkbenchSessionSnapshot> | null = null
  private plcSimulatorStarting: Promise<WorkbenchSessionSnapshot> | null = null
  private plcSimulatorStopping: Promise<WorkbenchSessionSnapshot> | null = null
  private readonly expectedExits = new WeakSet<ChildProcessWithoutNullStreams>()
  private readonly expectedPlcSimulatorExits = new WeakSet<
    ChildProcessWithoutNullStreams
  >()
  private stopRequested = false
  private plcSimulatorStopRequested = false
  private selectedMode: WorkbenchRuntimeMode
  private selectedGraphPath: string

  constructor(private readonly options: ManagedLocalWorkbenchSessionOptions) {
    this.selectedMode = options.runtimeMode ?? 'normal'
    this.selectedGraphPath = options.graphPath
      ?? join('deployment', 'graphs', 'szlab-local-debug.json')
    this.snapshot = {
      phase: 'idle',
      message: '尚未启动 Uni-Lab OS',
      configuredGraphPath: this.selectedGraphPath,
      identity: null,
      diagnostic: null,
      plcSimulator: idlePlcSimulatorSnapshot(
        options.plcSimulatorProjectPath
          ?? options.environment?.['UNILAB_PLC_SIM_PROJECT']
          ?? process.env['UNILAB_PLC_SIM_PROJECT']
          ?? ''
      )
    }
  }

  getSnapshot(): WorkbenchSessionSnapshot {
    return cloneSnapshot(this.snapshot)
  }

  onDidChange(listener: (snapshot: WorkbenchSessionSnapshot) => void): {
    dispose(): void
  } {
    this.listeners.add(listener)
    return { dispose: () => this.listeners.delete(listener) }
  }

  start(): Promise<WorkbenchSessionSnapshot> {
    if (this.stopping) return this.stopping.then(() => this.start())
    if (this.snapshot.phase === 'ready') return Promise.resolve(this.getSnapshot())
    if (this.starting) return this.starting
    this.stopRequested = false
    const starting = this.startManaged()
    this.starting = starting
    return starting.finally(() => {
      if (this.starting === starting) this.starting = null
    })
  }

  stop(): Promise<WorkbenchSessionSnapshot> {
    this.stopRequested = true
    if (this.stopping) return this.stopping
    let trackedStop: Promise<WorkbenchSessionSnapshot>
    trackedStop = this.stopManaged().finally(() => {
      if (this.stopping === trackedStop) this.stopping = null
    })
    this.stopping = trackedStop
    return trackedStop
  }

  private async stopManaged(): Promise<WorkbenchSessionSnapshot> {
    const starting = this.starting
    const agent = this.agent
    this.agent = null
    let agentStopError: unknown = null
    if (this.child) {
      this.publish({
        ...this.snapshot,
        phase: 'stopping',
        message: '正在安全停止 Uni-Lab OS…',
        diagnostic: null
      })
      await this.stopCurrentOsChild()
    }
    if (starting) {
      try {
        await starting
      } catch {
        // 停止中的世代可能在就绪探测退出时拒绝。
      }
    }
    await this.stopCurrentOsChild()
    if (agent) {
      try {
        await stopManagedAgent(agent)
      } catch (error) {
        agentStopError = error
      }
    }
    this.publish({
      phase: 'idle',
      message: 'Uni-Lab OS 已停止',
      identity: null,
      diagnostic: null
    })
    if (agentStopError) throw agentStopError
    return this.getSnapshot()
  }

  async stopAll(): Promise<WorkbenchSessionSnapshot> {
    const results = await Promise.allSettled([
      this.stop(),
      this.stopPlcSimulator()
    ])
    const failures = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected'
    )
    if (failures.length) {
      throw new AggregateError(
        failures.map(result => result.reason),
        'Workbench 环境停止时发生错误；OS 与 PLC-Sim 已完成尽力清理'
      )
    }
    return this.getSnapshot()
  }

  async restart(): Promise<WorkbenchSessionSnapshot> {
    await this.stop()
    return await this.start()
  }

  async readLogTail(maxBytes = 64 * 1024): Promise<string> {
    return await readLogTailFromPath(this.snapshot.identity?.logPath, maxBytes)
  }

  async readEnvironmentLog(
    kind: WorkbenchEnvironmentLogKind,
    maxBytes = 64 * 1024
  ): Promise<string> {
    const logPath = kind === 'os'
      ? this.snapshot.identity?.logPath
      : kind === 'plc-sim'
        ? this.snapshot.plcSimulator.logPath
        : this.snapshot.identity?.agent?.logPath
    return await readLogTailFromPath(logPath, maxBytes)
  }

  async configureGraph(graphPath: string): Promise<WorkbenchSessionSnapshot> {
    const normalizedGraphPath = graphPath.trim()
    if (!normalizedGraphPath || normalizedGraphPath.includes('\0')) {
      throw new Error('设备图路径不能为空或包含非法字符')
    }
    await writeLocalEnvironmentConfiguration(this.options.workspacePath, {
      graphPath: normalizedGraphPath,
      plcSimulatorProjectPath: this.snapshot.plcSimulator.projectPath,
      runtimeMode: this.selectedMode
    })
    this.selectedGraphPath = normalizedGraphPath
    this.publish({
      ...this.snapshot,
      configuredGraphPath: normalizedGraphPath
    })
    return this.getSnapshot()
  }

  async configurePlcSimulator(
    projectPath: string
  ): Promise<WorkbenchSessionSnapshot> {
    if (this.plcSimulatorChild || this.plcSimulatorStarting) {
      throw new Error('请先停止 PLC-Sim，再修改项目目录')
    }
    const normalizedProjectPath = projectPath.trim()
    if (normalizedProjectPath.includes('\0')) {
      throw new Error('PLC-Sim 项目目录包含非法字符')
    }
    await writeLocalEnvironmentConfiguration(this.options.workspacePath, {
      graphPath: this.selectedGraphPath,
      plcSimulatorProjectPath: normalizedProjectPath,
      runtimeMode: this.selectedMode
    })
    this.publishPlcSimulator({
      ...idlePlcSimulatorSnapshot(normalizedProjectPath),
      message: normalizedProjectPath
        ? 'PLC-Sim 项目目录已保存'
        : 'PLC-Sim 项目目录已清除'
    })
    return this.getSnapshot()
  }

  async setRuntimeMode(
    mode: WorkbenchRuntimeMode
  ): Promise<WorkbenchSessionSnapshot> {
    if (mode !== 'normal' && mode !== 'dry-run') {
      throw new Error(`不支持的 OS 运行模式：${String(mode)}`)
    }
    if (this.snapshot.identity?.mode === mode) return this.getSnapshot()
    await writeLocalEnvironmentConfiguration(this.options.workspacePath, {
      graphPath: this.selectedGraphPath,
      plcSimulatorProjectPath: this.snapshot.plcSimulator.projectPath,
      runtimeMode: mode
    })
    this.selectedMode = mode
    return await this.restart()
  }

  startPlcSimulator(): Promise<WorkbenchSessionSnapshot> {
    if (this.plcSimulatorStopping) {
      return this.plcSimulatorStopping.then(() => this.startPlcSimulator())
    }
    if (this.snapshot.plcSimulator.phase === 'ready') {
      return Promise.resolve(this.getSnapshot())
    }
    if (this.plcSimulatorStarting) return this.plcSimulatorStarting
    this.plcSimulatorStopRequested = false
    const starting = this.startManagedPlcSimulator()
    this.plcSimulatorStarting = starting
    return starting.finally(() => {
      if (this.plcSimulatorStarting === starting) {
        this.plcSimulatorStarting = null
      }
    })
  }

  stopPlcSimulator(): Promise<WorkbenchSessionSnapshot> {
    this.plcSimulatorStopRequested = true
    if (this.plcSimulatorStopping) return this.plcSimulatorStopping
    let trackedStop: Promise<WorkbenchSessionSnapshot>
    trackedStop = this.stopManagedPlcSimulator().finally(() => {
      if (this.plcSimulatorStopping === trackedStop) {
        this.plcSimulatorStopping = null
      }
    })
    this.plcSimulatorStopping = trackedStop
    return trackedStop
  }

  private async stopManagedPlcSimulator(): Promise<WorkbenchSessionSnapshot> {
    const starting = this.plcSimulatorStarting
    const projectPath = this.snapshot.plcSimulator.projectPath
    const child = this.plcSimulatorChild
    if (child) {
      this.publishPlcSimulator({
        ...this.snapshot.plcSimulator,
        phase: 'stopping',
        message: '正在停止 PLC-Sim…',
        diagnostic: null
      })
      await this.stopCurrentPlcSimulatorChild()
    }
    if (starting) {
      try {
        await starting
      } catch {
        // 停止中的 PLC-Sim 可能在端口探测退出时拒绝。
      }
    }
    await this.stopCurrentPlcSimulatorChild()
    this.publishPlcSimulator({
      ...idlePlcSimulatorSnapshot(projectPath),
      message: 'PLC-Sim 已停止'
    })
    return this.getSnapshot()
  }

  private async stopCurrentPlcSimulatorChild(): Promise<void> {
    const child = this.plcSimulatorChild
    if (!child) return
    this.expectedPlcSimulatorExits.add(child)
    await stopProcessTree(child)
    if (this.plcSimulatorChild === child) this.plcSimulatorChild = null
  }

  private async startManagedPlcSimulator(): Promise<WorkbenchSessionSnapshot> {
    const identity = this.snapshot.identity
    if (!identity) {
      throw new Error('请先校验 Workbench 环境，再启动 PLC-Sim')
    }
    const projectPath = this.snapshot.plcSimulator.projectPath
    this.publishPlcSimulator({
      ...this.snapshot.plcSimulator,
      phase: 'validating',
      message: '正在校验 PLC-Sim 与 Python 环境…',
      diagnostic: null
    })
    try {
      const plan = await resolvePlcSimulatorLaunch({
        environmentPath: identity.environmentPath,
        projectPath,
        platform: this.options.platform,
        inheritedEnvironment: this.options.environment,
        guiPort: this.options.plcSimulatorGuiPort,
        opcUaPort: this.options.plcSimulatorOpcUaPort
      })
      await Promise.all([
        requireAvailableLoopbackPort(plan.guiPort, 'PLC-Sim Web GUI'),
        requireAvailableLoopbackPort(plan.opcUaPort, 'PLC-Sim OPC UA')
      ])
      if (this.plcSimulatorStopRequested) {
        this.publishPlcSimulator({
          ...idlePlcSimulatorSnapshot(projectPath),
          message: 'PLC-Sim 已停止'
        })
        return this.getSnapshot()
      }
      const logPath = join(
        identity.workspacePath,
        '.unilabos',
        'logs',
        'workbench',
        'plc-sim.log'
      )
      await mkdir(dirname(logPath), { recursive: true })
      if (this.plcSimulatorStopRequested) return this.getSnapshot()
      const log = createWriteStream(logPath, { flags: 'a' })
      log.write(`[workbench] ${new Date().toISOString()} starting PLC-Sim\n`)
      this.publishPlcSimulator({
        phase: 'starting',
        message: '正在启动 PLC-Sim…',
        projectPath: plan.projectPath,
        pid: null,
        guiUrl: plan.guiUrl,
        opcUaUrl: plan.opcUaUrl,
        logPath,
        diagnostic: null
      })
      const child = spawn(plan.command, plan.args, {
        cwd: plan.cwd,
        env: plan.environment,
        detached: process.platform !== 'win32',
        shell: false,
        windowsHide: true
      })
      this.plcSimulatorChild = child
      const pid = requireProcessId(child.pid)
      child.stdout.pipe(log, { end: false })
      child.stderr.pipe(log, { end: false })
      child.once('error', error => {
        log.write(`[workbench] PLC-Sim spawn error: ${error.message}\n`)
      })
      child.once('close', (code, signal) => {
        log.end(
          `[workbench] PLC-Sim exited code=${String(code)} signal=${String(signal)}\n`
        )
        if (this.plcSimulatorChild === child) this.plcSimulatorChild = null
        const expectedExit = this.expectedPlcSimulatorExits.delete(child)
        if (!expectedExit) {
          this.publishPlcSimulator({
            ...this.snapshot.plcSimulator,
            phase: 'failed',
            message: 'PLC-Sim 已意外退出',
            pid: null,
            diagnostic: `进程退出（code=${String(code)}, signal=${String(signal)}）`
          })
        }
      })
      this.publishPlcSimulator({
        ...this.snapshot.plcSimulator,
        phase: 'waiting',
        message: 'PLC-Sim 进程已启动，正在等待 Web GUI…',
        pid
      })
      await waitForLoopbackPort(
        plan.guiPort,
        child,
        this.options.readinessTimeoutMs ?? DEFAULT_READINESS_TIMEOUT_MS
      )
      if (this.plcSimulatorStopRequested) return this.getSnapshot()
      this.publishPlcSimulator({
        ...this.snapshot.plcSimulator,
        phase: 'ready',
        message: 'PLC-Sim 已就绪；可上传 PLC 变量表',
        pid,
        diagnostic: null
      })
      return this.getSnapshot()
    } catch (error) {
      const child = this.plcSimulatorChild
      if (child) {
        this.expectedPlcSimulatorExits.add(child)
        await stopProcessTree(child)
        if (this.plcSimulatorChild === child) this.plcSimulatorChild = null
      }
      const message = error instanceof Error ? error.message : String(error)
      if (this.plcSimulatorStopRequested) {
        this.publishPlcSimulator({
          ...idlePlcSimulatorSnapshot(projectPath),
          message: 'PLC-Sim 已停止'
        })
        return this.getSnapshot()
      }
      this.publishPlcSimulator({
        ...this.snapshot.plcSimulator,
        phase: 'failed',
        message: 'PLC-Sim 启动失败',
        pid: null,
        diagnostic: message
      })
      throw new Error(message)
    }
  }

  private publishPlcSimulator(
    plcSimulator: WorkbenchPlcSimulatorSnapshot
  ): void {
    this.publish({
      ...this.snapshot,
      plcSimulator
    })
  }

  private async stopCurrentOsChild(): Promise<void> {
    const child = this.child
    if (!child) return
    this.expectedExits.add(child)
    await stopProcessTree(child)
    if (this.child === child) this.child = null
  }

  private async startAgentForLaunch(
    launch: ResolvedWorkbenchLaunch
  ): Promise<void> {
    if (!this.options.enableAgent) return
    const packageMounts = launch.identity.packageMounts
    const hasEditableMount = packageMounts?.items.some(
      item => item.packageId === packageMounts.editablePackageId
    ) ?? false
    if (!hasEditableMount) throw new Error('OS 未发布 Editable Package 挂载')
    try {
      const agent = await (
        this.options.agentStarter ?? startManagedWorkbenchAgent
      )({
        workspacePath: launch.identity.workspacePath,
        environment: launch.environment,
        appPath: this.options.agentAppPath,
        brandIconPath: this.options.agentBrandIconPath,
        onUnexpectedExit: message => {
          if (!this.snapshot.identity) return
          this.publish({
            ...this.snapshot,
            identity: {
              ...this.snapshot.identity,
              agent: failedAgentIdentity(launch, message)
            }
          })
        }
      })
      if (this.stopRequested) {
        try {
          await stopManagedAgent(agent)
        } catch {
          // OS/PLC process cleanup remains independent from Agent teardown.
        }
        return
      }
      this.agent = agent
      launch.identity.agent = agent.identity
    } catch (error) {
      if (this.stopRequested) return
      launch.identity.agent = failedAgentIdentity(
        launch,
        error instanceof Error ? error.message : String(error)
      )
    }
  }

  private async startManaged(): Promise<WorkbenchSessionSnapshot> {
    this.publish({
      phase: 'validating',
      message: '正在校验 Workspace、OS 与 Python 环境…',
      identity: null,
      diagnostic: null
    })
    let launch: ResolvedWorkbenchLaunch
    try {
      const localConfiguration = await readLocalEnvironmentConfiguration(
        join(
          this.options.workspacePath,
          '.unilabos',
          LOCAL_ENVIRONMENT_CONFIG
        )
      )
      this.selectedMode = this.options.runtimeMode
        ?? localConfiguration.runtimeMode
        ?? this.selectedMode
      this.selectedGraphPath = this.options.graphPath
        ?? localConfiguration.graphPath
        ?? this.selectedGraphPath
      this.snapshot = {
        ...this.snapshot,
        configuredGraphPath: this.selectedGraphPath
      }
      launch = await resolveWorkbenchLaunch(
        {
          ...this.options,
          graphPath: this.selectedGraphPath
        },
        this.selectedMode
      )
      const savedPlcSimulatorProjectPath =
        localConfiguration.plcSimulatorProjectPath
      if (
        savedPlcSimulatorProjectPath
        && !this.snapshot.plcSimulator.projectPath
      ) {
        this.snapshot = {
          ...this.snapshot,
          plcSimulator: idlePlcSimulatorSnapshot(savedPlcSimulatorProjectPath)
        }
      }
    } catch (error) {
      const diagnostic = diagnosticFromError(error)
      this.publish({
        phase: 'failed',
        message: 'Workbench 会话校验失败',
        identity: null,
        diagnostic
      })
      throw new Error(diagnostic.message)
    }
    if (this.stopRequested) return this.getSnapshot()

    this.publish({
      phase: 'starting',
      message: '正在启动 managed-local Uni-Lab OS…',
      identity: null,
      diagnostic: null
    })
    try {
      await Promise.all([
        mkdir(dirname(launch.identity.logPath), { recursive: true }),
        mkdir(launch.runtimeDirectory, { recursive: true })
      ])
      if (this.stopRequested) return this.getSnapshot()
      const log = createWriteStream(launch.identity.logPath, { flags: 'a' })
      log.write(`[workbench] ${new Date().toISOString()} generation=${launch.identity.generation}\n`)
      const child = spawn(launch.command, launch.args, {
        cwd: launch.cwd,
        env: launch.environment,
        detached: process.platform !== 'win32',
        shell: false,
        windowsHide: true
      })
      this.child = child
      launch.identity.pid = requireProcessId(child.pid)
      child.stdout.pipe(log, { end: false })
      child.stderr.pipe(log, { end: false })
      child.once('error', error => {
        log.write(`[workbench] spawn error: ${error.message}\n`)
      })
      child.once('close', (code, signal) => {
        log.end(`[workbench] process exited code=${String(code)} signal=${String(signal)}\n`)
        if (this.child === child) this.child = null
        const expectedExit = this.expectedExits.delete(child)
        if (!expectedExit && this.snapshot.phase !== 'failed') {
          this.publish({
            phase: 'failed',
            message: 'Uni-Lab OS 已意外退出',
            identity: { ...launch.identity },
            diagnostic: {
              code: 'os_exited',
              message: `Uni-Lab OS 已退出（code=${String(code)}, signal=${String(signal)}）`,
              recovery: `检查日志 ${launch.identity.logPath}，修复后重新启动 Workbench`
            }
          })
        }
      })
      await writeSessionManifest(launch)
      this.publish({
        phase: 'waiting',
        message: 'OS 进程已启动，正在等待健康状态与目录投影…',
        identity: { ...launch.identity },
        diagnostic: null
      })
      launch.identity.packageMounts = await waitForWorkbenchReadiness(
        launch.identity.backendUrl,
        child,
        this.options.readinessTimeoutMs ?? DEFAULT_READINESS_TIMEOUT_MS
      )
      if (this.stopRequested) return this.getSnapshot()
      await this.startAgentForLaunch(launch)
      if (this.stopRequested) return this.getSnapshot()
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error('Uni-Lab OS 在 Workbench 完成就绪前退出')
      }
      this.publish({
        phase: 'ready',
        message: 'Workspace 与 Uni-Lab OS 已就绪',
        identity: { ...launch.identity },
        diagnostic: null
      })
      await writeSessionManifest(launch, 'ready')
      return this.getSnapshot()
    } catch (error) {
      const agent = this.agent
      this.agent = null
      const child = this.child
      const cleanup: Promise<unknown>[] = []
      if (child) {
        this.expectedExits.add(child)
        cleanup.push(stopProcessTree(child).finally(() => {
          if (this.child === child) this.child = null
        }))
      }
      if (agent) cleanup.push(stopManagedAgent(agent))
      await Promise.allSettled(cleanup)
      if (this.stopRequested) {
        this.publish({
          phase: 'idle',
          message: 'Uni-Lab OS 已停止',
          identity: null,
          diagnostic: null
        })
        return this.getSnapshot()
      }
      const source = diagnosticFromError(error)
      const diagnostic: WorkbenchSessionDiagnostic = {
        code: source.code === 'os_start_failed'
          ? 'os_start_failed'
          : 'os_readiness_failed',
        message: source.message,
        recovery: `检查日志 ${launch.identity.logPath}，确认端口与 OS 依赖后重试`
      }
      this.publish({
        phase: 'failed',
        message: 'Uni-Lab OS 启动失败',
        identity: { ...launch.identity },
        diagnostic
      })
      throw new Error(diagnostic.message)
    }
  }

  private publish(
    snapshot: Omit<
      WorkbenchSessionSnapshot,
      'configuredGraphPath' | 'plcSimulator'
    > & {
      configuredGraphPath?: string
      plcSimulator?: WorkbenchPlcSimulatorSnapshot
    }
  ): void {
    this.snapshot = cloneSnapshot({
      ...snapshot,
      configuredGraphPath:
        snapshot.configuredGraphPath ?? this.snapshot.configuredGraphPath,
      plcSimulator: snapshot.plcSimulator ?? this.snapshot.plcSimulator
    })
    for (const listener of this.listeners) listener(this.getSnapshot())
  }
}

function failedAgentIdentity(
  launch: ResolvedWorkbenchLaunch,
  diagnostic: string
): WorkbenchAgentIdentity {
  const dataDir = join(
    launch.identity.workspacePath,
    '.unilabos',
    'agent',
    'aionui'
  )
  return {
    implementation: 'aioncore',
    productName: 'UniLab Agent',
    distributionVersion: 'unknown',
    phase: 'failed',
    url: null,
    iconUrl: null,
    pid: null,
    dataDir,
    workDir: launch.identity.workspacePath,
    logPath: join(dataDir, 'logs', 'aioncore.log'),
    diagnostic
  }
}

async function resolveWorkbenchLaunch(
  options: ManagedLocalWorkbenchSessionOptions,
  mode: WorkbenchRuntimeMode
): Promise<ResolvedWorkbenchLaunch> {
  const environment = options.environment ?? process.env
  const platform = options.platform ?? process.platform
  const homeDirectory = options.homeDirectory ?? homedir()
  const workspacePath = await requireRealDirectory(
    options.workspacePath,
    'invalid_workspace',
    '所选 Workspace 不存在'
  )
  await prepareWorkbenchState(workspacePath)
  const localConfigPath = join(workspacePath, 'deployment', 'local_config.py')
  await requireReadableFile(
    localConfigPath,
    'invalid_workspace',
    '所选 Workspace 缺少 deployment/local_config.py'
  )
  const configuredGraphPath = options.graphPath
    ?? join('deployment', 'graphs', 'szlab-local-debug.json')
  const graphPath = await requireRealFile(
    resolve(workspacePath, configuredGraphPath),
    'invalid_workspace',
    '所选设备图不存在'
  )
  ensureInsideWorkspace(workspacePath, graphPath)

  const osProjectCandidate = options.osProjectPath
    ?? environment['UNILAB_OS_PROJECT']
  const osProjectPath = osProjectCandidate
    ? await requireRealDirectory(
        osProjectCandidate,
        'invalid_os_project',
        'Uni-Lab-OS 项目目录不存在'
      )
    : ''
  if (osProjectPath) {
    await requireRealDirectory(
      join(osProjectPath, 'unilabos'),
      'invalid_os_project',
      '所选目录不是有效的 Uni-Lab-OS 项目'
    )
  }

  const environmentPath = await resolveRuntimeEnvironmentPath({
    selected: options.environmentPath,
    environment,
    homeDirectory,
    platform
  })
  if (!environmentPath) {
    throw new WorkbenchLaunchError(
      'python_environment_not_found',
      '没有找到同时包含 Python 与 unilab CLI 的兼容环境',
      '激活 Uni-Lab OS Conda 环境，或在 Workbench 中显式选择环境目录'
    )
  }
  const { pythonExecutable, unilabExecutable } = runtimeExecutablePaths(
    environmentPath,
    platform
  )
  await Promise.all([
    requireExecutable(
      pythonExecutable,
      'python_environment_not_found',
      '所选环境缺少可执行 Python'
    ),
    requireExecutable(
      unilabExecutable,
      'python_environment_not_found',
      '所选环境缺少可执行 unilab CLI'
    )
  ])

  const backendPort = options.backendPort ?? await availableLoopbackPort()
  const hostLinkPort = options.hostLinkPort ?? await availableLoopbackPort()
  if (backendPort === hostLinkPort) {
    throw new WorkbenchLaunchError(
      'port_conflict',
      `OS HTTP 与 HostLink 不能共用端口 ${backendPort}`,
      '清除显式端口配置后让 Workbench 自动分配端口'
    )
  }
  await Promise.all([
    requireAvailableLoopbackPort(backendPort, 'OS HTTP'),
    requireAvailableLoopbackPort(hostLinkPort, 'HostLink')
  ])

  const generation = randomUUID()
  const workbenchRoot = join(workspacePath, '.unilabos')
  await ensureWorkbenchStateIgnored(workbenchRoot)
  const runtimeDirectory = join(
    workbenchRoot,
    'runtime',
    'workbench',
    'os',
    generation
  )
  const logPath = join(
    workbenchRoot,
    'logs',
    'workbench',
    `${generation}.log`
  )
  const graphBytes = await readFile(graphPath)
  const graphFingerprint = createHash('sha256')
    .update(graphBytes)
    .digest('hex')
  const validatedGraphPath = join(
    runtimeDirectory,
    'selected-graph.json'
  )
  await mkdir(runtimeDirectory, { recursive: true })
  await writeFile(validatedGraphPath, graphBytes, {
    flag: 'wx',
    mode: 0o600
  })
  const identity: WorkbenchSessionIdentity = {
    workspacePath,
    osProjectPath,
    osRuntimeSource: osProjectPath ? 'checkout' : 'environment',
    environmentPath,
    graphPath,
    graphFingerprint,
    backendUrl: `http://${LOOPBACK_HOST}:${backendPort}`,
    pid: 0,
    generation,
    logPath,
    mode,
    packageMounts: null,
    agent: null
  }
  return {
    identity,
    command: unilabExecutable,
    args: [
      '--workspace',
      workspacePath,
      '--graph',
      validatedGraphPath,
      '--config',
      localConfigPath,
      '--working_dir',
      runtimeDirectory,
      '--backend',
      'ros',
      '--app_bridges',
      'fastapi',
      '--port',
      String(backendPort),
      '--disable_browser',
      '--action_mode',
      mode === 'normal' ? 'real' : 'simulate',
      '--external_devices_only',
      '--ros_discovery_server',
      'off'
    ],
    cwd: workspacePath,
    environment: {
      ...activatedCondaEnvironment(environmentPath, platform, environment),
      PYTHONPATH: mergePathList(
        [osProjectPath || undefined, workspacePath, environment['PYTHONPATH']],
        platform === 'win32' ? ';' : ':'
      ),
      PYTHONUNBUFFERED: '1',
      UNILABOS_HOSTLINKCONFIG_PORT: String(hostLinkPort),
      UNILABOS_OBSERVABILITYCONFIG_ENABLED: 'true',
      UNILABOS_OBSERVABILITYCONFIG_PROJECT_NAME: 'uni-lab-workbench',
      UNILABOS_WORKBENCH_RUNTIME_MODE: mode,
      UNILABOS_WORKBENCH_GENERATION: generation,
      UNILABOS_WORKBENCH_WORKSPACE: workspacePath,
      UNILABOS_WORKBENCH_GRAPH_FINGERPRINT: graphFingerprint,
      ROS_DOMAIN_ID: String(2 + Math.floor(Math.random() * 98))
    },
    runtimeDirectory,
    sessionManifestPath: join(
      workbenchRoot,
      'runtime',
      'workbench',
      'session.json'
    )
  }
}

async function ensureWorkbenchStateIgnored(workbenchRoot: string): Promise<void> {
  const ignorePath = join(workbenchRoot, '.gitignore')
  await mkdir(workbenchRoot, { recursive: true })
  let existing = ''
  try {
    existing = await readFile(ignorePath, 'utf8')
  } catch (error) {
    if (!isRecord(error) || error['code'] !== 'ENOENT') throw error
  }
  const lines = new Set(existing.split(/\r?\n/).filter(Boolean))
  let changed = false
  for (const rule of [
    'runtime/',
    'logs/',
    'agent/',
    LOCAL_ENVIRONMENT_CONFIG,
    '.gitignore'
  ]) {
    if (lines.has(rule)) continue
    lines.add(rule)
    changed = true
  }
  if (changed || !existing) {
    await writeFile(ignorePath, `${[...lines].join('\n')}\n`, { mode: 0o600 })
  }
}

async function resolveRuntimeEnvironmentPath({
  selected,
  environment,
  homeDirectory,
  platform
}: {
  selected?: string
  environment: NodeJS.ProcessEnv
  homeDirectory: string
  platform: NodeJS.Platform
}): Promise<string | null> {
  if (selected) {
    const selectedEnvironment = await validRuntimeEnvironment(selected, platform)
    if (selectedEnvironment) return selectedEnvironment
    throw new WorkbenchLaunchError(
      'python_environment_not_found',
      `显式选择的 Python 环境不可用：${selected}`,
      '重新选择同时包含 Python 与 unilab CLI 的兼容环境'
    )
  }
  return await discoverDefaultCondaEnvironment({
    environment,
    homeDirectory,
    platform
  })
}

async function requireRealDirectory(
  path: string,
  code: WorkbenchSessionDiagnostic['code'],
  message: string
): Promise<string> {
  try {
    const resolvedPath = await realpath(resolve(path))
    if (!(await stat(resolvedPath)).isDirectory()) throw new Error('not a directory')
    return resolvedPath
  } catch {
    throw new WorkbenchLaunchError(code, `${message}：${path}`, '重新选择有效目录')
  }
}

async function requireRealFile(
  path: string,
  code: WorkbenchSessionDiagnostic['code'],
  message: string
): Promise<string> {
  await requireReadableFile(path, code, message)
  return await realpath(resolve(path))
}

async function requireReadableFile(
  path: string,
  code: WorkbenchSessionDiagnostic['code'],
  message: string
): Promise<void> {
  try {
    await access(path, fsConstants.R_OK)
    if (!(await stat(path)).isFile()) throw new Error('not a file')
  } catch {
    throw new WorkbenchLaunchError(code, `${message}：${path}`, '修复 Workspace 结构后重试')
  }
}

async function requireExecutable(
  path: string,
  code: WorkbenchSessionDiagnostic['code'],
  message: string
): Promise<void> {
  try {
    await access(path, fsConstants.R_OK | fsConstants.X_OK)
  } catch {
    throw new WorkbenchLaunchError(code, `${message}：${path}`, '选择兼容的 Uni-Lab OS Python 环境')
  }
}

function ensureInsideWorkspace(workspacePath: string, candidatePath: string): void {
  const relativePath = relative(workspacePath, candidatePath)
  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new WorkbenchLaunchError(
      'invalid_workspace',
      `Graph 路径逃逸 Workspace：${candidatePath}`,
      '选择 Workspace 内 deployment/graphs 下的设备图'
    )
  }
}

function availableLoopbackPort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, LOOPBACK_HOST, () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        reject(new Error('无法分配本地端口'))
        return
      }
      server.close(error => error ? reject(error) : resolvePort(address.port))
    })
  })
}

async function requireAvailableLoopbackPort(port: number, label: string): Promise<void> {
  if (!Number.isInteger(port) || port < 1024 || port > 65_535) {
    throw new WorkbenchLaunchError(
      'port_conflict',
      `${label} 端口不合法：${port}`,
      '使用 1024–65535 范围内的本地端口'
    )
  }
  await new Promise<void>((resolveAvailable, reject) => {
    const server = createServer()
    server.once('error', () => reject(new WorkbenchLaunchError(
      'port_conflict',
      `${label} 端口 ${port} 已被占用；Workbench 不会连接或终止未知进程`,
      '停止占用该端口的进程，或清除显式端口配置以自动分配'
    )))
    server.listen(port, LOOPBACK_HOST, () => {
      server.close(error => error ? reject(error) : resolveAvailable())
    })
  })
}

async function writeSessionManifest(
  launch: ResolvedWorkbenchLaunch,
  phase: 'starting' | 'ready' = 'starting'
): Promise<void> {
  await mkdir(dirname(launch.sessionManifestPath), { recursive: true })
  const temporaryPath = `${launch.sessionManifestPath}.${process.pid}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify({
    schemaVersion: 1,
    phase,
    identity: launch.identity
  }, null, 2)}\n`, { mode: 0o600 })
  await rename(temporaryPath, launch.sessionManifestPath)
}

async function stopProcessTree(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null || !child.pid) return
  if (process.platform === 'win32') {
    await new Promise<void>(resolveStop => {
      const killer = spawn('taskkill.exe', [
        '/pid',
        String(child.pid),
        '/t',
        '/f'
      ], { windowsHide: true })
      killer.once('close', () => resolveStop())
      killer.once('error', () => resolveStop())
    })
    return
  }
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    child.kill('SIGTERM')
  }
  await Promise.race([
    new Promise<void>(resolveStop => child.once('close', () => resolveStop())),
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

function idlePlcSimulatorSnapshot(
  projectPath: string
): WorkbenchPlcSimulatorSnapshot {
  return {
    phase: 'idle',
    message: projectPath ? 'PLC-Sim 尚未启动' : '尚未选择 PLC-Sim 项目目录',
    projectPath,
    pid: null,
    guiUrl: `http://${LOOPBACK_HOST}:${PLC_SIMULATOR_GUI_PORT}`,
    opcUaUrl: `opc.tcp://${LOOPBACK_HOST}:${PLC_SIMULATOR_OPC_UA_PORT}`,
    logPath: '',
    diagnostic: null
  }
}

async function readLogTailFromPath(
  logPath: string | undefined,
  maxBytes: number
): Promise<string> {
  if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > 1024 * 1024) {
    throw new Error('Workbench 日志读取上限必须在 1–1048576 字节之间')
  }
  if (!logPath) return ''
  try {
    const content = await readFile(logPath)
    return content.subarray(Math.max(0, content.length - maxBytes)).toString('utf8')
  } catch (error) {
    if (isRecord(error) && error['code'] === 'ENOENT') return ''
    throw error
  }
}

async function waitForLoopbackPort(
  port: number,
  child: ChildProcessWithoutNullStreams,
  timeoutMs: number
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error('PLC-Sim 在 Web GUI 就绪前退出')
    }
    if (await canConnectToLoopbackPort(port)) return
    await delay(250)
  }
  throw new Error(`等待 PLC-Sim Web GUI 就绪超时：${LOOPBACK_HOST}:${port}`)
}

function canConnectToLoopbackPort(port: number): Promise<boolean> {
  return new Promise(resolveConnected => {
    const socket = createConnection({ host: LOOPBACK_HOST, port })
    let settled = false
    const finish = (connected: boolean): void => {
      if (settled) return
      settled = true
      socket.destroy()
      resolveConnected(connected)
    }
    socket.setTimeout(750)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
  })
}

async function writeLocalEnvironmentConfiguration(
  workspacePath: string,
  configuration: {
    graphPath: string
    plcSimulatorProjectPath: string
    runtimeMode: WorkbenchRuntimeMode
  }
): Promise<void> {
  const resolvedWorkspacePath = await realpath(resolve(workspacePath))
  const workbenchRoot = join(resolvedWorkspacePath, '.unilabos')
  await ensureWorkbenchStateIgnored(workbenchRoot)
  const configPath = join(workbenchRoot, LOCAL_ENVIRONMENT_CONFIG)
  await writeLocalEnvironmentConfigurationFile(configPath, configuration)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

function requireProcessId(pid: number | undefined): number {
  if (!pid) {
    throw new WorkbenchLaunchError(
      'os_start_failed',
      'Uni-Lab OS 进程未返回 PID',
      '检查系统进程限制与 unilab CLI 可执行权限'
    )
  }
  return pid
}

function mergePathList(
  values: Array<string | undefined>,
  pathDelimiter = delimiter
): string {
  return values.filter((value): value is string => Boolean(value)).join(pathDelimiter)
}

function cloneSnapshot(snapshot: WorkbenchSessionSnapshot): WorkbenchSessionSnapshot {
  return {
    ...snapshot,
    plcSimulator: { ...snapshot.plcSimulator },
    identity: snapshot.identity ? {
      ...snapshot.identity,
      packageMounts: snapshot.identity.packageMounts ? {
        ...snapshot.identity.packageMounts,
        items: snapshot.identity.packageMounts.items.map(item => ({ ...item }))
      } : null
    } : null,
    diagnostic: snapshot.diagnostic ? { ...snapshot.diagnostic } : null
  }
}

function diagnosticFromError(error: unknown): WorkbenchSessionDiagnostic {
  if (error instanceof WorkbenchLaunchError) return error.diagnostic
  return {
    code: 'os_start_failed',
    message: error instanceof Error ? error.message : String(error),
    recovery: '检查 Workbench 日志并重试'
  }
}

async function stopManagedAgent(agent: ManagedWorkbenchAgent): Promise<void> {
  await Promise.race([
    agent.stop(),
    delay(5_000).then(() => {
      throw new Error('等待 UniLab Agent 停止超时')
    })
  ])
}

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolveDelay => setTimeout(resolveDelay, milliseconds))
}
