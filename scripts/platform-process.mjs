import { spawn as spawnChild } from 'node:child_process'
import { once } from 'node:events'
import { setTimeout as delay } from 'node:timers/promises'

/**
 * 把 pnpm 调用解析为跨平台的 Node CLI 调用。
 *
 * @param {string[]} args pnpm 参数。
 * @param {NodeJS.ProcessEnv} environment 当前包脚本环境。
 * @param {NodeJS.Platform} platform 当前平台。
 * @returns {{ command: string, args: string[] }} 不依赖 .cmd shell 的命令结构。
 */
export function pnpmInvocation(
  args,
  environment = process.env,
  platform = process.platform
) {
  const cliPath = environment.npm_execpath
  if (cliPath) {
    return {
      command: process.execPath,
      args: [cliPath, ...args]
    }
  }
  if (platform === 'win32') {
    throw new Error('Windows 门禁必须通过 pnpm script 启动，以定位 pnpm CLI。')
  }
  return { command: 'pnpm', args }
}

/**
 * 通过已解析的 Node CLI 启动 pnpm，避免 Windows 无法直接 exec pnpm.cmd。
 *
 * @param {string[]} args pnpm 参数。
 * @param {import('node:child_process').SpawnOptions} options 子进程选项。
 * @returns {import('node:child_process').ChildProcess} 已启动子进程。
 */
export function spawnPnpm(args, options = {}) {
  const invocation = pnpmInvocation(args, options.env ?? process.env)
  return spawnChild(invocation.command, invocation.args, options)
}

/**
 * 跨平台终止包装器拥有的完整子进程树。
 *
 * @param {import('node:child_process').ChildProcess | undefined} child 子进程。
 * @param {{ platform?: NodeJS.Platform, graceMs?: number }} options 平台与等待期。
 * @returns {Promise<void>} 子进程退出或终止命令完成时结束。
 */
export async function stopProcessTree(child, options = {}) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return
  const platform = options.platform ?? process.platform
  const graceMs = options.graceMs ?? 10_000
  if (platform === 'win32') {
    await runWindowsTreeKill(child.pid)
    if (child.exitCode === null && child.signalCode === null) {
      await Promise.race([once(child, 'exit'), delay(1_000)])
    }
    return
  }

  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch (error) {
    if (!isMissingProcess(error)) throw error
    return
  }
  await Promise.race([once(child, 'exit'), delay(graceMs)])
  if (child.exitCode === null && child.signalCode === null) {
    process.kill(-child.pid, 'SIGKILL')
    await once(child, 'exit')
  }
}

/** 使用系统 taskkill 强制终止指定 Windows PID 及全部后代。 */
async function runWindowsTreeKill(processId) {
  await new Promise((resolveResult, reject) => {
    const killer = spawnChild(
      'taskkill.exe',
      ['/pid', String(processId), '/t', '/f'],
      { windowsHide: true, stdio: 'ignore' }
    )
    killer.once('error', reject)
    killer.once('close', (code) => {
      if (code === 0 || code === 128) {
        resolveResult()
        return
      }
      reject(new Error(`taskkill.exe 退出码 ${String(code)}`))
    })
  })
}

/** 判断 POSIX 进程组是否已在终止前退出。 */
function isMissingProcess(error) {
  return error instanceof Error && 'code' in error && error.code === 'ESRCH'
}
