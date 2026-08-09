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
import { createServer } from 'node:net'
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
import { fileURLToPath } from 'node:url'

import {
  startManagedWorkbenchAgent,
  type ManagedWorkbenchAgent,
  type WorkbenchAgentIdentity
} from './agent-sidecar'
import {
  activatedRuntimeEnvironment,
  runtimeExecutablePaths,
  validRuntimeEnvironment
} from './runtime-environment'

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

export interface WorkbenchSessionIdentity {
  workspacePath: string
  osProjectPath: string
  environmentPath: string
  graphPath: string
  graphFingerprint: string
  backendUrl: string
  pid: number
  generation: string
  logPath: string
  mode: 'simulation'
  packageMounts: WorkspacePackageMountProjection | null
  agent: WorkbenchAgentIdentity | null
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
  identity: WorkbenchSessionIdentity | null
  diagnostic: WorkbenchSessionDiagnostic | null
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
}

export interface WorkbenchSession {
  getSnapshot(): WorkbenchSessionSnapshot
  onDidChange(listener: (snapshot: WorkbenchSessionSnapshot) => void): {
    dispose(): void
  }
  start(): Promise<WorkbenchSessionSnapshot>
  stop(): Promise<WorkbenchSessionSnapshot>
  restart(): Promise<WorkbenchSessionSnapshot>
  readLogTail(maxBytes?: number): Promise<string>
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

/** Create the single managed OS lifecycle owned by one Workbench window. */
export function createManagedLocalWorkbenchSession(
  options: ManagedLocalWorkbenchSessionOptions
): WorkbenchSession {
  return new ManagedLocalWorkbenchSession(options)
}

class ManagedLocalWorkbenchSession implements WorkbenchSession {
  private snapshot: WorkbenchSessionSnapshot = {
    phase: 'idle',
    message: '尚未启动 Uni-Lab OS',
    identity: null,
    diagnostic: null
  }
  private readonly listeners = new Set<(
    snapshot: WorkbenchSessionSnapshot
  ) => void>()
  private child: ChildProcessWithoutNullStreams | null = null
  private agent: ManagedWorkbenchAgent | null = null
  private starting: Promise<WorkbenchSessionSnapshot> | null = null
  private expectedExit = false
  private stopRequested = false

  constructor(private readonly options: ManagedLocalWorkbenchSessionOptions) {}

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
    if (this.snapshot.phase === 'ready') return Promise.resolve(this.getSnapshot())
    if (this.starting) return this.starting
    this.stopRequested = false
    this.starting = this.startManaged()
    return this.starting.finally(() => {
      this.starting = null
    })
  }

  async stop(): Promise<WorkbenchSessionSnapshot> {
    this.stopRequested = true
    const agent = this.agent
    this.agent = null
    if (agent) await agent.stop()
    if (!this.child) {
      this.publish({
        phase: 'idle',
        message: 'Uni-Lab OS 已停止',
        identity: null,
        diagnostic: null
      })
      return this.getSnapshot()
    }
    this.publish({
      ...this.snapshot,
      phase: 'stopping',
      message: '正在安全停止 Uni-Lab OS…',
      diagnostic: null
    })
    this.expectedExit = true
    const child = this.child
    this.child = null
    await stopProcessTree(child)
    this.expectedExit = false
    this.publish({
      phase: 'idle',
      message: 'Uni-Lab OS 已停止',
      identity: null,
      diagnostic: null
    })
    return this.getSnapshot()
  }

  async restart(): Promise<WorkbenchSessionSnapshot> {
    await this.stop()
    return await this.start()
  }

