import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

import {
  activatedCondaEnvironment,
  discoverDefaultCondaEnvironment,
  runtimeExecutablePaths
} from '@unilab/local-environment'

import {
  startManagedWorkbenchAgent,
  type ManagedWorkbenchAgent,
  type WorkbenchAgentIdentity
} from './agent-sidecar'
import {
  readLocalEnvironmentConfiguration
} from './local-environment-configuration'
import {
  discoverWorkbenchPlcVariableTables,
  type WorkbenchPlcVariableTableCandidate
} from './plc-variable-tables'
import type {
  ManagedLocalWorkbenchSessionOptions,
  WorkbenchDomainMode,
  WorkbenchEnvironmentLogKind,
  WorkbenchPlcHandshakeProfile,
  WorkbenchPlcSimulatorConfiguration,
  WorkbenchRuntimeMode,
  WorkbenchSession,
  WorkbenchSessionDiagnostic,
  WorkbenchSessionPhase,
  WorkbenchSessionSnapshot,
  WorkspacePackageMountProjection
} from './index'

const HOST_SCHEMA = 'unilab-workspace-host/v1'
const HOST_START_TIMEOUT_MS = 15_000
const OPERATION_TIMEOUT_MS = 120_000
const POLL_INTERVAL_MS = 500

type HostPhase = WorkbenchSessionPhase | 'interrupted' | 'unknown'

interface HostComponent {
  name: string
  phase: HostPhase
  pid: number | null
  address: string | null
  generation: string | null
  logPath: string | null
  diagnostic: string | null
  capabilities: readonly string[]
  metadata?: Record<string, unknown>
}

interface WorkspaceHostSnapshot {
  schemaVersion: typeof HOST_SCHEMA
  revision: number
  eventCursor: number
  workspacePath: string
  host: {
    phase: string
    pid: number
    endpoint: string
    tokenPath: string
    platform: string
  }
  configuration: Record<string, unknown>
  components: {
    backend: HostComponent
    edge: HostComponent
    plc: HostComponent
    renderer: HostComponent
  }
}

interface WorkspaceHostOperation {
  operationId: string
  phase: 'pending' | 'running' | 'succeeded' | 'failed'
  result: unknown
  error: { code?: string; message?: string } | null
}

interface HostConnection {
  endpoint: string
  token: string
}

/**
 * Workbench adapter for the OS-owned Workspace Host.
 *
 * The adapter owns no Backend/Edge/PLC process. It may bootstrap the detached
 * Host, then only submits idempotent commands and projects Host snapshots into
 * the existing renderer DTO. Agent remains an independent sidecar until AIW-07.
 */
export class WorkspaceHostWorkbenchSession implements WorkbenchSession {
  private snapshot: WorkbenchSessionSnapshot
  private host: WorkspaceHostSnapshot | null = null
  private connection: HostConnection | null = null
  private readonly listeners = new Set<(
    snapshot: WorkbenchSessionSnapshot
  ) => void>()
  private agent: ManagedWorkbenchAgent | null = null
  private agentStarting: Promise<WorkbenchSessionSnapshot> | null = null
  private polling = false
  private readonly pollTimer: ReturnType<typeof setInterval>

  constructor(private readonly options: ManagedLocalWorkbenchSessionOptions) {
    const graphPath = options.graphPath
      ?? join('deployment', 'graphs', 'szlab-local-debug.json')
    const mode = options.runtimeMode ?? 'normal'
    this.snapshot = initialSnapshot(options, graphPath, mode)
    this.pollTimer = setInterval(() => {
      void this.pollHost()
    }, POLL_INTERVAL_MS)
    this.pollTimer.unref?.()
  }

  getSnapshot(): WorkbenchSessionSnapshot {
    return structuredClone(this.snapshot)
  }

  onDidChange(listener: (snapshot: WorkbenchSessionSnapshot) => void): {
    dispose(): void
  } {
    this.listeners.add(listener)
    return { dispose: () => this.listeners.delete(listener) }
  }

