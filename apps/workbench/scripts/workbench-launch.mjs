import { constants as fsConstants } from 'node:fs'
import { access, realpath } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export const WORKBENCH_DESKTOP_FLAG = '--desktop'
export const WORKBENCH_REMOTE_FLAG = '--remote'

const VALUE_FLAGS = new Map([
  ['--workspace', 'workspace'],
  ['--os-project', 'osProject'],
  ['--python-env', 'pythonEnvironment'],
  ['--port', 'port'],
  ['--workflow', 'workflowUuid'],
  ['--remote-host', 'remoteHost'],
  ['--remote-port', 'remotePort'],
  ['--public-origin', 'publicOrigin'],
  ['--tls-cert', 'tlsCertificatePath'],
  ['--tls-key', 'tlsKeyPath'],
  ['--token-ttl-seconds', 'tokenTtlSeconds'],
  ['--access-url-file', 'accessUrlFile']
])

const REMOTE_VALUE_KEYS = new Set([
  'remoteHost',
  'remotePort',
  'publicOrigin',
  'tlsCertificatePath',
  'tlsKeyPath',
  'tokenTtlSeconds',
  'accessUrlFile'
])

/** Parse one explicit Workbench launch selection without accepting silent typos. */
export function resolveWorkbenchLaunchConfiguration(
  argv,
  environment = process.env,
  currentDirectory = process.cwd()
) {
  const { values, desktop, remote } = parseWorkbenchArguments(argv)
  const rawPort = values.port ?? environment.THEIA_PORT ?? '3100'
  const port = Number(rawPort)
  if (!Number.isInteger(port) || port < 1024 || port > 65_535) {
    throw new Error(`Workbench port must be between 1024 and 65535: ${rawPort}`)
  }
  if (!remote && [...REMOTE_VALUE_KEYS].some(key => values[key] !== undefined)) {
    throw new Error('Remote Workbench options require --remote')
  }
  const mode = desktop && remote
    ? 'desktop-remote'
    : desktop ? 'desktop' : remote ? 'remote' : 'browser'
  return {
    mode,
    workspace: path.resolve(
      values.workspace ?? environment.THEIA_WORKSPACE ?? currentDirectory
    ),
    osProject: values.osProject ?? environment.UNILAB_OS_PROJECT ?? null,
    pythonEnvironment: values.pythonEnvironment ??
      environment.UNILAB_PYTHON_ENV ?? null,
    port,
    workflowUuid: values.workflowUuid ?? environment.UNILAB_WORKFLOW_UUID ?? null,
    remote: remote ? resolveRemoteConfiguration({
      values,
      environment,
      currentDirectory,
      backendPort: port
    }) : null
  }
}

/** Resolves the single supported launch-mode flag and rejects silent typos. */
export function resolveWorkbenchLaunchMode(argv) {
  return resolveWorkbenchLaunchConfiguration(argv).mode
}

/**
 * Bootstrap discovery for Theia/Terminal/LSP. The managed session validates the
 * same selected environment again before it starts OS and remains authoritative.
 */
export async function discoverWorkbenchPythonEnvironment({
  selected,
  environment = process.env,
  homeDirectory = os.homedir(),
  platform = process.platform
}) {
  const candidates = selected
    ? [selected]
    : [
        environment.CONDA_PREFIX,
        ...(environment.PATH ?? '')
          .split(path.delimiter)
          .filter(Boolean)
          .map(entry => platform === 'win32'
            ? path.dirname(entry)
            : path.dirname(entry)),
        path.join(homeDirectory, 'miniforge3', 'envs', 'unilab'),
        path.join(homeDirectory, 'mambaforge', 'envs', 'unilab'),
        path.join(homeDirectory, 'miniconda3', 'envs', 'unilab'),
        path.join(homeDirectory, 'anaconda3', 'envs', 'unilab'),
        path.join(homeDirectory, '.conda', 'envs', 'unilab'),
        path.join(homeDirectory, '.micromamba', 'envs', 'unilab')
      ]
  const visited = new Set()
  for (const candidate of candidates) {
    if (!candidate) continue
    const normalized = path.normalize(path.resolve(candidate))
    if (visited.has(normalized)) continue
    visited.add(normalized)
    const resolved = await validWorkbenchPythonEnvironment(normalized, platform)
    if (resolved) return resolved
  }
  if (selected) {
    throw new Error(
      `Selected Python environment does not contain executable Python and unilab CLI: ${selected}`
    )
  }
  throw new Error(
    'No compatible Python environment found; use --python-env or activate the UniLab OS Conda environment'
  )
}

