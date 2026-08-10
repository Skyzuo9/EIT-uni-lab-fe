import { constants as fsConstants } from 'node:fs'
import { access, realpath } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export const WORKBENCH_DESKTOP_FLAG = '--desktop'

const VALUE_FLAGS = new Map([
  ['--workspace', 'workspace'],
  ['--os-project', 'osProject'],
  ['--python-env', 'pythonEnvironment'],
  ['--port', 'port'],
  ['--workflow', 'workflowUuid']
])

/** Parse one explicit Workbench launch selection without accepting silent typos. */
export function resolveWorkbenchLaunchConfiguration(
  argv,
  environment = process.env,
  currentDirectory = process.cwd()
) {
  const values = {}
  let desktop = false
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === WORKBENCH_DESKTOP_FLAG) {
      if (desktop) throw new Error(`Duplicate Workbench argument: ${argument}`)
      desktop = true
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
  const rawPort = values.port ?? environment.THEIA_PORT ?? '3100'
  const port = Number(rawPort)
  if (!Number.isInteger(port) || port < 1024 || port > 65_535) {
    throw new Error(`Workbench port must be between 1024 and 65535: ${rawPort}`)
  }
  return {
    mode: desktop ? 'desktop' : 'browser',
    workspace: path.resolve(
      values.workspace ?? environment.THEIA_WORKSPACE ?? currentDirectory
    ),
    osProject: values.osProject ?? environment.UNILAB_OS_PROJECT ?? null,
    pythonEnvironment: values.pythonEnvironment ??
      environment.UNILAB_PYTHON_ENV ?? null,
    port,
    workflowUuid: values.workflowUuid ?? environment.UNILAB_WORKFLOW_UUID ?? null
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