  async start(): Promise<WorkbenchSessionSnapshot> {
    await this.startWorkspaceBackend()
    return await this.run('os.start')
  }

  async registerRenderer(): Promise<void> {
    const address = this.options.environment?.['UNILAB_WORKBENCH_RENDERER_URL']
      ?? process.env['UNILAB_WORKBENCH_RENDERER_URL']
    if (!address) return
    await this.run('renderer.attach', {
      pid: process.pid,
      address,
      generation: `${process.pid}`,
      workbenchProjectPath: process.cwd(),
      nodeExecutable: process.execPath
    })
  }

  async unregisterRenderer(): Promise<void> {
    if (!this.connection) return
    await this.run('renderer.detach', { pid: process.pid })
  }

  async startWorkspaceBackend(): Promise<WorkbenchSessionSnapshot> {
    await this.loadConfiguration()
    return await this.run('backend.start')
  }

  async stopWorkspaceBackend(): Promise<WorkbenchSessionSnapshot> {
    return await this.run('backend.stop')
  }

  async stop(): Promise<WorkbenchSessionSnapshot> {
    return await this.run('os.stop')
  }

  async stopAll(): Promise<WorkbenchSessionSnapshot> {
    await Promise.allSettled([
      this.run('os.stop'),
      this.run('plc.stop')
    ])
    await this.run('backend.stop')
    await this.stopAgent()
    return this.getSnapshot()
  }

  async restart(): Promise<WorkbenchSessionSnapshot> {
    return await this.run('os.restart')
  }

  async rebuildLocalData(): Promise<WorkbenchSessionSnapshot> {
    return await this.run('local.reset-state')
  }

  startAgent(): Promise<WorkbenchSessionSnapshot> {
    if (this.agent?.identity.phase === 'ready') {
      return Promise.resolve(this.getSnapshot())
    }
    if (this.agentStarting) return this.agentStarting
    const starting = this.startAgentManaged()
    this.agentStarting = starting
    return starting.finally(() => {
      if (this.agentStarting === starting) this.agentStarting = null
    })
  }

  async stopAgent(): Promise<WorkbenchSessionSnapshot> {
    const active = this.agent
    this.agent = null
    if (active) await active.stop()
    this.publish({ agent: null })
    return this.getSnapshot()
  }

  async restartAgent(): Promise<WorkbenchSessionSnapshot> {
    await this.stopAgent()
    return await this.startAgent()
  }

  async readLogTail(maxBytes = 64 * 1024): Promise<string> {
    return await this.readHostLog('backend', maxBytes)
  }

  async readEnvironmentLog(
    kind: WorkbenchEnvironmentLogKind,
    maxBytes = 64 * 1024
  ): Promise<string> {
    if (kind === 'agent') {
      return await tailFile(this.snapshot.agent?.logPath ?? '', maxBytes)
    }
    const component = kind === 'workspace-backend'
      ? 'backend'
      : kind === 'os' ? 'edge' : 'plc'
    return await this.readHostLog(component, maxBytes)
  }

  async configureGraph(graphPath: string): Promise<WorkbenchSessionSnapshot> {
    const wasBackendReady = this.host?.components.backend.phase === 'ready'
    const wasEdgeReady = this.host?.components.edge.phase === 'ready'
    await this.updateConfiguration({ graphPath })
    if (wasBackendReady) await this.run('local.reset-state')
    if (wasEdgeReady) await this.run('os.start')
    return this.getSnapshot()
  }

  async configurePlcSimulator(
    configuration: string | WorkbenchPlcSimulatorConfiguration
  ): Promise<WorkbenchSessionSnapshot> {
    const value = typeof configuration === 'string'
      ? { variableTablePath: configuration }
      : {
          plcSimulatorProjectPath: configuration.projectPath,
          plcVariableTablePath: configuration.variableTablePath,
          plcHandshakeProfile: configuration.handshakeProfile
        }
    const wasReady = this.host?.components.plc.phase === 'ready'
    await this.updateConfiguration(value)
    await this.refreshPlcVariableTables()
    if (wasReady) await this.run('plc.restart')
    return this.getSnapshot()
  }

