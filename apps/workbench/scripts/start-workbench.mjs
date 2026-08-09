import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

const workspace = path.resolve(process.env.THEIA_WORKSPACE ?? process.cwd())
const osProject = process.env.UNILAB_OS_PROJECT
const pythonEnvironment = process.env.UNILAB_PYTHON_ENV
const port = Number(process.env.THEIA_PORT ?? 3100)

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
if (!Number.isInteger(port) || port < 1024 || port > 65_535) {
  throw new Error(`THEIA_PORT must be between 1024 and 65535: ${port}`)
}

console.log(`[UniLab Workbench] workspace: ${workspace}`)
console.log(`[UniLab Workbench] OS project: ${path.resolve(osProject)}`)
console.log('[UniLab Workbench] OS lifecycle: managed-local')
if (pythonEnvironment) {
  console.log(`[UniLab Workbench] Python environment: ${path.resolve(pythonEnvironment)}`)
}

const activatedEnvironment = pythonEnvironment
  ? {
      ...process.env,
      CONDA_PREFIX: path.resolve(pythonEnvironment),
      CONDA_DEFAULT_ENV: path.basename(path.resolve(pythonEnvironment)),
      PATH: [
        path.join(
          path.resolve(pythonEnvironment),
          process.platform === 'win32' ? 'Scripts' : 'bin'
        ),
        process.env.PATH
      ].filter(Boolean).join(path.delimiter),
      PYTHONPATH: [
        path.resolve(osProject),
        workspace,
        process.env.PYTHONPATH
      ].filter(Boolean).join(path.delimiter)
    }
  : process.env

// Interactive zsh reads the user's startup files after inheriting this process'
// environment. A common `conda init` setup auto-activates `base` there, which
// would make the terminal disagree with Pyright and the managed OS process.
// Source the user's normal rc first, then re-activate the Workbench environment.
if (pythonEnvironment && process.platform !== 'win32' && process.env.SHELL?.endsWith('/zsh')) {
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
    UNILAB_PYTHON_ENV: path.resolve(pythonEnvironment)
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
    UNILAB_OS_PROJECT: path.resolve(osProject)
  }
})

let stopping = false
const stop = signal => {
  if (stopping) return
  stopping = true
  if (!theia.killed) theia.kill(signal)
}
process.on('SIGINT', () => stop('SIGINT'))
process.on('SIGTERM', () => stop('SIGTERM'))
theia.once('exit', code => {
  process.exitCode = code ?? 0
})
