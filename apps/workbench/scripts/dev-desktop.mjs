/**
 * Keep Workbench Desktop alive with Theia/extension watchers.
 *
 * Initial assets still come from `pnpm build:desktop`. This script then runs:
 * - `@unilab/workbench-theia` tsc watch (extension lib/)
 * - `theia build --watch` (browser/node bundles; picks up package `src` exports)
 * - `start-workbench.mjs --desktop`
 *
 * UI package edits rebuild through Theia watch; refresh the Electron window after
 * the bundle finishes. Electron main/preload still need a full desktop rebuild.
 */
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const workbenchDirectory = path.resolve(scriptDirectory, '..')
const workspaceRoot = path.resolve(workbenchDirectory, '../..')
const workbenchRequire = createRequire(path.join(workbenchDirectory, 'package.json'))
const theiaCli = workbenchRequire.resolve('@theia/cli/bin/theia.js')
const startScript = path.join(scriptDirectory, 'start-workbench.mjs')
const forwardedArguments = process.argv.slice(2)
const pnpmExecutable = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

/** @type {{ label: string, child: import('node:child_process').ChildProcess }[]} */
const children = []
let stopping = false

console.log('[UniLab Workbench] desktop watch mode')
console.log(
  '[UniLab Workbench] package/UI edits rebuild via Theia watch; refresh Electron after rebuild'
)
console.log(
  '[UniLab Workbench] Electron main/preload changes still need `pnpm workbench:desktop` restart'
)

start('workbench-theia', pnpmExecutable, [
  '--filter',
  '@unilab/workbench-theia',
  'watch'
], {
  cwd: workspaceRoot,
  shell: process.platform === 'win32'
})

start('theia-bundle', process.execPath, [
  theiaCli,
  'build',
  '--watch',
  '--mode',
  'development'
], {
  cwd: workbenchDirectory
})

start('desktop', process.execPath, [
  startScript,
  '--desktop',
  ...forwardedArguments
], {
  cwd: workbenchDirectory
})

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

/**
 * @param {string} label
 * @param {string} command
 * @param {string[]} args
 * @param {import('node:child_process').SpawnOptions} [options]
 */
function start(label, command, args, options = {}) {
  console.log(`[UniLab Workbench] starting ${label}`)
  const child = spawn(command, args, {
    stdio: 'inherit',
    env: process.env,
    ...options
  })
  children.push({ label, child })
  child.once('error', error => {
    console.error(`[UniLab Workbench] ${label} failed: ${error.message}`)
    shutdown('SIGTERM')
    process.exitCode = 1
  })
  child.once('exit', (code, signal) => {
    if (stopping) return
    if (label === 'desktop') {
      shutdown(signal ?? 'SIGTERM')
      if (process.exitCode === undefined) {
        process.exitCode = signal ? 1 : code ?? 0
      }
      return
    }
    console.error(
      `[UniLab Workbench] ${label} exited code=${String(code)} signal=${String(signal)}`
    )
    shutdown('SIGTERM')
    process.exitCode = 1
  })
}

/** @param {NodeJS.Signals | string} signal */
function shutdown(signal) {
  if (stopping) return
  stopping = true
  for (const { child } of children) {
    if (!child.killed) {
      child.kill(signal === 'SIGINT' || signal === 'SIGTERM' ? signal : 'SIGTERM')
    }
  }
}