  async refreshPlcVariableTables(): Promise<WorkbenchSessionSnapshot> {
    await this.loadConfiguration()
    const candidates = await discoverWorkbenchPlcVariableTables({
      workspacePath: this.options.workspacePath,
      graphPath: this.snapshot.configuredGraphPath,
      configuredPath: this.snapshot.plcSimulator.variableTablePath
    })
    const selected = this.snapshot.plcSimulator.variableTablePath
      || candidates.find(candidate => candidate.recommended)?.path
      || ''
    this.publish({
      plcSimulator: {
        ...this.snapshot.plcSimulator,
        variableTablePath: selected,
        variableTableCandidates: candidates
      }
    })
    return this.getSnapshot()
  }

  async startPlcSimulator(): Promise<WorkbenchSessionSnapshot> {
    await this.refreshPlcVariableTables()
    return await this.run('plc.start')
  }

  async stopPlcSimulator(): Promise<WorkbenchSessionSnapshot> {
    return await this.run('plc.stop')
  }

  async releaseEnvironmentPorts(
    target: 'os' | 'plc-sim'
  ): Promise<WorkbenchSessionSnapshot> {
    return target === 'plc-sim'
      ? await this.stopPlcSimulator()
      : await this.stop()
  }

  async setRuntimeMode(
    mode: WorkbenchRuntimeMode
  ): Promise<WorkbenchSessionSnapshot> {
    if (mode !== 'normal' && mode !== 'dry-run') {
      throw new Error(`不支持的 OS 运行模式：${String(mode)}`)
    }
    const wasBackendReady = this.host?.components.backend.phase === 'ready'
    const wasEdgeReady = this.host?.components.edge.phase === 'ready'
    await this.updateConfiguration({ runtimeMode: mode })
    if (wasBackendReady) await this.run('local.reset-state')
    if (wasEdgeReady) await this.run('os.start')
    return this.getSnapshot()
  }

  async setDomainAuthority(
    mode: WorkbenchDomainMode
  ): Promise<WorkbenchSessionSnapshot> {
    if (mode !== 'local' && mode !== 'backend') {
      throw new Error(`不支持的 Domain Authority：${String(mode)}`)
    }
    const backendUrl = mode === 'backend'
      ? this.options.backendAuthorityUrl
      : undefined
    if (mode === 'backend' && !backendUrl) {
      throw new Error('未配置 Backend Authority 地址')
    }
    return await this.run('authority.switch', { mode, backendUrl })
  }

  private async run(
    command: string,
    parameters: Record<string, unknown> = {}
  ): Promise<WorkbenchSessionSnapshot> {
    const connection = await this.ensureHost()
    const operation = await hostRequest<WorkspaceHostOperation>(
      connection,
      'POST',
      '/v1/operations',
      {
        operationId: randomUUID(),
        command,
        parameters
      }
    )
    const completed = await this.waitOperation(connection, operation.operationId)
    if (completed.phase === 'failed') {
      throw new Error(completed.error?.message ?? `${command} 操作失败`)
    }
    await this.refreshHost(connection)
    return this.getSnapshot()
  }

  private async updateConfiguration(
    configuration: Record<string, unknown>
  ): Promise<void> {
    await this.run('configuration.update', configuration)
  }

  private async ensureHost(): Promise<HostConnection> {
    if (this.connection) {
      try {
        await this.refreshHost(this.connection)
        return this.connection
      } catch {
        this.connection = null
      }
    }
    const discovered = await discoverHost(this.options.workspacePath)
    if (discovered) {
      this.connection = discovered
      await this.refreshHost(discovered)
      return discovered
    }
    await startWorkspaceHost(this.options)
    const deadline = Date.now() + HOST_START_TIMEOUT_MS
    while (Date.now() < deadline) {
      const candidate = await discoverHost(this.options.workspacePath)
      if (candidate) {
        try {
          await this.refreshHost(candidate)
          this.connection = candidate
          return candidate
        } catch {
          // Host may have published its manifest just before opening the socket.
        }
      }
      await delay(50)
    }
    throw new Error('Workspace Host 启动超时；请查看 workspace-host.log')
  }