async function validWorkbenchPythonEnvironment(candidate, platform) {
  try {
    const resolved = await realpath(candidate)
    const executables = platform === 'win32'
      ? [path.join(resolved, 'python.exe'), path.join(resolved, 'Scripts', 'unilab.exe')]
      : [path.join(resolved, 'bin', 'python'), path.join(resolved, 'bin', 'unilab')]
    await Promise.all(executables.map(executable => access(
      executable,
      fsConstants.R_OK | fsConstants.X_OK
    )))
    return resolved
  } catch {
    return null
  }
}

/** Creates the trusted loopback URL loaded by the shared Electron shell. */
export function createWorkbenchRendererUrl({
  port,
  workspace,
  workflowUuid
}) {
  const url = new URL(`http://127.0.0.1:${port}/`)
  if (workflowUuid) url.searchParams.set('workflowUuid', workflowUuid)
  url.hash = workspace
  return url.toString()
}

/**
 * Mirrors the executable search path produced by activating a Conda
 * environment. Windows needs the environment root and its Library directories,
 * while POSIX environments expose their tools from one bin directory.
 */
export function workbenchEnvironmentPathEntries(
  pythonEnvironment,
  platform = process.platform
) {
  if (platform !== 'win32') {
    return [path.posix.join(pythonEnvironment, 'bin')]
  }
  const join = path.win32.join
  return [
    pythonEnvironment,
    join(pythonEnvironment, 'Scripts'),
    join(pythonEnvironment, 'Library', 'mingw-w64', 'bin'),
    join(pythonEnvironment, 'Library', 'usr', 'bin'),
    join(pythonEnvironment, 'Library', 'bin'),
    join(pythonEnvironment, 'bin')
  ]
}

function resolveRemoteConfiguration({
  values,
  environment,
  currentDirectory,
  backendPort
}) {
  const rawPort = values.remotePort
    ?? environment.UNILAB_REMOTE_PORT
    ?? String(backendPort + 1)
  const remotePort = Number(rawPort)
  if (!Number.isInteger(remotePort) || remotePort < 1024 || remotePort > 65_535) {
    throw new Error(
      `Remote Workbench port must be between 1024 and 65535: ${rawPort}`
    )
  }
  if (remotePort === backendPort) {
    throw new Error('Remote Workbench facade port must differ from the Theia port')
  }
  const rawTtlSeconds = values.tokenTtlSeconds
    ?? environment.UNILAB_REMOTE_TOKEN_TTL_SECONDS
    ?? '43200'
  const tokenTtlSeconds = Number(rawTtlSeconds)
  if (
    !Number.isInteger(tokenTtlSeconds)
    || tokenTtlSeconds < 60
    || tokenTtlSeconds > 86_400
  ) {
    throw new Error(
      `Remote Workbench token TTL must be between 60 and 86400 seconds: ${rawTtlSeconds}`
    )
  }
  const pathValue = (value) => value ? path.resolve(currentDirectory, value) : null
  return {
    host: values.remoteHost ?? environment.UNILAB_REMOTE_HOST ?? '127.0.0.1',
    port: remotePort,
    publicOrigin: values.publicOrigin
      ?? environment.UNILAB_REMOTE_PUBLIC_ORIGIN
      ?? null,
    tlsCertificatePath: pathValue(
      values.tlsCertificatePath ?? environment.UNILAB_REMOTE_TLS_CERT
    ),
    tlsKeyPath: pathValue(
      values.tlsKeyPath ?? environment.UNILAB_REMOTE_TLS_KEY
    ),
    tokenTtlMs: tokenTtlSeconds * 1_000,
    accessUrlFile: pathValue(
      values.accessUrlFile ?? environment.UNILAB_REMOTE_ACCESS_URL_FILE
    )
  }
}

function parseWorkbenchArguments(argv) {
  const values = {}
  const modes = new Set()
  let separatorSeen = false
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--') {
      if (separatorSeen) throw new Error('Duplicate Workbench argument: --')
      separatorSeen = true
      continue
    }
    if (
      argument === WORKBENCH_DESKTOP_FLAG
      || argument === WORKBENCH_REMOTE_FLAG
    ) {
      if (modes.has(argument)) {
        throw new Error(`Duplicate Workbench argument: ${argument}`)
      }
      modes.add(argument)
      continue
    }
    const key = VALUE_FLAGS.get(argument)
    if (!key) throw new Error(`Unknown Workbench argument: ${argument}`)
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) {
      throw new Error(`Workbench argument ${argument} requires a value`)
    }
    if (values[key] !== undefined) {
      throw new Error(`Duplicate Workbench argument: ${argument}`)
    }
    values[key] = value
    index += 1
  }
  return {
    values,
    desktop: modes.has(WORKBENCH_DESKTOP_FLAG),
    remote: modes.has(WORKBENCH_REMOTE_FLAG)
  }
}