  async readLogTail(maxBytes = 64 * 1024): Promise<string> {
    if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > 1024 * 1024) {
      throw new Error('Workbench 日志读取上限必须在 1–1048576 字节之间')
    }
    const logPath = this.snapshot.identity?.logPath
    if (!logPath) return ''
    try {
      const content = await readFile(logPath)
      return content.subarray(Math.max(0, content.length - maxBytes)).toString('utf8')
    } catch (error) {
      if (isRecord(error) && error['code'] === 'ENOENT') return ''
      throw error
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
      launch = await resolveWorkbenchLaunch(this.options)
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
        if (!this.expectedExit && this.snapshot.phase !== 'failed') {
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
      if (this.options.enableAgent) {
        const editableMount = launch.identity.packageMounts.items.find(
          item => item.packageId ===
            launch.identity.packageMounts?.editablePackageId
        )
        if (!editableMount) throw new Error('OS 未发布 Editable Package 挂载')
        const editablePackagePath = fileURLToPath(editableMount.packageRootUri)
        try {
          const agent = await startManagedWorkbenchAgent({
            workspacePath: launch.identity.workspacePath,
            editablePackagePath,
            environment: launch.environment,
            appPath: this.options.agentAppPath,
            brandIconPath: this.options.agentBrandIconPath,
            onUnexpectedExit: message => {
              if (!this.snapshot.identity) return
              this.publish({
                ...this.snapshot,
                identity: {
                  ...this.snapshot.identity,
                  agent: {
                    implementation: 'aioncore',
                    productName: 'UniLab Agent',
                    distributionVersion: 'unknown',
                    phase: 'failed',
                    url: null,
                    iconUrl: null,
                    pid: null,
                    dataDir: join(
                      launch.identity.workspacePath,
                      '.unilabos',
                      'agent',
                      'aionui'
                    ),
                    workDir: editablePackagePath,
                    logPath: join(
                      launch.identity.workspacePath,
                      '.unilabos',
                      'agent',
                      'aionui',
                      'logs',
                      'aioncore.log'
                    ),
                    diagnostic: message
                  }
                }
              })
            }
          })
          if (this.stopRequested) {
            await agent.stop()
            return this.getSnapshot()
          }
          this.agent = agent
          launch.identity.agent = agent.identity
        } catch (error) {
          if (this.stopRequested) return this.getSnapshot()
          launch.identity.agent = {
            implementation: 'aioncore',
            productName: 'UniLab Agent',
            distributionVersion: 'unknown',
            phase: 'failed',
            url: null,
            iconUrl: null,
            pid: null,
            dataDir: join(
              launch.identity.workspacePath,
              '.unilabos',
              'agent',
              'aionui'
            ),
            workDir: editablePackagePath,
            logPath: join(
              launch.identity.workspacePath,
              '.unilabos',
              'agent',
              'aionui',
              'logs',
              'aioncore.log'
            ),
            diagnostic: error instanceof Error ? error.message : String(error)
          }
        }
      }
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
      if (agent) await agent.stop()
      const child = this.child
      this.child = null
      if (child) {
        this.expectedExit = true
        await stopProcessTree(child)
        this.expectedExit = false
      }
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

  private publish(snapshot: WorkbenchSessionSnapshot): void {
    this.snapshot = cloneSnapshot(snapshot)
    for (const listener of this.listeners) listener(this.getSnapshot())
  }
}

async function resolveWorkbenchLaunch(
  options: ManagedLocalWorkbenchSessionOptions
): Promise<ResolvedWorkbenchLaunch> {
  const environment = options.environment ?? process.env
  const platform = options.platform ?? process.platform
  const homeDirectory = options.homeDirectory ?? homedir()
  const workspacePath = await requireRealDirectory(
    options.workspacePath,
    'invalid_workspace',
    '所选 Workspace 不存在'
  )
  const localConfigPath = join(workspacePath, 'deployment', 'local_config.py')
  await requireReadableFile(
    localConfigPath,
    'invalid_workspace',
    '所选 Workspace 缺少 deployment/local_config.py'
  )
  const graphPath = await requireRealFile(
    options.graphPath
      ? resolve(workspacePath, options.graphPath)
      : join(workspacePath, 'deployment', 'graphs', 'szlab-local-debug.json'),
    'invalid_workspace',
    '所选 Workspace 缺少 deployment/graphs/szlab-local-debug.json'
  )
  ensureInsideWorkspace(workspacePath, graphPath)

  const osProjectCandidate = options.osProjectPath
    ?? environment['UNILAB_OS_PROJECT']
  if (!osProjectCandidate) {
    throw new WorkbenchLaunchError(
      'invalid_os_project',
      '未选择 Uni-Lab-OS 项目目录',
      '设置 UNILAB_OS_PROJECT 或在 Workbench 启动配置中选择 OS 项目'
    )
  }
  const osProjectPath = await requireRealDirectory(
    osProjectCandidate,
    'invalid_os_project',
    'Uni-Lab-OS 项目目录不存在'
  )
  await requireRealDirectory(
    join(osProjectPath, 'unilabos'),
    'invalid_os_project',
    '所选目录不是有效的 Uni-Lab-OS 项目'
  )

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
  const graphFingerprint = createHash('sha256')
    .update(await readFile(graphPath))
    .digest('hex')
  const identity: WorkbenchSessionIdentity = {
    workspacePath,
    osProjectPath,
    environmentPath,
    graphPath,
    graphFingerprint,
    backendUrl: `http://${LOOPBACK_HOST}:${backendPort}`,
    pid: 0,
    generation,
    logPath,
    mode: 'simulation',
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
      graphPath,
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
      'simulate',
      '--external_devices_only',
      '--ros_discovery_server',
      'off'
    ],
    cwd: workspacePath,
    environment: {
      ...activatedRuntimeEnvironment(environmentPath, platform, environment),
      PYTHONPATH: mergePathList(
        [osProjectPath, workspacePath, environment['PYTHONPATH']],
        platform === 'win32' ? ';' : ':'
      ),
      PYTHONUNBUFFERED: '1',
      UNILABOS_HOSTLINKCONFIG_PORT: String(hostLinkPort),
      UNILABOS_OBSERVABILITYCONFIG_ENABLED: 'true',
      UNILABOS_OBSERVABILITYCONFIG_PROJECT_NAME: 'uni-lab-workbench',
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
  for (const rule of ['runtime/', 'logs/', 'agent/', '.gitignore']) {
    if (lines.has(rule)) continue
    lines.add(rule)
    changed = true
  }
  if (changed || !existing) {
    await writeFile(ignorePath, `${[...lines].join('\n')}\n`, { mode: 0o600 })
  }
}

async function waitForWorkbenchReadiness(
  backendUrl: string,
  child: ChildProcessWithoutNullStreams,
  timeoutMs: number
): Promise<WorkspacePackageMountProjection> {
  const probes: Array<[string, (payload: unknown) => boolean]> = [
    ['/api/v1/health', isHealthReady],
    ['/api/v1/workflow-node-templates', isSuccessfulEnvelope],
    ['/api/v1/devices', isSuccessfulEnvelope]
  ]
  for (const [path, accepts] of probes) {
    const deadline = Date.now() + timeoutMs
    let ready = false
    while (Date.now() < deadline) {
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new WorkbenchLaunchError(
          'os_readiness_failed',
          `Uni-Lab OS 在 ${path} 就绪前退出`,
          '检查 OS 启动日志并修复依赖或配置错误'
        )
      }
      try {
        const response = await fetch(`${backendUrl}${path}`, {
          signal: AbortSignal.timeout(1_000)
        })
        if (response.ok && accepts(await response.json())) {
          ready = true
          break
        }
      } catch {
        // The managed process is still starting.
      }
      await delay(200)
    }
    if (!ready) {
      throw new WorkbenchLaunchError(
        'os_readiness_failed',
        `等待 Uni-Lab OS 就绪超时：${backendUrl}${path}`,
        '检查 OS 日志、依赖和端口占用后重试'
      )
    }
  }
  const mountPayload = await fetchWorkbenchReadinessPayload(
    backendUrl,
    child,
    '/api/v1/workspace/package-mounts',
    timeoutMs
  )
  return parseWorkspacePackageMountProjection(mountPayload)
}

async function fetchWorkbenchReadinessPayload(
  backendUrl: string,
  child: ChildProcessWithoutNullStreams,
  path: string,
  timeoutMs: number
): Promise<unknown> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new WorkbenchLaunchError(
        'os_readiness_failed',
        `Uni-Lab OS 在 ${path} 就绪前退出`,
        '检查 OS 启动日志并修复依赖或配置错误'
      )
    }
    try {
      const response = await fetch(`${backendUrl}${path}`, {
        signal: AbortSignal.timeout(1_000)
      })
      if (response.ok) return await response.json()
    } catch {
      // The managed process is still publishing the fixed workspace generation.
    }
    await delay(200)
  }
  throw new WorkbenchLaunchError(
    'os_readiness_failed',
    `等待 Uni-Lab OS 就绪超时：${backendUrl}${path}`,
    '确认 OS 版本支持 workspace-package-mounts/v1 后重试'
  )
}