  private async waitOperation(
    connection: HostConnection,
    operationId: string
  ): Promise<WorkspaceHostOperation> {
    const deadline = Date.now() + (this.options.readinessTimeoutMs
      ?? OPERATION_TIMEOUT_MS)
    while (Date.now() < deadline) {
      const operation = await hostRequest<WorkspaceHostOperation>(
        connection,
        'GET',
        `/v1/operations/${encodeURIComponent(operationId)}`
      )
      if (operation.phase === 'succeeded' || operation.phase === 'failed') {
        return operation
      }
      await delay(100)
    }
    throw new Error(`等待 Workspace Host 操作超时：${operationId}`)
  }

  private async pollHost(): Promise<void> {
    if (this.polling) return
    this.polling = true
    try {
      const connection = this.connection
        ?? await discoverHost(this.options.workspacePath)
      if (!connection) return
      this.connection = connection
      await this.refreshHost(connection)
    } catch {
      this.connection = null
    } finally {
      this.polling = false
    }
  }

  private async refreshHost(connection: HostConnection): Promise<void> {
    const host = await hostRequest<WorkspaceHostSnapshot>(
      connection,
      'GET',
      '/v1/snapshot'
    )
    if (host.schemaVersion !== HOST_SCHEMA) {
      throw new Error(`Workspace Host schema 不兼容：${host.schemaVersion}`)
    }
    if (
      this.host?.host.endpoint === host.host.endpoint
      && this.host.host.pid === host.host.pid
      && this.host.revision === host.revision
    ) return
    this.host = host
    this.snapshot = projectSnapshot(host, this.snapshot, this.options)
    this.emit()
  }

  private async readHostLog(
    component: 'backend' | 'edge' | 'plc',
    maxBytes: number
  ): Promise<string> {
    const connection = await this.ensureHost()
    const payload = await hostRequest<{ content: string }>(
      connection,
      'GET',
      `/v1/logs/${component}?maxBytes=${maxBytes}`
    )
    return payload.content
  }

  private async loadConfiguration(): Promise<void> {
    const configuration = await readLocalEnvironmentConfiguration(join(
      this.options.workspacePath,
      '.unilabos',
      'environment.local.json'
    ))
    const graphPath = this.options.graphPath
      ?? configuration.graphPath
      ?? this.snapshot.configuredGraphPath
    const mode = this.options.runtimeMode
      ?? configuration.runtimeMode
      ?? this.snapshot.configuredRuntimeMode
    const domainMode = this.options.domainMode
      ?? configuration.domainMode
      ?? this.snapshot.configuredDomainMode
    const backendUrl = this.options.backendAuthorityUrl
      ?? configuration.backendUrl
      ?? this.snapshot.configuredBackendUrl
    this.publish({
      configuredGraphPath: graphPath,
      configuredRuntimeMode: mode,
      configuredDomainMode: domainMode,
      configuredBackendUrl: backendUrl,
      edgeRuntime: {
        ...this.snapshot.edgeRuntime,
        graphPath,
        mode
      },
      plcSimulator: {
        ...this.snapshot.plcSimulator,
        projectPath: this.options.plcSimulatorProjectPath
          ?? configuration.plcSimulatorProjectPath
          ?? this.snapshot.plcSimulator.projectPath,
        variableTablePath: this.options.plcVariableTablePath
          ?? configuration.plcVariableTablePath
          ?? this.snapshot.plcSimulator.variableTablePath,
        handshakeProfile: this.options.plcHandshakeProfile
          ?? configuration.plcHandshakeProfile
          ?? this.snapshot.plcSimulator.handshakeProfile
      }
    })
  }

