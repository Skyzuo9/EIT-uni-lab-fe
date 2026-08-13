import { spawn } from 'node:child_process'
import { once } from 'node:events'

import { pnpmInvocation, spawnPnpm } from './platform-process.mjs'

/**
 * 解析跨平台 Playwright 包装器参数。
 *
 * @param {string[]} argv `--env NAME=value`、可选 `--virtual-display` 与 `--` 后参数。
 * @returns {{ environment: NodeJS.ProcessEnv, virtualDisplay: boolean, args: string[] }}
 */
export function parseLauncherArguments(argv) {
  const environment = { ...process.env }
  const args = []
  let virtualDisplay = false
  let index = 0
  while (index < argv.length) {
    const argument = argv[index]
    if (argument === '--') {
      args.push(...argv.slice(index + 1))
      break
    }
    if (argument === '--virtual-display') {
      virtualDisplay = true
      index += 1
      continue
    }
    if (argument === '--env') {
      const assignment = argv[index + 1] ?? ''
      const separator = assignment.indexOf('=')
      if (separator <= 0) throw new Error(`无效环境变量赋值：${assignment}`)
      environment[assignment.slice(0, separator)] = assignment.slice(separator + 1)
      index += 2
      continue
    }
    throw new Error(`未知 Playwright 包装器参数：${argument}`)
  }
  if (args.length === 0) throw new Error('Playwright 包装器缺少测试参数。')
  return { environment, virtualDisplay, args }
}

/** 启动 Playwright；Linux headed 场景按需增加 Xvfb，Windows/macOS 直接运行。 */
export function startPlaywright({ environment, virtualDisplay, args }) {
  const pnpmArgs = ['exec', 'playwright', 'test', ...args]
  const options = { env: environment, stdio: 'inherit' }
  if (virtualDisplay && process.platform === 'linux') {
    const invocation = pnpmInvocation(pnpmArgs, environment)
    return spawn(
      'xvfb-run',
      ['-a', invocation.command, ...invocation.args],
      options
    )
  }
  return spawnPnpm(pnpmArgs, options)
}

/** 保存 Playwright 的真实退出状态。 */
async function main() {
  const child = startPlaywright(parseLauncherArguments(process.argv.slice(2)))
  const [code] = await once(child, 'exit')
  process.exitCode = code ?? 1
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