export function parseWorkspacePackageMountProjection(
  payload: unknown
): WorkspacePackageMountProjection {
  if (!isRecord(payload) || payload['code'] !== 0 || !isRecord(payload['data'])) {
    throw new WorkbenchLaunchError(
      'os_readiness_failed',
      'Uni-Lab OS 未返回有效的 Workspace 软件包挂载信封',
      '升级到支持 workspace-package-mounts/v1 的 Uni-Lab OS'
    )
  }
  const data = payload['data']
  const items = data['items']
  if (
    data['schemaVersion'] !== 'workspace-package-mounts/v1' ||
    !nonEmptyString(data['editablePackageId']) ||
    !nonEmptyString(data['dependencyRevision']) ||
    !nonEmptyString(data['catalogRevision']) ||
    !nonEmptyString(data['mountRevision']) ||
    !Array.isArray(items) || items.length === 0
  ) {
    throw new WorkbenchLaunchError(
      'os_readiness_failed',
      'Uni-Lab OS Workspace 软件包挂载投影形状无效',
      '检查 OS 包目录编译诊断并重新启动 Workbench'
    )
  }
  const parsedItems = items.map(parseWorkspacePackageMount)
  const packageIds = new Set(parsedItems.map(item => item.packageId))
  const editableItems = parsedItems.filter(item => item.editable)
  if (
    packageIds.size !== parsedItems.length || editableItems.length !== 1 ||
    editableItems[0]?.packageId !== data['editablePackageId']
  ) {
    throw new WorkbenchLaunchError(
      'os_readiness_failed',
      'Uni-Lab OS Workspace 软件包挂载身份冲突',
      '修复重复包身份或可编辑包选择后重试'
    )
  }
  return {
    schemaVersion: 'workspace-package-mounts/v1',
    editablePackageId: data['editablePackageId'],
    dependencyRevision: data['dependencyRevision'],
    catalogRevision: data['catalogRevision'],
    mountRevision: data['mountRevision'],
    items: parsedItems
  }
}