  private async startAgentManaged(): Promise<WorkbenchSessionSnapshot> {
    const workspacePath = await realpath(resolve(this.options.workspacePath))
    this.publish({ agent: startingAgentIdentity(workspacePath) })
    try {
      const agent = await (
        this.options.agentStarter ?? startManagedWorkbenchAgent
      )({
        workspacePath,
        environment: this.options.environment ?? process.env,
        appPath: this.options.agentAppPath,
        brandIconPath: this.options.agentBrandIconPath,
        onUnexpectedExit: message => {
          this.agent = null
          this.publish({ agent: failedAgentIdentity(workspacePath, message) })
        }
      })
      this.agent = agent
      this.publish({ agent: agent.identity })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.publish({ agent: failedAgentIdentity(workspacePath, message) })
      throw error
    }
    return this.getSnapshot()
  }

  private publish(change: Partial<WorkbenchSessionSnapshot>): void {
    this.snapshot = {
      ...this.snapshot,
      ...change,
      identity: change.identity === undefined
        ? this.snapshot.identity
        : change.identity,
      agent: change.agent === undefined ? this.snapshot.agent : change.agent,
      edgeRuntime: change.edgeRuntime ?? this.snapshot.edgeRuntime,
      plcSimulator: change.plcSimulator ?? this.snapshot.plcSimulator
    }
    this.emit()
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.getSnapshot())
  }
}

async function discoverHost(workspacePath: string): Promise<HostConnection | null> {
  const runtime = join(workspacePath, '.unilabos', 'runtime', 'workbench')
  try {
    const [rawSession, token] = await Promise.all([
      readFile(join(runtime, 'session.json'), 'utf8'),
      readFile(join(runtime, 'host.token'), 'utf8')
    ])
    const session = JSON.parse(rawSession) as Partial<WorkspaceHostSnapshot>
    if (
      session.schemaVersion !== HOST_SCHEMA ||
      typeof session.host?.endpoint !== 'string'
    ) return null
    return { endpoint: session.host.endpoint, token: token.trim() }
  } catch {
    return null
  }
}

async function startWorkspaceHost(
  options: ManagedLocalWorkbenchSessionOptions
): Promise<void> {
  const workspacePath = await realpath(resolve(options.workspacePath))
  const environment = options.environment ?? process.env
  const platform = options.platform ?? process.platform
  const environmentPath = options.environmentPath
    ?? await discoverDefaultCondaEnvironment({
      environment,
      homeDirectory: options.homeDirectory ?? homedir(),
      platform
    })
  if (!environmentPath) {
    throw new Error('没有找到可启动 Workspace Host 的 Uni-Lab Python 环境')
  }
  const { pythonExecutable } = runtimeExecutablePaths(environmentPath, platform)
  const hostEnvironment = activatedCondaEnvironment(
    environmentPath,
    platform,
    environment
  )
  const pythonPath = [
    options.osProjectPath ?? environment['UNILAB_OS_PROJECT'],
    workspacePath,
    hostEnvironment['PYTHONPATH']
  ].filter((value): value is string => Boolean(value)).join(
    platform === 'win32' ? ';' : ':'
  )
  const logPath = join(
    workspacePath,
    '.unilabos',
    'logs',
    'workbench',
    'workspace-host.log'
  )
  await mkdir(dirname(logPath), { recursive: true })
  const log = createWriteStream(logPath, { flags: 'a' })
  const child = spawn(
    pythonExecutable,
    [
      '-m',
      'unilabos.workspace_host.host',
      '--workspace',
      workspacePath,
      '--port',
      '0'
    ],
    {
      cwd: workspacePath,
      env: {
        ...hostEnvironment,
        PYTHONPATH: pythonPath,
        PYTHONUNBUFFERED: '1'
      },
      detached: platform !== 'win32',
      shell: false,
      windowsHide: true,
      stdio: ['ignore', log, log]
    }
  )
  child.unref()
  log.end()
}

