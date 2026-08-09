import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

import {
  createWorkbenchRendererUrl,
  discoverWorkbenchPythonEnvironment,
  resolveWorkbenchLaunchConfiguration
} from './workbench-launch.mjs'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(scriptDirectory, '../../..')
const desktopRoot = path.join(workspaceRoot, 'apps', 'desktop')
const launch = resolveWorkbenchLaunchConfiguration(process.argv.slice(2))
const launchMode = launch.mode
const workspace = launch.workspace
const osProject = launch.osProject
const port = launch.port

if (!existsSync(workspace)) {
  throw new Error(`Workspace does not exist: ${workspace}`)
}
if (!osProject) {
  throw new Error(
    'UNILAB_OS_PROJECT must point to the local Uni-Lab-OS checkout'
  )
}
if (!existsSync(path.resolve(osProject))) {
  throw new Error(`Uni-Lab-OS project does not exist: ${osProject}`)
}
const pythonEnvironment = await discoverWorkbenchPythonEnvironment({
  selected: launch.pythonEnvironment
})

console.log(`[UniLab Workbench] workspace: ${workspace}`)
console.log(`[UniLab Workbench] OS project: ${path.resolve(osProject)}`)
console.log('[UniLab Workbench] OS lifecycle: managed-local')
console.log(`[UniLab Workbench] shell: ${launchMode}`)
console.log(`[UniLab Workbench] Python environment: ${pythonEnvironment}`)

const activatedEnvironment = {
  ...process.env,
  CONDA_PREFIX: pythonEnvironment,
  CONDA_DEFAULT_ENV: path.basename(pythonEnvironment),
  PATH: [
    path.join(
      pythonEnvironment,
      process.platform === 'win32' ? 'Scripts' : 'bin'
    ),
    process.env.PATH
  ].filter(Boolean).join(path.delimiter),
  PYTHONPATH: [
    path.resolve(osProject),
    workspace,
    process.env.PYTHONPATH
  ].filter(Boolean).join(path.delimiter),
  UNILAB_AGENT_ICON: process.env.UNILAB_AGENT_ICON ??
    path.join(desktopRoot, 'build', 'icon.png')
}

// Interactive zsh reads the user's startup files after inheriting this process'
// environment. A common `conda init` setup auto-activates `base` there, which
// would make the terminal disagree with Pyright and the managed OS process.
// Source the user's normal rc first, then re-activate the Workbench environment.
if (process.platform !== 'win32' && process.env.SHELL?.endsWith('/zsh')) {
  const shellRuntime = path.join(
    workspace,
    '.unilabos',
    'runtime',
    'workbench',
    'terminal',
    'zsh'
  )
  const originalZdotdir = process.env.ZDOTDIR ?? os.homedir()
  mkdirSync(shellRuntime, { recursive: true })
  writeFileSync(
    path.join(shellRuntime, '.zshrc'),
    [
      'if [[ -r "${UNILAB_ORIGINAL_ZDOTDIR}/.zshrc" ]]; then',
      '  source "${UNILAB_ORIGINAL_ZDOTDIR}/.zshrc"',
      'fi',
      'if (( ${+functions[conda]} )); then',
      '  conda activate "${UNILAB_PYTHON_ENV}"',
      'else',
      '  export PATH="${UNILAB_PYTHON_ENV}/bin:${PATH}"',
      '  export CONDA_PREFIX="${UNILAB_PYTHON_ENV}"',
      '  export CONDA_DEFAULT_ENV="${UNILAB_PYTHON_ENV:t}"',
      '  rehash',
      'fi',
      ''
    ].join('\n'),
    { mode: 0o600 }
  )
  Object.assign(activatedEnvironment, {
    ZDOTDIR: shellRuntime,
    UNILAB_ORIGINAL_ZDOTDIR: originalZdotdir,
    UNILAB_PYTHON_ENV: pythonEnvironment
  })
}

const theia = spawn('theia', [
  'start',
  workspace,
  '--hostname',
  '127.0.0.1',
  '--port',
  String(port),
  '--plugins=local-dir:plugins'
], {
  stdio: 'inherit',
  env: {
    ...activatedEnvironment,
    THEIA_WORKSPACE: workspace,
    UNILAB_OS_PROJECT: path.resolve(osProject),
    UNILAB_PYTHON_ENV: pythonEnvironment
  }
})

let stopping = false
let desktopShell = null
const stop = signal => {
  if (stopping) return
  stopping = true
  if (desktopShell && !desktopShell.killed) desktopShell.kill(signal)
  if (!theia.killed) theia.kill(signal)
}
process.on('SIGINT', () => stop('SIGINT'))
process.on('SIGTERM', () => stop('SIGTERM'))
theia.once('exit', (code, signal) => {
  if (!stopping) {
    stopping = true
    if (desktopShell && !desktopShell.killed) desktopShell.kill('SIGTERM')
  }
  if (process.exitCode === undefined) {
    process.exitCode = signal ? 1 : code ?? 0
  }
})

if (launchMode === 'desktop') {
  const rendererUrl = createWorkbenchRendererUrl({
    port,
    workspace,
    workflowUuid: launch.workflowUuid
  })
  void launchDesktop(rendererUrl).catch(error => {
    console.error(
      `[UniLab Workbench] desktop launch failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
    process.exitCode = 1
    stop('SIGTERM')
  })
}

async function launchDesktop(rendererUrl) {
  await waitForWorkbench(rendererUrl)
  const desktopRequire = createRequire(path.join(desktopRoot, 'package.json'))
  const electronExecutable = desktopRequire('electron')
  const desktopEnvironment = {
    ...activatedEnvironment,
    UNILAB_DESKTOP_SURFACE: 'workbench',
    UNILAB_DESKTOP_RENDERER_URL: rendererUrl,
    UNILAB_DESKTOP_OPEN_DEVTOOLS:
      process.env.UNILAB_DESKTOP_OPEN_DEVTOOLS ?? '0'
  }
  delete desktopEnvironment.ELECTRON_RUN_AS_NODE
  console.log(`[UniLab Workbench] desktop renderer: ${rendererUrl}`)
  desktopShell = spawn(electronExecutable, [desktopRoot], {
    cwd: desktopRoot,
    env: desktopEnvironment,
    stdio: 'inherit'
  })
  desktopShell.once('error', error => {
    console.error(`[UniLab Workbench] Electron failed: ${error.message}`)
    process.exitCode = 1
    stop('SIGTERM')
  })
  desktopShell.once('exit', (code, signal) => {
    if (!stopping) {
      stopping = true
      if (!theia.killed) theia.kill('SIGTERM')
    }
    if (process.exitCode === undefined) {
      process.exitCode = signal ? 1 : code ?? 0
    }
  })
}

async function waitForWorkbench(rendererUrl) {
  const deadline = Date.now() + 30_000
  const readinessUrl = new URL('/', rendererUrl)
  let lastError = 'not ready'
  while (Date.now() < deadline) {
    if (theia.exitCode !== null) {
      throw new Error(`Theia exited before readiness (${theia.exitCode})`)
    }
    try {
      const response = await fetch(readinessUrl, {
        signal: AbortSignal.timeout(1_000)
      })
      if (response.ok) return
      lastError = `HTTP ${response.status}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  throw new Error(`Theia readiness timed out: ${lastError}`)
}