function parseWorkspacePackageMount(value: unknown): WorkspacePackageMount {
  if (
    !isRecord(value) ||
    !nonEmptyString(value['packageId']) ||
    !nonEmptyString(value['distributionName']) ||
    !nonEmptyString(value['version']) ||
    !nonEmptyString(value['namespace']) ||
    typeof value['editable'] !== 'boolean' ||
    value['readOnly'] !== !value['editable'] ||
    value['sourceKind'] !== 'workspace' ||
    !fileUri(value['importRootUri']) ||
    !fileUri(value['packageRootUri']) ||
    !nonEmptyString(value['contentDigest']) ||
    !nonEmptyString(value['catalogDigest'])
  ) {
    throw new WorkbenchLaunchError(
      'os_readiness_failed',
      'Uni-Lab OS 返回了无效的软件包挂载项',
      '检查 OS PackageCatalog 与 WorkspaceSource 配对'
    )
  }
  return {
    packageId: value['packageId'],
    distributionName: value['distributionName'],
    version: value['version'],
    namespace: value['namespace'],
    editable: value['editable'],
    readOnly: value['readOnly'],
    sourceKind: 'workspace',
    importRootUri: value['importRootUri'],
    packageRootUri: value['packageRootUri'],
    contentDigest: value['contentDigest'],
    catalogDigest: value['catalogDigest']
  }
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && Boolean(value.trim())
}

function fileUri(value: unknown): value is string {
  if (!nonEmptyString(value)) return false
  try {
    return new URL(value).protocol === 'file:'
  } catch {
    return false
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
  const pathCandidates = (environment['PATH'] ?? '')
    .split(platform === 'win32' ? ';' : ':')
    .filter(Boolean)
    .map(pathEntry => platform === 'win32'
      ? dirname(pathEntry)
      : dirname(pathEntry))
  const candidates = [
    environment['CONDA_PREFIX'],
    ...pathCandidates,
    join(homeDirectory, 'miniforge3', 'envs', 'unilab'),
    join(homeDirectory, 'mambaforge', 'envs', 'unilab'),
    join(homeDirectory, 'miniconda3', 'envs', 'unilab'),
    join(homeDirectory, 'anaconda3', 'envs', 'unilab'),
    join(homeDirectory, '.conda', 'envs', 'unilab'),
    join(homeDirectory, '.micromamba', 'envs', 'unilab')
  ]
  const visited = new Set<string>()
  for (const candidate of candidates) {
    if (!candidate) continue
    const normalizedCandidate = normalize(resolve(candidate))
    if (visited.has(normalizedCandidate)) continue
    visited.add(normalizedCandidate)
    const resolvedCandidate = await validRuntimeEnvironment(
      normalizedCandidate,
      platform
    )
    if (resolvedCandidate) return resolvedCandidate
  }
  return null
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

function isHealthReady(payload: unknown): boolean {
  return isRecord(payload) && payload['status'] === 'ok'
}

function isSuccessfulEnvelope(payload: unknown): boolean {
  return isRecord(payload) && payload['code'] === 0
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

class WorkbenchLaunchError extends Error {
  readonly diagnostic: WorkbenchSessionDiagnostic

  constructor(
    code: WorkbenchSessionDiagnostic['code'],
    message: string,
    recovery: string
  ) {
    super(message)
    this.diagnostic = { code, message, recovery }
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolveDelay => setTimeout(resolveDelay, milliseconds))
}