async function hostRequest<T>(
  connection: HostConnection,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown
): Promise<T> {
  const response = await fetch(`${connection.endpoint}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${connection.token}`,
      'content-type': 'application/json'
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(2_000)
  })
  const payload = await response.json() as unknown
  if (!response.ok) {
    const record = isRecord(payload) && isRecord(payload['error'])
      ? payload['error']
      : {}
    throw new Error(
      typeof record['message'] === 'string'
        ? record['message']
        : `Workspace Host HTTP ${response.status}`
    )
  }
  return payload as T
}

function projectSnapshot(
  host: WorkspaceHostSnapshot,
  previous: WorkbenchSessionSnapshot,
  options: ManagedLocalWorkbenchSessionOptions
): WorkbenchSessionSnapshot {
  const backend = host.components.backend
  const edge = host.components.edge
  const plc = host.components.plc
  const configuration = host.configuration
  const graphPath = stringValue(configuration['graphPath'])
    ?? previous.configuredGraphPath
  const mode = runtimeMode(configuration['runtimeMode'])
    ?? previous.configuredRuntimeMode
  const domainMode = domainModeValue(configuration['domainMode'])
    ?? previous.configuredDomainMode
  const backendUrl = stringValue(configuration['backendUrl'])
    ?? previous.configuredBackendUrl
  const backendPhase = workbenchPhase(backend.phase)
  const identity = backend.pid && backend.generation && backend.address
    ? {
        workspacePath: host.workspacePath,
        osProjectPath: options.osProjectPath ?? '',
        osRuntimeSource: options.osProjectPath
          ? ('checkout' as const)
          : ('environment' as const),
        environmentPath: options.environmentPath ?? '',
        graphPath: stringValue(backend.metadata?.['graphPath'])
          ?? resolve(host.workspacePath, graphPath),
        graphFingerprint: stringValue(backend.metadata?.['graphFingerprint']) ?? '',
        backendUrl: backend.address,
        pid: backend.pid,
        generation: backend.generation,
        logPath: backend.logPath ?? '',
        mode,
        packageMounts: packageMounts(backend.metadata?.['packageMounts']),
        agent: previous.agent
      }
    : null
  return {
    phase: backendPhase,
    message: componentMessage('Workspace Backend', backend),
    configuredGraphPath: graphPath,
    configuredRuntimeMode: mode,
    configuredDomainMode: domainMode,
    configuredBackendUrl: backendUrl,
    identity,
    agent: previous.agent,
    diagnostic: componentDiagnostic(backend),
    edgeRuntime: {
      phase: workbenchPhase(edge.phase),
      message: componentMessage('OS', edge),
      pid: edge.pid,
      generation: edge.generation,
      graphPath,
      mode,
      logPath: edge.logPath ?? '',
      diagnostic: edge.diagnostic
    },
    plcSimulator: {
      phase: workbenchPhase(plc.phase),
      message: componentMessage('PLC-Sim', plc),
      projectPath: stringValue(plc.metadata?.['projectPath'])
        ?? stringValue(configuration['plcSimulatorProjectPath'])
        ?? previous.plcSimulator.projectPath,
      variableTablePath: stringValue(plc.metadata?.['variableTablePath'])
        ?? stringValue(configuration['plcVariableTablePath'])
        ?? previous.plcSimulator.variableTablePath,
      variableTableCandidates: previous.plcSimulator.variableTableCandidates,
      handshakeProfile: handshakeProfile(
        plc.metadata?.['handshakeProfile']
        ?? configuration['plcHandshakeProfile']
      ),
      pid: plc.pid,
      guiUrl: plc.address ?? '',
      opcUaUrl: stringValue(plc.metadata?.['opcUaUrl']) ?? '',
      logPath: plc.logPath ?? '',
      diagnostic: plc.diagnostic
    }
  }
}

