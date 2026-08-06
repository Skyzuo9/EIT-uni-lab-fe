import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const packageJson = require.resolve('electron-vite/package.json')
const cli = resolve(dirname(packageJson), 'bin/electron-vite.js')
const env = { ...process.env }

delete env.ELECTRON_RUN_AS_NODE

const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], {
  env,
  stdio: 'inherit'
})

/** 报告 electron-vite 启动失败，并把失败状态传递给当前 Node 进程。 */
child.once('error', (error) => {
  console.error(`Failed to start electron-vite: ${error.message}`)
  process.exitCode = 1
})

/** 保留 electron-vite 的退出码或终止信号，确保调用方收到真实结果。 */
child.once('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exitCode = code ?? 1
})