function initialSnapshot(
  options: ManagedLocalWorkbenchSessionOptions,
  graphPath: string,
  mode: WorkbenchRuntimeMode
): WorkbenchSessionSnapshot {
  const candidates: readonly WorkbenchPlcVariableTableCandidate[] = []
  return {
    phase: 'idle',
    message: 'Workspace Host 尚未连接',
    configuredGraphPath: graphPath,
    configuredRuntimeMode: mode,
    configuredDomainMode: options.domainMode ?? 'local',
    configuredBackendUrl: options.backendAuthorityUrl ?? null,
    identity: null,
    agent: null,
    diagnostic: null,
    edgeRuntime: {
      phase: 'idle',
      message: 'OS 尚未启动',
      pid: null,
      generation: null,
      graphPath,
      mode,
      logPath: '',
      diagnostic: null
    },
    plcSimulator: {
      phase: 'idle',
      message: 'PLC-Sim 尚未启动',
      projectPath: options.plcSimulatorProjectPath ?? '',
      variableTablePath: options.plcVariableTablePath ?? '',
      variableTableCandidates: candidates,
      handshakeProfile: options.plcHandshakeProfile ?? 'szlab',
      pid: null,
      guiUrl: '',
      opcUaUrl: '',
      logPath: '',
      diagnostic: null
    }
  }
}

function workbenchPhase(phase: HostPhase): WorkbenchSessionPhase {
  if (phase === 'interrupted' || phase === 'unknown') return 'failed'
  return phase
}

function componentMessage(label: string, component: HostComponent): string {
  const messages: Record<HostPhase, string> = {
    idle: `${label} 已停止`,
    validating: `正在校验 ${label}…`,
    starting: `正在启动 ${label}…`,
    waiting: `正在等待 ${label} 就绪…`,
    ready: `${label} 已就绪`,
    stopping: `正在停止 ${label}…`,
    failed: `${label} 运行失败`,
    interrupted: `${label} 状态需要确认`,
    unknown: `${label} 状态未知`
  }
  return messages[component.phase]
}

function componentDiagnostic(
  component: HostComponent
): WorkbenchSessionDiagnostic | null {
  if (!component.diagnostic) return null
  return {
    code: component.phase === 'failed' ? 'os_start_failed' : 'os_exited',
    message: component.diagnostic,
    recovery: '查看 Workspace Host 与组件日志后重试'
  }
}

function packageMounts(value: unknown): WorkspacePackageMountProjection | null {
  if (!isRecord(value) || value['schemaVersion'] !== 'workspace-package-mounts/v1') {
    return null
  }
  return value as unknown as WorkspacePackageMountProjection
}

function runtimeMode(value: unknown): WorkbenchRuntimeMode | null {
  return value === 'normal' || value === 'dry-run' ? value : null
}

function domainModeValue(value: unknown): WorkbenchDomainMode | null {
  return value === 'local' || value === 'backend' ? value : null
}

function handshakeProfile(value: unknown): WorkbenchPlcHandshakeProfile {
  return value === 'xuse' ? 'xuse' : 'szlab'
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null
}

function startingAgentIdentity(workspacePath: string): WorkbenchAgentIdentity {
  const dataDir = join(workspacePath, '.unilabos', 'agent', 'aionui')
  return {
    implementation: 'aioncore',
    productName: 'UniLab Agent',
    distributionVersion: 'unknown',
    phase: 'starting',
    url: null,
    iconUrl: null,
    pid: null,
    dataDir,
    workDir: workspacePath,
    logPath: join(dataDir, 'logs', 'aioncore.log'),
    diagnostic: null
  }
}

function failedAgentIdentity(
  workspacePath: string,
  diagnostic: string
): WorkbenchAgentIdentity {
  return {
    ...startingAgentIdentity(workspacePath),
    phase: 'failed',
    diagnostic
  }
}

async function tailFile(path: string, maxBytes: number): Promise<string> {
  if (!path) return ''
  try {
    const content = await readFile(path)
    return content.subarray(Math.max(0, content.length - maxBytes)).toString('utf8')
  } catch {
    return ''
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolveDelay => setTimeout(resolveDelay, milliseconds))
}
